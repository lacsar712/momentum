import json
import random
import time
from datetime import date, timedelta
from typing import List, Dict, Any, Optional, Callable
import pandas as pd
import akshare as ak
from sqlmodel import select, Session
from app.models import LhbRecord
from app.services.data_sources import random_delay, exponential_backoff_delay


def sync_lhb_daily(
    session: Session,
    target_date: date,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> int:
    last_error = None
    for attempt in range(3):
        try:
            random_delay(0.5, 1.5)
            df = ak.stock_lhb_detail_em(
                start_date=target_date.strftime("%Y%m%d"),
                end_date=target_date.strftime("%Y%m%d"),
            )
            if df is None or df.empty:
                if progress_callback:
                    progress_callback(0, 0, f"{target_date} 无龙虎榜数据")
                return 0

            count = _upsert_lhb_records(session, df)
            if progress_callback:
                progress_callback(1, 1, f"{target_date} 同步完成，入库 {count} 条")
            return count
        except Exception as e:
            last_error = e
            print(f"[LHB] 同步失败 (尝试 {attempt + 1}/3): {e}")
            exponential_backoff_delay(attempt)

    if progress_callback:
        progress_callback(0, 0, f"同步失败: {last_error}")
    raise last_error if last_error else RuntimeError("龙虎榜数据同步失败")


def sync_lhb_range(
    session: Session,
    start_date: date,
    end_date: date,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> int:
    total_days = (end_date - start_date).days + 1
    total_count = 0
    current = 0

    current_date = start_date
    while current_date <= end_date:
        if current_date.weekday() < 5:
            try:
                count = sync_lhb_daily(session, current_date)
                total_count += count
            except Exception as e:
                print(f"[LHB] {current_date} 同步跳过: {e}")
        current += 1
        if progress_callback:
            progress_callback(current, total_days, f"正在同步 {current_date}")
        current_date += timedelta(days=1)

    if progress_callback:
        progress_callback(total_days, total_days, f"区间同步完成，共入库 {total_count} 条")
    return total_count


def _upsert_lhb_records(session: Session, df: pd.DataFrame) -> int:
    count = 0
    for _, row in df.iterrows():
        symbol = str(row.get("代码", "")).strip()
        name = str(row.get("名称", "")).strip()
        trade_date_val = row.get("日期")
        if isinstance(trade_date_val, str):
            trade_date = pd.to_datetime(trade_date_val).date()
        elif hasattr(trade_date_val, "date"):
            trade_date = trade_date_val.date()
        else:
            continue

        reason = str(row.get("上榜原因", "")).strip()

        buy_brokerages = _extract_brokerages(row, "买入")
        sell_brokerages = _extract_brokerages(row, "卖出")

        net_buy = row.get("净买入额")
        if pd.isna(net_buy):
            net_buy = None
        total_amt = row.get("合计成交额")
        if pd.isna(total_amt):
            total_amt = None

        existing = session.exec(
            select(LhbRecord).where(
                LhbRecord.symbol == symbol,
                LhbRecord.trade_date == trade_date,
                LhbRecord.reason == reason,
            )
        ).first()

        if existing:
            existing.buy_brokerages_json = json.dumps(buy_brokerages, ensure_ascii=False)
            existing.sell_brokerages_json = json.dumps(sell_brokerages, ensure_ascii=False)
            existing.net_buy_amount = net_buy
            existing.total_amount = total_amt
            session.add(existing)
        else:
            record = LhbRecord(
                symbol=symbol,
                name=name,
                trade_date=trade_date,
                reason=reason,
                buy_brokerages_json=json.dumps(buy_brokerages, ensure_ascii=False),
                sell_brokerages_json=json.dumps(sell_brokerages, ensure_ascii=False),
                net_buy_amount=net_buy,
                total_amount=total_amt,
            )
            session.add(record)
        count += 1

    session.commit()
    return count


def _extract_brokerages(row: pd.Series, direction: str) -> List[Dict[str, Any]]:
    result = []
    for i in range(1, 6):
        name_col = f"{direction}营业部{i}" if f"{direction}营业部{i}" in row.index else None
        amt_col = f"{direction}金额{i}" if f"{direction}金额{i}" in row.index else None
        if name_col and pd.notna(row.get(name_col)) and str(row.get(name_col, "")).strip():
            entry: Dict[str, Any] = {"name": str(row[name_col]).strip()}
            if amt_col and pd.notna(row.get(amt_col)):
                try:
                    entry["amount"] = float(row[amt_col])
                except (ValueError, TypeError):
                    pass
            result.append(entry)
    return result


def query_lhb_by_date(session: Session, target_date: date) -> List[Dict[str, Any]]:
    records = session.exec(
        select(LhbRecord).where(LhbRecord.trade_date == target_date)
    ).all()
    return [_record_to_dict(r) for r in records]


def query_lhb_by_symbol(session: Session, symbol: str, limit: int = 50) -> List[Dict[str, Any]]:
    records = session.exec(
        select(LhbRecord)
        .where(LhbRecord.symbol == symbol)
        .order_by(LhbRecord.trade_date.desc())
        .limit(limit)
    ).all()
    return [_record_to_dict(r) for r in records]


def query_lhb_by_brokerage(
    session: Session, brokerage_name: str, recent_days: int = 30
) -> List[Dict[str, Any]]:
    cutoff = date.today() - timedelta(days=recent_days)
    all_records = session.exec(
        select(LhbRecord).where(LhbRecord.trade_date >= cutoff)
    ).all()

    results = []
    for record in all_records:
        buy_list = json.loads(record.buy_brokerages_json) if record.buy_brokerages_json else []
        sell_list = json.loads(record.sell_brokerages_json) if record.sell_brokerages_json else []
        matched_buy = [b for b in buy_list if brokerage_name in b.get("name", "")]
        matched_sell = [s for s in sell_list if brokerage_name in s.get("name", "")]
        if matched_buy or matched_sell:
            d = _record_to_dict(record)
            d["matched_buy"] = matched_buy
            d["matched_sell"] = matched_sell
            results.append(d)
    return results


def query_brokerage_ranking(
    session: Session, start_date: date, end_date: date
) -> List[Dict[str, Any]]:
    records = session.exec(
        select(LhbRecord).where(
            LhbRecord.trade_date >= start_date,
            LhbRecord.trade_date <= end_date,
        )
    ).all()

    stats: Dict[str, Dict[str, Any]] = {}
    for record in records:
        buy_list = json.loads(record.buy_brokerages_json) if record.buy_brokerages_json else []
        sell_list = json.loads(record.sell_brokerages_json) if record.sell_brokerages_json else []

        for b in buy_list:
            name = b.get("name", "")
            if not name:
                continue
            if name not in stats:
                stats[name] = {"name": name, "count": 0, "net_buy": 0.0}
            stats[name]["count"] += 1
            amt = b.get("amount", 0)
            if amt:
                stats[name]["net_buy"] += amt

        for s in sell_list:
            name = s.get("name", "")
            if not name:
                continue
            if name not in stats:
                stats[name] = {"name": name, "count": 0, "net_buy": 0.0}
            stats[name]["count"] += 1
            amt = s.get("amount", 0)
            if amt:
                stats[name]["net_buy"] -= amt

    result = list(stats.values())
    result.sort(key=lambda x: x["count"], reverse=True)
    for item in result:
        item["net_buy"] = round(item["net_buy"], 2)
    return result


def query_reason_aggregation(
    session: Session, start_date: date, end_date: date
) -> List[Dict[str, Any]]:
    records = session.exec(
        select(LhbRecord).where(
            LhbRecord.trade_date >= start_date,
            LhbRecord.trade_date <= end_date,
        )
    ).all()

    stats: Dict[str, Dict[str, Any]] = {}
    for record in records:
        reason = record.reason or "未知"
        if reason not in stats:
            stats[reason] = {"reason": reason, "count": 0, "total_net_buy": 0.0, "total_amount": 0.0}
        stats[reason]["count"] += 1
        if record.net_buy_amount is not None:
            stats[reason]["total_net_buy"] += record.net_buy_amount
        if record.total_amount is not None:
            stats[reason]["total_amount"] += record.total_amount

    result = list(stats.values())
    result.sort(key=lambda x: x["count"], reverse=True)
    for item in result:
        item["total_net_buy"] = round(item["total_net_buy"], 2)
        item["total_amount"] = round(item["total_amount"], 2)
    return result


def _record_to_dict(record: LhbRecord) -> Dict[str, Any]:
    return {
        "id": record.id,
        "symbol": record.symbol,
        "name": record.name,
        "trade_date": record.trade_date.isoformat(),
        "reason": record.reason,
        "buy_brokerages": json.loads(record.buy_brokerages_json) if record.buy_brokerages_json else [],
        "sell_brokerages": json.loads(record.sell_brokerages_json) if record.sell_brokerages_json else [],
        "net_buy_amount": record.net_buy_amount,
        "total_amount": record.total_amount,
    }
