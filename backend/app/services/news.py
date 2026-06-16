import json
import re
import random
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional, Callable
import pandas as pd
import akshare as ak
from sqlmodel import select, Session, func
from app.models import NewsItem, Stock
from app.services.data_sources import random_delay, exponential_backoff_delay

NEWS_TYPES = ["公告", "新闻", "研报"]

def _normalize_symbol(raw: str) -> str:
    if not raw:
        return ""
    raw = str(raw).strip()
    m = re.search(r"(\d{6})", raw)
    if m:
        return m.group(1)
    return raw

def _parse_datetime(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day)
    if isinstance(val, str):
        val = val.strip()
        for fmt in [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d",
            "%Y%m%d",
            "%Y/%m/%d %H:%M:%S",
            "%Y/%m/%d",
        ]:
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
        try:
            return pd.to_datetime(val).to_pydatetime()
        except Exception:
            pass
    return datetime.now()

def _clean_html(raw: str) -> str:
    if not raw:
        return ""
    text = re.sub(r"<script[\s\S]*?</script>", "", raw, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def sync_notices_by_symbol(
    session: Session,
    symbol: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> int:
    last_error = None
    for attempt in range(3):
        try:
            random_delay(0.5, 1.5)
            df = ak.stock_notice_report(symbol=symbol)
            if df is None or df.empty:
                if progress_callback:
                    progress_callback(0, 0, f"{symbol} 无公告数据")
                return 0

            count = _upsert_news_items(session, df, symbol, "公告", "东方财富公告", start_date, end_date)
            if progress_callback:
                progress_callback(1, 1, f"{symbol} 同步完成，入库 {count} 条")
            return count
        except Exception as e:
            last_error = e
            print(f"[NEWS] {symbol} 同步失败 (尝试 {attempt + 1}/3): {e}")
            exponential_backoff_delay(attempt)

    if progress_callback:
        progress_callback(0, 0, f"同步失败: {last_error}")
    raise last_error if last_error else RuntimeError(f"{symbol} 公告同步失败")

def sync_news_cctv(
    session: Session,
    target_date: Optional[date] = None,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> int:
    last_error = None
    if target_date is None:
        target_date = date.today()
    for attempt in range(3):
        try:
            random_delay(0.5, 1.5)
            df = ak.news_cctv(date=target_date.strftime("%Y%m%d"))
            if df is None or df.empty:
                if progress_callback:
                    progress_callback(0, 0, f"{target_date} 无央视新闻数据")
                return 0

            count = _upsert_cctv_news(session, df, target_date)
            if progress_callback:
                progress_callback(1, 1, f"{target_date} 同步完成，入库 {count} 条")
            return count
        except Exception as e:
            last_error = e
            print(f"[NEWS] CCTV {target_date} 同步失败 (尝试 {attempt + 1}/3): {e}")
            exponential_backoff_delay(attempt)

    if progress_callback:
        progress_callback(0, 0, f"同步失败: {last_error}")
    return 0

def _upsert_news_items(
    session: Session,
    df: pd.DataFrame,
    symbol: str,
    news_type: str,
    source: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> int:
    stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
    sector = stock.industry if stock and stock.industry else None

    count = 0
    for _, row in df.iterrows():
        title = str(row.get("标题", row.get("title", ""))).strip()
        if not title:
            continue

        url = str(row.get("公告链接", row.get("url", row.get("链接", "")))).strip()
        publish_time = _parse_datetime(row.get("公告日期", row.get("发布时间", row.get("date", datetime.now()))))

        if start_date and publish_time.date() < start_date:
            continue
        if end_date and publish_time.date() > end_date:
            continue

        summary_raw = str(row.get("摘要", row.get("summary", row.get("内容", "")))).strip()
        summary = _clean_html(summary_raw) if summary_raw else ""
        raw_html = str(row.get("raw_html", row.get("内容", ""))).strip() if "raw_html" in row.index or "内容" in row.index else None

        existing = session.exec(
            select(NewsItem).where(
                NewsItem.symbol == symbol,
                NewsItem.title == title,
                NewsItem.publish_time == publish_time,
                NewsItem.news_type == news_type,
            )
        ).first()

        if existing:
            existing.summary = summary or existing.summary
            existing.raw_html = raw_html or existing.raw_html
            existing.url = url or existing.url
            if sector and not existing.sector:
                existing.sector = sector
            session.add(existing)
        else:
            record = NewsItem(
                source=source,
                symbol=symbol,
                sector=sector,
                title=title,
                url=url,
                publish_time=publish_time,
                summary=summary,
                news_type=news_type,
                raw_html=raw_html,
            )
            session.add(record)
        count += 1

    session.commit()
    return count

def _upsert_cctv_news(
    session: Session,
    df: pd.DataFrame,
    target_date: date,
) -> int:
    count = 0
    for _, row in df.iterrows():
        title = str(row.get("title", row.get("标题", ""))).strip()
        if not title:
            continue

        content = str(row.get("content", row.get("内容", ""))).strip()
        summary = _clean_html(content)[:300] if content else ""
        url = str(row.get("url", row.get("链接", ""))).strip() or ""
        publish_time = datetime(target_date.year, target_date.month, target_date.day, 19, 0, 0)

        existing = session.exec(
            select(NewsItem).where(
                NewsItem.source == "央视新闻",
                NewsItem.title == title,
                NewsItem.publish_time == publish_time,
            )
        ).first()

        if existing:
            existing.summary = summary or existing.summary
            existing.url = url or existing.url
            session.add(existing)
        else:
            record = NewsItem(
                source="央视新闻",
                symbol=None,
                sector=None,
                title=title,
                url=url,
                publish_time=publish_time,
                summary=summary,
                news_type="新闻",
                raw_html=content if content else None,
            )
            session.add(record)
        count += 1

    session.commit()
    return count

def sync_news_range(
    session: Session,
    symbols: Optional[List[str]] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    news_type: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> int:
    if symbols is None:
        stocks = session.exec(select(Stock).limit(100)).all()
        symbols = [s.symbol for s in stocks]

    total = len(symbols) + 1
    total_count = 0
    current = 0

    if news_type is None or news_type == "新闻":
        try:
            cctv_date = end_date or date.today()
            count = sync_news_cctv(session, cctv_date)
            total_count += count
        except Exception as e:
            print(f"[NEWS] CCTV 同步跳过: {e}")
        current += 1
        if progress_callback:
            progress_callback(current, total, "已同步央视新闻")

    if news_type is None or news_type == "公告":
        for sym in symbols:
            try:
                count = sync_notices_by_symbol(session, sym, start_date, end_date)
                total_count += count
            except Exception as e:
                print(f"[NEWS] {sym} 跳过: {e}")
            current += 1
            if progress_callback:
                progress_callback(current, total, f"正在同步 {sym}")

    if progress_callback:
        progress_callback(total, total, f"区间同步完成，共入库 {total_count} 条")
    return total_count

def _news_item_to_dict(item: NewsItem, stock_map: Dict[str, str]) -> Dict[str, Any]:
    return {
        "id": item.id,
        "source": item.source,
        "symbol": item.symbol,
        "stock_name": stock_map.get(item.symbol) if item.symbol else None,
        "sector": item.sector,
        "title": item.title,
        "url": item.url,
        "publish_time": item.publish_time.isoformat(),
        "summary": item.summary,
        "news_type": item.news_type,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }

def query_news(
    session: Session,
    keyword: Optional[str] = None,
    news_type: Optional[str] = None,
    symbols: Optional[List[str]] = None,
    sectors: Optional[List[str]] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    query = select(NewsItem)

    if keyword:
        kw = f"%{keyword}%"
        query = query.where(
            (NewsItem.title.like(kw)) |
            (NewsItem.summary.like(kw))
        )
    if news_type:
        query = query.where(NewsItem.news_type == news_type)
    if symbols:
        query = query.where(NewsItem.symbol.in_(symbols))
    if sectors:
        query = query.where(NewsItem.sector.in_(sectors))
    if start_date:
        start_dt = datetime(start_date.year, start_date.month, start_date.day)
        query = query.where(NewsItem.publish_time >= start_dt)
    if end_date:
        end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)
        query = query.where(NewsItem.publish_time <= end_dt)

    total_results = session.exec(query).all()
    total = len(total_results)

    query = query.order_by(NewsItem.publish_time.desc())
    offset = (page - 1) * page_size
    items = session.exec(query.offset(offset).limit(page_size)).all()

    all_symbols = list({i.symbol for i in items if i.symbol})
    stock_map: Dict[str, str] = {}
    if all_symbols:
        stocks = session.exec(select(Stock).where(Stock.symbol.in_(all_symbols))).all()
        stock_map = {s.symbol: s.name for s in stocks}

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_news_item_to_dict(i, stock_map) for i in items],
    }

def get_news_detail(
    session: Session,
    news_id: int,
) -> Optional[Dict[str, Any]]:
    item = session.get(NewsItem, news_id)
    if not item:
        return None

    stock_map: Dict[str, str] = {}
    if item.symbol:
        stock = session.exec(select(Stock).where(Stock.symbol == item.symbol)).first()
        if stock:
            stock_map[item.symbol] = stock.name

    result = _news_item_to_dict(item, stock_map)
    result["raw_html"] = item.raw_html
    return result

def get_hot_stocks(
    session: Session,
    top_n: int = 20,
    target_date: Optional[date] = None,
) -> Dict[str, Any]:
    if target_date is None:
        target_date = date.today()

    start_dt = datetime(target_date.year, target_date.month, target_date.day)
    end_dt = start_dt + timedelta(days=1)

    count_stmt = (
        select(NewsItem.symbol, func.count(NewsItem.id).label("cnt"))
        .where(NewsItem.symbol != None)
        .where(NewsItem.publish_time >= start_dt)
        .where(NewsItem.publish_time < end_dt)
        .group_by(NewsItem.symbol)
        .order_by(func.count(NewsItem.id).desc())
        .limit(top_n)
    )

    rows = session.exec(count_stmt).all()

    symbol_counts: List[Dict[str, Any]] = []
    for row in rows:
        symbol = row[0]
        cnt = row[1]
        symbol_counts.append({"symbol": symbol, "news_count": cnt})

    sym_list = [s["symbol"] for s in symbol_counts]
    stock_map: Dict[str, str] = {}
    if sym_list:
        stocks = session.exec(select(Stock).where(Stock.symbol.in_(sym_list))).all()
        stock_map = {s.symbol: s.name for s in stocks}

    items = [
        {
            "symbol": sc["symbol"],
            "name": stock_map.get(sc["symbol"], sc["symbol"]),
            "news_count": sc["news_count"],
        }
        for sc in symbol_counts
    ]

    return {
        "date": target_date.isoformat(),
        "top_n": top_n,
        "items": items,
    }

def get_news_by_symbol(
    session: Session,
    symbol: str,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    items = session.exec(
        select(NewsItem)
        .where(NewsItem.symbol == symbol)
        .order_by(NewsItem.publish_time.desc())
        .limit(limit)
    ).all()

    stock_map: Dict[str, str] = {}
    stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
    if stock:
        stock_map[symbol] = stock.name

    return [_news_item_to_dict(i, stock_map) for i in items]

def get_sector_list_for_filter(session: Session) -> List[Dict[str, Any]]:
    """
    获取有资讯数据的行业板块列表，用于筛选器
    """
    sectors = session.exec(
        select(NewsItem.sector, func.count(NewsItem.id).label("cnt"))
        .where(NewsItem.sector != None)
        .where(NewsItem.sector != "")
        .group_by(NewsItem.sector)
        .order_by(func.count(NewsItem.id).desc())
    ).all()

    result = []
    for row in sectors:
        sector_name = row[0]
        count = row[1]
        result.append({
            "sector": sector_name,
            "news_count": count,
        })

    if not result:
        stocks = session.exec(
            select(Stock)
            .where(Stock.industry != None)
            .where(Stock.industry != "")
        ).all()
        sector_counts: Dict[str, int] = {}
        for s in stocks:
            sector_counts[s.industry] = sector_counts.get(s.industry, 0) + 1
        for sec, cnt in sorted(sector_counts.items(), key=lambda x: -x[1]):
            result.append({
                "sector": sec,
                "news_count": 0,
            })

    return result
