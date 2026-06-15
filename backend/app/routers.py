import io
import json
import inspect
from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy import func, distinct
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
import pandas as pd
from sqlmodel import select
from app.db import get_session
from app.models import Stock, DailyPrice, ScreeningPreset, PatternResult, BacktestResult, StrategyDefinition, User, DataSyncLog, StockSnapshot, FinancialMetric, FactorValue
from app.schemas import DateRangeRequest, DailyDataRequest, PriceRangeRequest, ScreeningRequest, ScreeningExportRequest, ScreeningResponse, PatternScanRequest, BacktestRequest, ExportRequest, PresetRequest, LoginRequest, AuthResponse, LogDeleteRequest, WatchGroupCreate, WatchGroupUpdate, WatchGroupReorder, WatchItemAdd, WatchItemMove, WatchItemNoteUpdate, WatchBatchImport, StockDetailResponse, StockBasicInfo, StockQuoteSnapshot, KLineItem, FinancialSummary, FactorValues, TechnicalIndicators, PatternRecord
from app.services.data_sync import sync_stock_list, sync_daily, validate_integrity
from app.services.screening import screen_stocks
from app.services.patterns import detect_patterns, PATTERN_NAMES
from app.services.strategies import get_strategy_map
from app.services.backtest import run_backtest
from app.services.cache import cache_get, cache_set
from app.services.auth import verify_password, issue_token, get_token_payload
from app.services.sector import (
    get_sector_list,
    get_sector_detail,
    get_sector_fund_flow_ranking,
    get_stock_sector_percentile,
)
from app.services.watchlist import (
    list_groups as wl_list_groups,
    create_group as wl_create_group,
    update_group as wl_update_group,
    delete_group as wl_delete_group,
    reorder_groups as wl_reorder_groups,
    add_item as wl_add_item,
    remove_item as wl_remove_item,
    update_item_note as wl_update_item_note,
    move_item as wl_move_item,
    batch_import as wl_batch_import,
    query_group_items as wl_query_group_items,
)
from app.services.realtime import (
    get_realtime_quotes,
    create_session as rt_create_session,
    get_session_snapshot as rt_get_session_snapshot,
    update_session_symbols as rt_update_session_symbols,
    add_session_symbols as rt_add_session_symbols,
    remove_session_symbols as rt_remove_session_symbols,
)

router = APIRouter(prefix="/api/v1")

def session_dep():
    session = get_session()
    try:
        yield session
    finally:
        session.close()

def auth_dep(authorization: str | None = Header(default=None), session=Depends(session_dep)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    token = authorization.replace("Bearer ", "")
    payload = get_token_payload(token)
    if not payload:
        raise HTTPException(status_code=401, detail="登录已过期")
    user = session.exec(select(User).where(User.username == payload["username"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user

def admin_dep(user=Depends(auth_dep)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限")
    return user

@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, session=Depends(session_dep)):
    user = session.exec(select(User).where(User.username == payload.username)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="账号或密码错误")
    token = issue_token(user.username, user.role)
    return {"token": token, "role": user.role}

@router.get("/stocks")
def list_stocks(keyword: str = "", limit: int = 20, offset: int = 0, session=Depends(session_dep)):
    query = select(Stock)
    if keyword:
        # Simple case-insensitive search
        query = query.where(Stock.symbol.contains(keyword) | Stock.name.contains(keyword))
    
    # Get total count efficiently
    # Note: For strict performance on large datasets, use select(func.count()).select_from(...)
    # But here fetching all id is fine for < 5000 stocks
    all_results = session.exec(query).all()
    total = len(all_results)
    
    # Pagination
    stocks = session.exec(query.offset(offset).limit(limit)).all()
    return {"total": total, "items": [s.dict() for s in stocks]}

@router.get("/stocks/query")
def search_stocks(keyword: str = "", limit: int = 20, offset: int = 0, session=Depends(session_dep)):
    query = select(Stock)
    if keyword:
        # Simple case-insensitive search
        query = query.where(Stock.symbol.contains(keyword) | Stock.name.contains(keyword))
    
    total = len(session.exec(query).all())
    stocks = session.exec(query.offset(offset).limit(limit)).all()
    return {"total": total, "items": [s.dict() for s in stocks]}

from fastapi import BackgroundTasks

# Simple in-memory progress tracking
SYNC_STATE = {
    "status": "idle", # idle, running, finished, error
    "type": None, # stock_list, daily
    "current": 0,
    "total": 0,
    "message": ""
}

def update_progress(current, total, message=""):
    SYNC_STATE["current"] = current
    SYNC_STATE["total"] = total
    SYNC_STATE["message"] = message

@router.get("/data/sync/progress")
def get_sync_progress():
    return SYNC_STATE



def run_sync_stock_list_task():
    global SYNC_STATE
    SYNC_STATE.update({"status": "running", "type": "stock_list", "current": 0, "total": 0, "message": "正在启动..."})
    try:
        # Create a new session for the background task
        with get_session() as session:
            count = sync_stock_list(session, progress_callback=update_progress)
            SYNC_STATE.update({"status": "running", "current": count, "total": count, "message": f"股票清单同步完成，正在更新快照..."})
            
            # 自动更新快照
            from app.services.snapshot_updater import update_stock_snapshots
            snapshot_count = update_stock_snapshots(session, progress_callback=update_progress)
            
            SYNC_STATE.update({"status": "finished", "current": count, "total": count, "message": f"任务全部完成。已同步 {count} 只股票，更新 {snapshot_count} 个快照。"})
    except Exception as e:
        print(f"Background task failed: {e}")
        SYNC_STATE.update({"status": "error", "message": f"任务执行失败: {str(e)}"})

def run_sync_daily_task(symbols, start_date, end_date, sync_type):
    global SYNC_STATE
    SYNC_STATE.update({"status": "running", "type": "daily", "current": 0, "total": len(symbols), "message": "正在启动..."})
    try:
        # Create a new session for the background task
        with get_session() as session:
            count = sync_daily(session, symbols, start_date, end_date, sync_type, progress_callback=update_progress)
            SYNC_STATE.update({"status": "running", "current": len(symbols), "total": len(symbols), "message": f"日线数据同步完成，正在更新快照..."})
            
            # 自动更新快照
            from app.services.snapshot_updater import update_stock_snapshots
            snapshot_count = update_stock_snapshots(session, progress_callback=update_progress)
            
            SYNC_STATE.update({"status": "finished", "current": len(symbols), "total": len(symbols), "message": f"任务全部完成。已同步 {count} 条记录，更新 {snapshot_count} 个快照。"})
    except Exception as e:
        print(f"Background task failed: {e}")
        SYNC_STATE.update({"status": "error", "message": f"任务执行失败: {str(e)}"})


@router.post("/data/sync/stocks")
def sync_stocks(background_tasks: BackgroundTasks, session=Depends(session_dep), user=Depends(admin_dep)):
    if SYNC_STATE["status"] == "running":
        raise HTTPException(status_code=400, detail="Task already running")
    background_tasks.add_task(run_sync_stock_list_task)
    return {"status": "started", "message": "Stock sync started in background"}

@router.post("/data/sync/daily")
def sync_daily_data(payload: DateRangeRequest, background_tasks: BackgroundTasks, session=Depends(session_dep), user=Depends(admin_dep)):
    if SYNC_STATE["status"] == "running":
        raise HTTPException(status_code=400, detail="Task already running")
    
    symbols = payload.symbols or [s.symbol for s in session.exec(select(Stock)).all()]
    if not symbols:
        raise HTTPException(status_code=400, detail="无可同步股票")
    
    background_tasks.add_task(run_sync_daily_task, symbols, payload.start_date, payload.end_date, payload.sync_type)
    return {"status": "started", "count": len(symbols)}

# 导入快照更新服务
from app.services.snapshot_updater import update_stock_snapshots

def run_snapshot_update_task():
    global SYNC_STATE
    SYNC_STATE.update({"status": "running", "type": "snapshot", "current": 0, "total": 0, "message": "更新快照中..."})
    try:
        with get_session() as session:
            count = update_stock_snapshots(session, progress_callback=update_progress)
            SYNC_STATE.update({"status": "finished", "current": count, "total": count, "message": f"快照更新完成，共更新 {count} 只股票"})
    except Exception as e:
        print(f"Background task failed: {e}")
        SYNC_STATE.update({"status": "error", "message": str(e)})

@router.post("/data/snapshot/update")
def update_snapshots(background_tasks: BackgroundTasks, session=Depends(session_dep), user=Depends(admin_dep)):
    """手动触发快照更新"""
    if SYNC_STATE["status"] == "running":
        raise HTTPException(status_code=400, detail="Task already running")
    background_tasks.add_task(run_snapshot_update_task)
    return {"status": "started", "message": "Snapshot update started"}

@router.post("/data/daily")
def get_daily_data(payload: DailyDataRequest, session=Depends(session_dep)):
    symbols = payload.symbols or [s.symbol for s in session.exec(select(Stock)).all()]
    if not symbols:
        return []
    stocks = session.exec(select(Stock).where(Stock.symbol.in_(symbols))).all()
    ids = [s.id for s in stocks]
    prices = session.exec(select(DailyPrice).where(DailyPrice.stock_id.in_(ids), DailyPrice.trade_date == payload.trade_date)).all()
    return [p.dict() for p in prices]

@router.post("/data/price_range")
def get_price_range(payload: PriceRangeRequest, session=Depends(session_dep)):
    stock = session.exec(select(Stock).where(Stock.symbol == payload.symbol)).first()
    if not stock:
        raise HTTPException(status_code=404, detail="股票不存在")
    prices = session.exec(select(DailyPrice).where(DailyPrice.stock_id == stock.id, DailyPrice.trade_date >= payload.start_date, DailyPrice.trade_date <= payload.end_date).order_by(DailyPrice.trade_date)).all()
    
    
    if not prices:
        return []

    if payload.frequency == "D":
        return [p.dict() for p in prices]

    # Resampling for Weekly/Monthly
    df = pd.DataFrame([p.dict() for p in prices])
    df['trade_date'] = pd.to_datetime(df['trade_date'])
    df.set_index('trade_date', inplace=True)
    
    rule = 'W' if payload.frequency == 'W' else 'M'
    resampled = df.resample(rule).agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum'
    }).dropna()
    
    # Format back to list of dicts with date string
    results = []
    for date, row in resampled.iterrows():
        results.append({
            "trade_date": date.strftime('%Y-%m-%d'),
            "open": row['open'],
            "high": row['high'],
            "low": row['low'],
            "close": row['close'],
            "volume": row['volume']
        })
    return results

@router.post("/data/integrity")
def check_integrity(payload: DateRangeRequest, session=Depends(session_dep)):
    symbols = payload.symbols or [s.symbol for s in session.exec(select(Stock)).all()]
    return [validate_integrity(session, symbol, payload.start_date, payload.end_date) for symbol in symbols]

@router.post("/screening/run", response_model=ScreeningResponse)
def run_screening(payload: ScreeningRequest, session=Depends(session_dep)):
    cache_key = f"screen:{json.dumps(payload.dict(), ensure_ascii=False)}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    items = screen_stocks(session, payload.dict())
    response = {"total": len(items), "items": items}
    cache_set(cache_key, response, ttl=300)
    return response

@router.post("/screening/export")
def export_screening(payload: ScreeningExportRequest, session=Depends(session_dep), user=Depends(auth_dep)):
    items = screen_stocks(session, payload.dict())
    df = pd.DataFrame(items)
    if payload.file_type == "xlsx":
        buffer = io.BytesIO()
        df.to_excel(buffer, index=False)
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=screening.xlsx"})
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=screening.csv"})

@router.post("/screening/preset")
def save_preset(payload: PresetRequest, session=Depends(session_dep), user=Depends(auth_dep)):
    preset = session.exec(select(ScreeningPreset).where(ScreeningPreset.name == payload.name)).first()
    if preset:
        preset.payload_json = json.dumps(payload.payload, ensure_ascii=False)
    else:
        preset = ScreeningPreset(name=payload.name, payload_json=json.dumps(payload.payload, ensure_ascii=False))
        session.add(preset)
    session.commit()
    return {"status": "ok"}

@router.get("/screening/preset")
def list_presets(session=Depends(session_dep)):
    presets = session.exec(select(ScreeningPreset)).all()
    return [{"name": p.name, "payload": json.loads(p.payload_json)} for p in presets]

@router.delete("/screening/preset")
def delete_preset(name: str, session=Depends(session_dep), user=Depends(auth_dep)):
    preset = session.exec(select(ScreeningPreset).where(ScreeningPreset.name == name)).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    session.delete(preset)
    session.commit()
    return {"status": "ok"}

@router.post("/patterns/scan")
def scan_patterns(payload: PatternScanRequest, session=Depends(session_dep), user=Depends(auth_dep)):
    symbols = payload.symbols or [s.symbol for s in session.exec(select(Stock)).all()]
    results = []
    for symbol in symbols:
        stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
        if not stock:
            continue
        prices = session.exec(select(DailyPrice).where(DailyPrice.stock_id == stock.id, DailyPrice.trade_date >= payload.start_date, DailyPrice.trade_date <= payload.end_date)).all()
        if not prices:
            continue
        df = pd.DataFrame([p.dict() for p in prices])
        if df.empty:
            continue
        patterns = detect_patterns(df.sort_values("trade_date"), payload.patterns, payload.params)
        if not patterns:
            continue
        for item in patterns:
            session.add(PatternResult(symbol=symbol, pattern_name=item["pattern_name"], detected_date=item["detected_date"], success_rate=item["success_rate"], score=item["score"]))
        results.append({"symbol": symbol, "name": stock.name, "patterns": patterns})
    session.commit()
    return results

@router.get("/patterns/library")
def list_patterns():
    return PATTERN_NAMES

@router.get("/dashboard/stats")
def get_dashboard_stats(session=Depends(session_dep)):
    stock_count = len(session.exec(select(Stock)).all())
    daily_coverage = session.exec(select(func.count(distinct(DailyPrice.stock_id)))).one()
    
    return {
        "stock_count": stock_count,
        "daily_coverage": daily_coverage,
        "backtest_count": len(session.exec(select(BacktestResult)).all()),
        "screening_count": len(session.exec(select(ScreeningPreset)).all()),
        "data_status": "稳定"
    }

@router.get("/dashboard/tasks")
def get_dashboard_tasks(session=Depends(session_dep)):
    today = date.today()
    
    # Check if sync happened today
    sync_log = session.exec(select(DataSyncLog).where(DataSyncLog.created_at >= today, DataSyncLog.data_source == "akshare").limit(1)).first()
    sync_done = sync_log is not None
    
    # Check if any backtest ran today
    backtest_log = session.exec(select(BacktestResult).where(BacktestResult.created_at >= today).limit(1)).first()
    backtest_done = backtest_log is not None
    
    tasks = [
        {"id": 1, "text": "完成全市场增量数据同步", "completed": sync_done},
        {"id": 2, "text": "执行每日策略回测验证", "completed": backtest_done},
        {"id": 3, "text": "导出最新选股结果清单", "completed": False} # Logic for export check is harder, keep as manual reminder or check logs
    ]
    return tasks

@router.get("/dashboard/market_cap")
def get_market_cap_distribution(session=Depends(session_dep)):
    # Only include stocks with valid market_cap data
    stocks = session.exec(
        select(Stock)
        .where(Stock.market_cap != None)
        .where(Stock.market_cap > 0)
        .order_by(Stock.market_cap.desc())
        .limit(6)
    ).all()
    data = []
    for s in stocks:
        data.append({"name": s.name, "value": s.market_cap, "symbol": s.symbol})
    return data

@router.get("/strategies")
def list_strategies(session=Depends(session_dep)):
    strategies = session.exec(select(StrategyDefinition)).all()
    if not strategies:
        return [{"name": name, "description": f"{name}策略"} for name in get_strategy_map().keys()]
    return [s.dict() for s in strategies]

@router.post("/backtest/run")
def run_strategy_backtest(payload: BacktestRequest, session=Depends(session_dep), user=Depends(auth_dep)):
    strategy_map = get_strategy_map()
    if payload.strategy_name not in strategy_map:
        raise HTTPException(status_code=400, detail="策略不存在")
    results = []
    for symbol in payload.symbols:
        stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
        if not stock:
            continue
        prices = session.exec(select(DailyPrice).where(DailyPrice.stock_id == stock.id, DailyPrice.trade_date >= payload.start_date, DailyPrice.trade_date <= payload.end_date)).all()
        if not prices:
            continue
        df = pd.DataFrame([p.dict() for p in prices])
        if df.empty:
            continue
        df = df.sort_values("trade_date")
        strategy_func = strategy_map[payload.strategy_name]
        allowed_params = {k: v for k, v in payload.parameters.items() if k in inspect.signature(strategy_func).parameters}
        signal = strategy_func(df, **allowed_params)
        result = run_backtest(df, signal)
        metrics = result["metrics"]
        session.add(BacktestResult(
            strategy_name=payload.strategy_name,
            symbol=symbol,
            start_date=payload.start_date,
            end_date=payload.end_date,
            annual_return=metrics["annual_return"],
            max_drawdown=metrics["max_drawdown"],
            sharpe=metrics["sharpe"],
            win_rate=metrics["win_rate"],
            profit_factor=metrics["profit_factor"],
        ))
        results.append({"symbol": symbol, **metrics, "equity_curve": result["equity_curve"], "dates": result["dates"]})
    session.commit()
    return results

@router.post("/export")
def export_data(payload: ExportRequest, session=Depends(session_dep), user=Depends(auth_dep)):
    symbols = payload.symbols or [s.symbol for s in session.exec(select(Stock)).all()]
    stocks = session.exec(select(Stock).where(Stock.symbol.in_(symbols))).all()
    # Optimization: If no date range provided, default to last 30 days to avoid full DB dump
    if not payload.start_date and not payload.end_date:
        payload.start_date = date.today() - timedelta(days=30)
    
    ids = [s.id for s in stocks]
    query = select(DailyPrice).where(DailyPrice.stock_id.in_(ids))
    if payload.start_date:
        query = query.where(DailyPrice.trade_date >= payload.start_date)
    if payload.end_date:
        query = query.where(DailyPrice.trade_date <= payload.end_date)
    prices = session.exec(query).all()
    df = pd.DataFrame([p.dict() for p in prices]) if prices else pd.DataFrame()
    if payload.file_type == "xlsx":
        buffer = io.BytesIO()
        df.to_excel(buffer, index=False)
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=export.xlsx"})
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=export.csv"})

@router.get("/system/logs")
@router.get("/system/logs")
def get_system_logs(session=Depends(session_dep), limit: int = 100, offset: int = 0):
    query = select(DataSyncLog).order_by(DataSyncLog.created_at.desc())
    total = len(session.exec(query).all())
    logs = session.exec(query.offset(offset).limit(limit)).all()
    return {"total": total, "items": logs}

@router.delete("/system/logs")
def delete_system_logs(payload: LogDeleteRequest, session=Depends(session_dep), user=Depends(admin_dep)):
    query = select(DataSyncLog)
    if not payload.delete_all:
        if payload.start_date:
            query = query.where(DataSyncLog.created_at >= payload.start_date)
        if payload.end_date:
            # Add one day to include the end date
            query = query.where(DataSyncLog.created_at < payload.end_date + pd.Timedelta(days=1))
    
    logs = session.exec(query).all()
    count = len(logs)
    for log in logs:
        session.delete(log)
    session.commit()
    return {"status": "ok", "deleted": count}


@router.get("/sectors")
def list_sectors(session=Depends(session_dep)):
    sectors = get_sector_list(session)
    return {"total": len(sectors), "items": sectors}


@router.get("/sectors/{industry}")
def sector_detail(industry: str, session=Depends(session_dep)):
    detail = get_sector_detail(session, industry)
    if not detail:
        raise HTTPException(status_code=404, detail="行业不存在")
    return detail


@router.get("/sectors/fund-flow/ranking")
def sector_fund_flow_ranking(window: int = 5, session=Depends(session_dep)):
    if window not in [5, 10, 20]:
        raise HTTPException(status_code=400, detail="窗口参数必须为 5、10 或 20")
    ranking = get_sector_fund_flow_ranking(session, window)
    return {"window": window, "total": len(ranking), "items": ranking}


@router.get("/stocks/{symbol}/sector-percentile")
def stock_sector_percentile(symbol: str, session=Depends(session_dep)):
    percentile = get_stock_sector_percentile(session, symbol)
    if not percentile:
        raise HTTPException(status_code=404, detail="股票不存在或无行业分类")
    return percentile


@router.get("/watchlist/groups")
def watchlist_list_groups(session=Depends(session_dep), user=Depends(auth_dep)):
    groups = wl_list_groups(session, user.id)
    return {"items": groups}


@router.post("/watchlist/groups")
def watchlist_create_group(payload: WatchGroupCreate, session=Depends(session_dep), user=Depends(auth_dep)):
    group = wl_create_group(session, user.id, payload.name)
    return group


@router.put("/watchlist/groups/reorder")
def watchlist_reorder_groups(payload: WatchGroupReorder, session=Depends(session_dep), user=Depends(auth_dep)):
    wl_reorder_groups(session, user.id, payload.ordered_ids)
    return {"status": "ok"}


@router.put("/watchlist/groups/{group_id}")
def watchlist_update_group(group_id: int, payload: WatchGroupUpdate, session=Depends(session_dep), user=Depends(auth_dep)):
    group = wl_update_group(session, user.id, group_id, payload.name)
    if not group:
        raise HTTPException(status_code=404, detail="分组不存在")
    return group


@router.delete("/watchlist/groups/{group_id}")
def watchlist_delete_group(group_id: int, session=Depends(session_dep), user=Depends(auth_dep)):
    ok = wl_delete_group(session, user.id, group_id)
    if not ok:
        raise HTTPException(status_code=404, detail="分组不存在")
    return {"status": "ok"}


@router.post("/watchlist/items")
def watchlist_add_item(payload: WatchItemAdd, session=Depends(session_dep), user=Depends(auth_dep)):
    item = wl_add_item(session, user.id, payload.stock_id, payload.group_id, payload.note)
    if not item:
        raise HTTPException(status_code=400, detail="添加失败，分组不存在")
    return item


@router.delete("/watchlist/items/{item_id}")
def watchlist_remove_item(item_id: int, session=Depends(session_dep), user=Depends(auth_dep)):
    ok = wl_remove_item(session, user.id, item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="关注项不存在")
    return {"status": "ok"}


@router.put("/watchlist/items/{item_id}/note")
def watchlist_update_note(item_id: int, payload: WatchItemNoteUpdate, session=Depends(session_dep), user=Depends(auth_dep)):
    item = wl_update_item_note(session, user.id, item_id, payload.note)
    if not item:
        raise HTTPException(status_code=404, detail="关注项不存在")
    return item


@router.put("/watchlist/items/{item_id}/move")
def watchlist_move_item(item_id: int, payload: WatchItemMove, session=Depends(session_dep), user=Depends(auth_dep)):
    item = wl_move_item(session, user.id, item_id, payload.target_group_id)
    if not item:
        raise HTTPException(status_code=400, detail="移动失败，关注项或目标分组不存在")
    return item


@router.post("/watchlist/items/batch-import")
def watchlist_batch_import(payload: WatchBatchImport, session=Depends(session_dep), user=Depends(auth_dep)):
    items = wl_batch_import(session, user.id, payload.group_id, payload.stock_ids)
    return {"imported": len(items), "items": items}


@router.get("/watchlist/groups/{group_id}/items")
def watchlist_query_group_items(group_id: int, session=Depends(session_dep), user=Depends(auth_dep)):
    items = wl_query_group_items(session, user.id, group_id)
    return {"items": items}


@router.get("/realtime/quote")
def realtime_quote(symbols: str = "", user=Depends(auth_dep)):
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        return {"items": [], "count": 0}
    result = get_realtime_quotes(symbol_list)
    return result


@router.post("/realtime/session")
def realtime_create_session(payload: dict, user=Depends(auth_dep)):
    symbols = payload.get("symbols", [])
    if not symbols or not isinstance(symbols, list):
        raise HTTPException(status_code=400, detail="symbols 参数必须是数组")
    result = rt_create_session(symbols, user_id=user.id)
    return result


@router.get("/realtime/session/{session_id}")
def realtime_get_session(session_id: str, user=Depends(auth_dep)):
    try:
        result = rt_get_session_snapshot(session_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/realtime/session/{session_id}")
def realtime_update_session(session_id: str, payload: dict, user=Depends(auth_dep)):
    symbols = payload.get("symbols", [])
    if not isinstance(symbols, list):
        raise HTTPException(status_code=400, detail="symbols 参数必须是数组")
    try:
        result = rt_update_session_symbols(session_id, symbols)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/realtime/session/{session_id}/add")
def realtime_add_to_session(session_id: str, payload: dict, user=Depends(auth_dep)):
    symbols = payload.get("symbols", [])
    if not symbols or not isinstance(symbols, list):
        raise HTTPException(status_code=400, detail="symbols 参数必须是数组")
    try:
        result = rt_add_session_symbols(session_id, symbols)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/realtime/session/{session_id}/remove")
def realtime_remove_from_session(session_id: str, payload: dict, user=Depends(auth_dep)):
    symbols = payload.get("symbols", [])
    if not symbols or not isinstance(symbols, list):
        raise HTTPException(status_code=400, detail="symbols 参数必须是数组")
    try:
        result = rt_remove_session_symbols(session_id, symbols)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stocks/{symbol}/detail", response_model=StockDetailResponse)
def get_stock_detail(symbol: str, session=Depends(session_dep)):
    """
    个股详情聚合接口 - 单次联表查询获取所有数据
    返回：基本资料、最新行情、60日K线、财务摘要、因子值、技术指标、近30天形态记录
    """
    from sqlalchemy.orm import joinedload
    from datetime import timedelta

    stock = session.exec(
        select(Stock)
        .options(
            joinedload(Stock.snapshots),
            joinedload(Stock.prices),
            joinedload(Stock.financials),
            joinedload(Stock.factors),
        )
        .where(Stock.symbol == symbol)
    ).first()

    if not stock:
        raise HTTPException(status_code=404, detail="股票不存在")

    stock_id = stock.id

    kline_60 = session.exec(
        select(DailyPrice)
        .where(DailyPrice.stock_id == stock_id)
        .order_by(DailyPrice.trade_date.desc())
        .limit(60)
    ).all()
    kline_60 = sorted(kline_60, key=lambda x: x.trade_date)

    snapshot = stock.snapshots[0] if stock.snapshots else None

    financial = session.exec(
        select(FinancialMetric)
        .where(FinancialMetric.stock_id == stock_id)
        .order_by(FinancialMetric.report_date.desc())
        .limit(1)
    ).first()

    factor = session.exec(
        select(FactorValue)
        .where(FactorValue.stock_id == stock_id)
        .order_by(FactorValue.factor_date.desc())
        .limit(1)
    ).first()

    thirty_days_ago = date.today() - timedelta(days=30)
    patterns = session.exec(
        select(PatternResult)
        .where(
            PatternResult.symbol == symbol,
            PatternResult.detected_date >= thirty_days_ago
        )
        .order_by(PatternResult.detected_date.desc())
    ).all()

    change_pct = None
    if len(kline_60) >= 2:
        prev_close = kline_60[-2].close
        curr_close = kline_60[-1].close
        change_pct = ((curr_close - prev_close) / prev_close) * 100

    macd_status = None
    if snapshot and snapshot.macd_line is not None and snapshot.macd_signal is not None and snapshot.macd_hist is not None:
        if snapshot.macd_hist > 0 and snapshot.macd_line > snapshot.macd_signal:
            macd_status = "多头排列"
        elif snapshot.macd_hist < 0 and snapshot.macd_line < snapshot.macd_signal:
            macd_status = "空头排列"
        elif snapshot.macd_hist > 0 and snapshot.macd_line < snapshot.macd_signal:
            macd_status = "顶背离信号"
        elif snapshot.macd_hist < 0 and snapshot.macd_line > snapshot.macd_signal:
            macd_status = "底背离信号"
        else:
            macd_status = "中性"

    kdj_status = None
    if snapshot and snapshot.kdj_k is not None and snapshot.kdj_d is not None and snapshot.kdj_j is not None:
        if snapshot.kdj_k > snapshot.kdj_d and snapshot.kdj_k < 80:
            kdj_status = "金叉持有"
        elif snapshot.kdj_k < snapshot.kdj_d and snapshot.kdj_k > 20:
            kdj_status = "死叉观望"
        elif snapshot.kdj_k > 80:
            kdj_status = "超买区域"
        elif snapshot.kdj_k < 20:
            kdj_status = "超卖区域"
        else:
            kdj_status = "中性"

    ma_trend = None
    if snapshot and snapshot.ma5 and snapshot.ma10 and snapshot.ma20 and snapshot.ma60:
        if snapshot.ma5 > snapshot.ma10 > snapshot.ma20 > snapshot.ma60:
            ma_trend = "多头排列"
        elif snapshot.ma5 < snapshot.ma10 < snapshot.ma20 < snapshot.ma60:
            ma_trend = "空头排列"
        elif snapshot.ma5 > snapshot.ma10 > snapshot.ma20:
            ma_trend = "短期多头"
        elif snapshot.ma5 < snapshot.ma10 < snapshot.ma20:
            ma_trend = "短期空头"
        else:
            ma_trend = "震荡整理"

    concept_tags = None
    if stock.concept_tags:
        concept_tags = [tag.strip() for tag in stock.concept_tags.split(",") if tag.strip()]

    basic_info = StockBasicInfo(
        symbol=stock.symbol,
        name=stock.name,
        market=stock.market,
        industry=stock.industry,
        concept_tags=concept_tags,
        market_cap=stock.market_cap,
        pe_ratio=stock.pe_ratio,
        pb_ratio=stock.pb_ratio,
    )

    quote = StockQuoteSnapshot(
        latest_date=snapshot.latest_date if snapshot else (kline_60[-1].trade_date if kline_60 else date.today()),
        close=snapshot.close if snapshot else (kline_60[-1].close if kline_60 else 0),
        volume=snapshot.volume if snapshot else (kline_60[-1].volume if kline_60 else 0),
        change_pct=change_pct,
    )

    kline_items = [
        KLineItem(
            trade_date=k.trade_date,
            open=k.open,
            high=k.high,
            low=k.low,
            close=k.close,
            volume=k.volume,
        )
        for k in kline_60
    ]

    financial_summary = None
    if financial:
        financial_summary = FinancialSummary(
            report_date=financial.report_date,
            revenue=financial.revenue,
            net_profit=financial.net_profit,
            roe=financial.roe,
            debt_ratio=financial.debt_ratio,
            revenue_yoy=financial.revenue_yoy,
            net_profit_yoy=financial.net_profit_yoy,
        )

    factor_values = None
    if factor:
        factor_values = FactorValues(
            factor_date=factor.factor_date,
            momentum=factor.momentum,
            volatility=factor.volatility,
            liquidity=factor.liquidity,
        )

    technical = None
    if snapshot:
        technical = TechnicalIndicators(
            rsi=snapshot.rsi,
            macd_status=macd_status,
            kdj_status=kdj_status,
            ma_trend=ma_trend,
            ma5=snapshot.ma5,
            ma10=snapshot.ma10,
            ma20=snapshot.ma20,
            ma60=snapshot.ma60,
        )

    pattern_records = [
        PatternRecord(
            pattern_name=p.pattern_name,
            detected_date=p.detected_date,
            success_rate=p.success_rate,
            score=p.score,
        )
        for p in patterns
    ]

    return StockDetailResponse(
        basic_info=basic_info,
        quote=quote,
        kline_60=kline_items,
        financial=financial_summary,
        factors=factor_values,
        technical=technical,
        patterns_30=pattern_records,
    )
