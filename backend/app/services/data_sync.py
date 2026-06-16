from datetime import date
import pandas as pd
from sqlmodel import select
from app.models import Stock, DailyPrice, FactorValue, DataSyncLog
from app.services.data_sources import get_data_sources

def _log_sync(session, source: str, sync_type: str, start: date | None, end: date | None, status: str, message: str | None):
    session.add(DataSyncLog(data_source=source, sync_type=sync_type, start_date=start, end_date=end, status=status, message=message))
    session.commit()

def sync_stock_list(session, progress_callback=None):
    sources = get_data_sources()
    all_df = []
    
    # 按优先级排序数据源
    sorted_sources = sorted(sources.items(), key=lambda x: x[1].get("priority", 99))
    total_sources = len(sorted_sources)
    
    for i, (name, config) in enumerate(sorted_sources):
        progress_pct = int((i / total_sources) * 50)
        if progress_callback: 
            progress_callback(progress_pct, 100, f"正在从 {config.get('name', name)} 获取数据...")
        
        fetcher = config.get("stock_list")
        if fetcher is None:
            continue
        try:
            df = fetcher()
            count = len(df) if not df.empty else 0
            if not df.empty:
                all_df.append(df)
            _log_sync(session, name, "stock_list", None, None, "success", f"获取 {count} 条记录")
            print(f"[同步] {config.get('name', name)} 成功获取 {count} 只股票")
        except Exception as exc:
            _log_sync(session, name, "stock_list", None, None, "failed", str(exc))
            print(f"[同步] {config.get('name', name)} 获取失败: {exc}")
            
    if progress_callback: progress_callback(60, 100, "正在合并并更新数据库...")
    if not all_df:
        return 0
    merged = pd.concat(all_df).drop_duplicates(subset=["symbol"])
    existing = {s.symbol: s for s in session.exec(select(Stock)).all()}
    count = 0
    total_rows = len(merged)
    
    for i, (_, row) in enumerate(merged.iterrows()):
        if i % 100 == 0 and progress_callback:
             progress_callback(60 + int((i/total_rows)*40), 100, f"正在更新股票 {row['symbol']}...")
        
        if row["symbol"] in existing:
            stock = existing[row["symbol"]]
            stock.name = row["name"]
            stock.market = row["market"]
            if pd.notna(row.get("industry")):
                stock.industry = row.get("industry")
            if pd.notna(row.get("market_cap")):
                stock.market_cap = row.get("market_cap")
            if pd.notna(row.get("pe_ratio")):
                stock.pe_ratio = row.get("pe_ratio")
            if pd.notna(row.get("pb_ratio")):
                stock.pb_ratio = row.get("pb_ratio")
        else:
            stock = Stock(
                symbol=row["symbol"],
                name=row["name"],
                market=row["market"],
                industry=row.get("industry") if pd.notna(row.get("industry")) else None,
                market_cap=row.get("market_cap") if pd.notna(row.get("market_cap")) else None,
                pe_ratio=row.get("pe_ratio") if pd.notna(row.get("pe_ratio")) else None,
                pb_ratio=row.get("pb_ratio") if pd.notna(row.get("pb_ratio")) else None,
            )
            session.add(stock)
        count += 1
    session.commit()
    return count

def _delete_existing_prices(session, stock_id: int, start: date, end: date):
    prices = session.exec(select(DailyPrice).where(DailyPrice.stock_id == stock_id, DailyPrice.trade_date >= start, DailyPrice.trade_date <= end)).all()
    for price in prices:
        session.delete(price)
    session.commit()

def _upsert_factors(session, stock_id: int, df: pd.DataFrame):
    for _, row in df.iterrows():
        session.add(FactorValue(stock_id=stock_id, factor_date=row["trade_date"], momentum=row["momentum"], volatility=row["volatility"], liquidity=row["liquidity"]))
    session.commit()

def sync_daily(session, symbols: list[str], start: date, end: date, sync_type: str = "incremental", progress_callback=None):
    sources = get_data_sources()
    # 按优先级排序数据源
    sorted_sources = sorted(sources.items(), key=lambda x: x[1].get("priority", 99))
    count = 0
    total = len(symbols)
    
    for i, symbol in enumerate(symbols):
        if progress_callback:
            progress_callback(i, total, f"正在同步 {symbol} ({i+1}/{total})")
            
        data = None
        used_source = None
        
        # 尝试所有数据源，按优先级
        for source_name, config in sorted_sources:
            fetcher = config.get("daily")
            if fetcher is None:
                continue
            try:
                data = fetcher(symbol, start, end)
                if data is not None and not data.empty:
                    used_source = config.get("name", source_name)
                    _log_sync(session, source_name, sync_type, start, end, "success", f"{symbol}: {len(data)} 条")
                    print(f"[同步] {symbol}: 从 {used_source} 获取 {len(data)} 条记录")
                    break
            except Exception as exc:
                _log_sync(session, source_name, sync_type, start, end, "failed", f"{symbol}: {str(exc)}")
                print(f"[同步] {symbol}: {config.get('name', source_name)} 失败 - {exc}")
                
        if data is None or data.empty:
            continue
        stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
        if not stock:
            continue
        
        # Update stock details if available in daily data (e.g., market_cap, pe_ratio, pb_ratio)
        # This assumes the 'data' DataFrame might contain these columns.
        # If these columns are not consistently available in daily data, this block might need adjustment.
        if not data.empty:
            # Take the last row's data as the most recent for stock attributes
            last_row = data.iloc[-1]
            updated = False
            if "market_cap" in last_row and last_row["market_cap"] is not None:
                stock.market_cap = float(last_row["market_cap"])
                updated = True
            if "pe_ratio" in last_row and last_row["pe_ratio"] is not None:
                stock.pe_ratio = float(last_row["pe_ratio"])
                updated = True
            if "pb_ratio" in last_row and last_row["pb_ratio"] is not None:
                stock.pb_ratio = float(last_row["pb_ratio"])
                updated = True
            if updated:
                session.add(stock) # Mark for update
                session.commit() # Commit the stock update immediately or with daily prices
        
        _delete_existing_prices(session, stock.id, start, end)
        for _, row in data.iterrows():
            session.add(DailyPrice(
                stock_id=stock.id,
                trade_date=row["trade_date"],
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]),
                amount=float(row.get("amount", 0) or 0),
            ))
        session.commit()
        
        # Calculate derived metrics
        df = data.copy()
        # Ensure numeric columns
        for col in ["close", "volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            
        df["momentum"] = df["close"].pct_change(20)
        df["volatility"] = df["close"].pct_change().rolling(20).std()
        df["liquidity"] = df["volume"].rolling(20).mean()
        _upsert_factors(session, stock.id, df.fillna(0))
        count += len(data)
    
    if progress_callback:
        progress_callback(total, total, "同步完成")
    return count

def _calculate_yoy(df: pd.DataFrame) -> pd.DataFrame:
    """
    计算财务数据的同比增速
    匹配规则：找到去年同季度（同月同日）的数据进行比较
    """
    if df.empty:
        return df
    
    df = df.copy()
    df = df.sort_values("report_date").reset_index(drop=True)
    
    revenue_yoy_list = []
    net_profit_yoy_list = []
    
    date_map = {}
    for idx, row in df.iterrows():
        rd = row["report_date"]
        key = (rd.month, rd.day)
        if key not in date_map:
            date_map[key] = []
        date_map[key].append((rd.year, idx))
    
    for key in date_map:
        date_map[key].sort()
    
    for idx, row in df.iterrows():
        rd = row["report_date"]
        key = (rd.month, rd.day)
        
        last_year_idx = None
        for year, i in date_map.get(key, []):
            if year == rd.year - 1:
                last_year_idx = i
                break
        
        if last_year_idx is not None:
            last_row = df.iloc[last_year_idx]
            last_revenue = float(last_row.get("revenue", 0) or 0)
            last_net_profit = float(last_row.get("net_profit", 0) or 0)
            
            curr_revenue = float(row.get("revenue", 0) or 0)
            curr_net_profit = float(row.get("net_profit", 0) or 0)
            
            revenue_yoy = ((curr_revenue - last_revenue) / last_revenue) if last_revenue != 0 else None
            net_profit_yoy = ((curr_net_profit - last_net_profit) / last_net_profit) if last_net_profit != 0 else None
        else:
            revenue_yoy = None
            net_profit_yoy = None
        
        revenue_yoy_list.append(revenue_yoy)
        net_profit_yoy_list.append(net_profit_yoy)
    
    df["revenue_yoy"] = revenue_yoy_list
    df["net_profit_yoy"] = net_profit_yoy_list
    return df

def sync_financials(session, symbols: list[str]):
    sources = get_data_sources()
    fetcher = sources["akshare"]["financials"]
    if not fetcher:
        return 0
    count = 0
    from app.models import FinancialMetric
    
    for symbol in symbols:
        try:
            df = fetcher(symbol)
            if df.empty:
                continue
            
            stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
            if not stock:
                continue
            
            existing_metrics = session.exec(
                select(FinancialMetric).where(FinancialMetric.stock_id == stock.id)
            ).all()
            
            existing_dates = set()
            for m in existing_metrics:
                existing_dates.add(m.report_date)
            
            if existing_metrics:
                existing_df = pd.DataFrame([{
                    "report_date": m.report_date,
                    "revenue": m.revenue or 0,
                    "net_profit": m.net_profit or 0,
                    "roe": m.roe or 0,
                    "debt_ratio": m.debt_ratio or 0,
                } for m in existing_metrics])
                combined_df = pd.concat([existing_df, df], ignore_index=True)
                combined_df = combined_df.drop_duplicates(subset=["report_date"], keep="last")
            else:
                combined_df = df.copy()
            
            combined_df = _calculate_yoy(combined_df)
            
            yoy_map = {}
            for _, row in combined_df.iterrows():
                yoy_map[row["report_date"]] = {
                    "revenue_yoy": row.get("revenue_yoy"),
                    "net_profit_yoy": row.get("net_profit_yoy"),
                }
            
            new_rows = df[~df["report_date"].isin(existing_dates)]
            
            for _, row in new_rows.iterrows():
                yoy_data = yoy_map.get(row["report_date"], {})
                metric = FinancialMetric(
                    stock_id=stock.id,
                    report_date=row["report_date"],
                    revenue=float(row.get("revenue", 0) or 0),
                    net_profit=float(row.get("net_profit", 0) or 0),
                    roe=float(row.get("roe", 0) or 0),
                    debt_ratio=float(row.get("debt_ratio", 0) or 0),
                    revenue_yoy=yoy_data.get("revenue_yoy"),
                    net_profit_yoy=yoy_data.get("net_profit_yoy"),
                )
                session.add(metric)
            
            for m in existing_metrics:
                yoy_data = yoy_map.get(m.report_date)
                if yoy_data:
                    if m.revenue_yoy != yoy_data.get("revenue_yoy"):
                        m.revenue_yoy = yoy_data.get("revenue_yoy")
                    if m.net_profit_yoy != yoy_data.get("net_profit_yoy"):
                        m.net_profit_yoy = yoy_data.get("net_profit_yoy")
            
            session.commit()
            count += len(new_rows)
            print(f"Synced financials for {symbol}: {len(new_rows)} new records, updated YoY for {len(existing_metrics)} existing records")
        except Exception as e:
            print(f"Sync financials failed for {symbol}: {e}")
            session.rollback()
    return count

def recalculate_all_financial_yoy(session, progress_callback=None) -> int:
    """
    重新计算所有股票财务数据的同比增速
    用于补算历史数据中缺失的同比字段
    """
    from app.models import FinancialMetric
    
    stocks = session.exec(select(Stock)).all()
    total = len(stocks)
    updated_count = 0
    
    for i, stock in enumerate(stocks):
        if progress_callback:
            progress_callback(i, total, f"正在计算 {stock.symbol} 同比增速...")
        
        try:
            metrics = session.exec(
                select(FinancialMetric)
                .where(FinancialMetric.stock_id == stock.id)
                .order_by(FinancialMetric.report_date)
            ).all()
            
            if not metrics:
                continue
            
            df = pd.DataFrame([{
                "report_date": m.report_date,
                "revenue": m.revenue or 0,
                "net_profit": m.net_profit or 0,
                "roe": m.roe or 0,
                "debt_ratio": m.debt_ratio or 0,
            } for m in metrics])
            
            df = _calculate_yoy(df)
            
            yoy_map = {}
            for _, row in df.iterrows():
                yoy_map[row["report_date"]] = {
                    "revenue_yoy": row.get("revenue_yoy"),
                    "net_profit_yoy": row.get("net_profit_yoy"),
                }
            
            stock_updated = 0
            for m in metrics:
                yoy_data = yoy_map.get(m.report_date)
                if yoy_data:
                    new_rev_yoy = yoy_data.get("revenue_yoy")
                    new_net_yoy = yoy_data.get("net_profit_yoy")
                    
                    if m.revenue_yoy != new_rev_yoy or m.net_profit_yoy != new_net_yoy:
                        m.revenue_yoy = new_rev_yoy
                        m.net_profit_yoy = new_net_yoy
                        stock_updated += 1
            
            session.commit()
            updated_count += stock_updated
            
            if stock_updated > 0:
                print(f"Recalculated YoY for {stock.symbol}: {stock_updated} records updated")
        except Exception as e:
            print(f"Recalculate YoY failed for {stock.symbol}: {e}")
            session.rollback()
    
    if progress_callback:
        progress_callback(total, total, "同比增速补算完成")
    
    return updated_count

def validate_integrity(session, symbol: str, start: date, end: date) -> dict:
    stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
    if not stock:
        return {"symbol": symbol, "status": "missing"}
    prices = session.exec(select(DailyPrice).where(DailyPrice.stock_id == stock.id, DailyPrice.trade_date >= start, DailyPrice.trade_date <= end)).all()
    if not prices:
        return {"symbol": symbol, "status": "missing"}
    df = pd.DataFrame([p.dict() for p in prices])
    df = df.sort_values("trade_date")
    missing = df["trade_date"].isna().sum()
    duplicates = df["trade_date"].duplicated().sum()
    return {"symbol": symbol, "status": "ok", "missing": int(missing), "duplicates": int(duplicates)}
