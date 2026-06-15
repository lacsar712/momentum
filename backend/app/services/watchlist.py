from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy import func, and_
from sqlmodel import select, Session
from app.models import WatchGroup, WatchItem, Stock, StockSnapshot, DailyPrice


def list_groups(session: Session, user_id: int) -> List[Dict[str, Any]]:
    groups = session.exec(
        select(WatchGroup)
        .where(WatchGroup.user_id == user_id)
        .order_by(WatchGroup.sort_weight.desc(), WatchGroup.created_at.asc())
    ).all()
    result = []
    for g in groups:
        item_count = len(session.exec(
            select(WatchItem).where(WatchItem.group_id == g.id)
        ).all())
        result.append({
            "id": g.id,
            "name": g.name,
            "sort_weight": g.sort_weight,
            "created_at": g.created_at.isoformat() if g.created_at else None,
            "item_count": item_count,
        })
    return result


def create_group(session: Session, user_id: int, name: str) -> Dict[str, Any]:
    max_weight = session.exec(
        select(func.max(WatchGroup.sort_weight))
        .where(WatchGroup.user_id == user_id)
    ).first()
    weight = (max_weight or 0) + 1
    group = WatchGroup(user_id=user_id, name=name, sort_weight=weight)
    session.add(group)
    session.commit()
    session.refresh(group)
    return {
        "id": group.id,
        "name": group.name,
        "sort_weight": group.sort_weight,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "item_count": 0,
    }


def update_group(session: Session, user_id: int, group_id: int, name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    group = session.exec(
        select(WatchGroup).where(WatchGroup.id == group_id, WatchGroup.user_id == user_id)
    ).first()
    if not group:
        return None
    if name is not None:
        group.name = name
    session.add(group)
    session.commit()
    session.refresh(group)
    item_count = len(session.exec(
        select(WatchItem).where(WatchItem.group_id == group.id)
    ).all())
    return {
        "id": group.id,
        "name": group.name,
        "sort_weight": group.sort_weight,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "item_count": item_count,
    }


def delete_group(session: Session, user_id: int, group_id: int) -> bool:
    group = session.exec(
        select(WatchGroup).where(WatchGroup.id == group_id, WatchGroup.user_id == user_id)
    ).first()
    if not group:
        return False
    items = session.exec(
        select(WatchItem).where(WatchItem.group_id == group_id)
    ).all()
    for item in items:
        session.delete(item)
    session.delete(group)
    session.commit()
    return True


def reorder_groups(session: Session, user_id: int, ordered_ids: List[int]) -> bool:
    groups = session.exec(
        select(WatchGroup).where(WatchGroup.user_id == user_id)
    ).all()
    group_map = {g.id: g for g in groups}
    total = len(ordered_ids)
    for idx, gid in enumerate(ordered_ids):
        if gid in group_map:
            group_map[gid].sort_weight = total - idx
    session.commit()
    return True


def add_item(session: Session, user_id: int, stock_id: int, group_id: int, note: Optional[str] = None) -> Optional[Dict[str, Any]]:
    group = session.exec(
        select(WatchGroup).where(WatchGroup.id == group_id, WatchGroup.user_id == user_id)
    ).first()
    if not group:
        return None
    existing = session.exec(
        select(WatchItem).where(
            WatchItem.user_id == user_id,
            WatchItem.stock_id == stock_id,
            WatchItem.group_id == group_id,
        )
    ).first()
    if existing:
        if note is not None:
            existing.note = note
            session.add(existing)
            session.commit()
            session.refresh(existing)
        return _item_to_dict(existing)
    item = WatchItem(user_id=user_id, stock_id=stock_id, group_id=group_id, note=note)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_to_dict(item)


def remove_item(session: Session, user_id: int, item_id: int) -> bool:
    item = session.exec(
        select(WatchItem).where(WatchItem.id == item_id, WatchItem.user_id == user_id)
    ).first()
    if not item:
        return False
    session.delete(item)
    session.commit()
    return True


def update_item_note(session: Session, user_id: int, item_id: int, note: str) -> Optional[Dict[str, Any]]:
    item = session.exec(
        select(WatchItem).where(WatchItem.id == item_id, WatchItem.user_id == user_id)
    ).first()
    if not item:
        return None
    item.note = note
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_to_dict(item)


def move_item(session: Session, user_id: int, item_id: int, target_group_id: int) -> Optional[Dict[str, Any]]:
    item = session.exec(
        select(WatchItem).where(WatchItem.id == item_id, WatchItem.user_id == user_id)
    ).first()
    if not item:
        return None
    target_group = session.exec(
        select(WatchGroup).where(WatchGroup.id == target_group_id, WatchGroup.user_id == user_id)
    ).first()
    if not target_group:
        return None
    existing = session.exec(
        select(WatchItem).where(
            WatchItem.user_id == user_id,
            WatchItem.stock_id == item.stock_id,
            WatchItem.group_id == target_group_id,
        )
    ).first()
    if existing:
        session.delete(item)
        session.commit()
        return _item_to_dict(existing)
    item.group_id = target_group_id
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_to_dict(item)


def batch_import(session: Session, user_id: int, group_id: int, stock_ids: List[int]) -> List[Dict[str, Any]]:
    group = session.exec(
        select(WatchGroup).where(WatchGroup.id == group_id, WatchGroup.user_id == user_id)
    ).first()
    if not group:
        return []
    existing_items = session.exec(
        select(WatchItem).where(
            WatchItem.user_id == user_id,
            WatchItem.group_id == group_id,
        )
    ).all()
    existing_stock_ids = {i.stock_id for i in existing_items}
    results = []
    for sid in stock_ids:
        if sid in existing_stock_ids:
            continue
        stock = session.exec(select(Stock).where(Stock.id == sid)).first()
        if not stock:
            continue
        item = WatchItem(user_id=user_id, stock_id=sid, group_id=group_id)
        session.add(item)
        results.append(item)
        existing_stock_ids.add(sid)
    session.commit()
    for item in results:
        session.refresh(item)
    return [_item_to_dict(i) for i in results]


def query_group_items(session: Session, user_id: int, group_id: int) -> List[Dict[str, Any]]:
    group = session.exec(
        select(WatchGroup).where(WatchGroup.id == group_id, WatchGroup.user_id == user_id)
    ).first()
    if not group:
        return []
    items = session.exec(
        select(WatchItem).where(WatchItem.group_id == group_id, WatchItem.user_id == user_id)
        .order_by(WatchItem.added_at.desc())
    ).all()
    if not items:
        return []
    stock_ids = [i.stock_id for i in items]
    stocks = session.exec(
        select(Stock).where(Stock.id.in_(stock_ids))
    ).all()
    stock_map = {s.id: s for s in stocks}
    snapshots = session.exec(
        select(StockSnapshot).where(StockSnapshot.stock_id.in_(stock_ids))
    ).all()
    snapshot_map = {s.stock_id: s for s in snapshots}
    five_days_ago = date.today() - timedelta(days=7)
    price_5d_map: Dict[int, float] = {}
    for sid in stock_ids:
        price_5d = session.exec(
            select(DailyPrice)
            .where(DailyPrice.stock_id == sid, DailyPrice.trade_date >= five_days_ago)
            .order_by(DailyPrice.trade_date.asc())
            .limit(1)
        ).first()
        if price_5d:
            price_5d_map[sid] = price_5d.close
    item_map = {i.stock_id: i for i in items}
    result = []
    for stock in stocks:
        item = item_map.get(stock.id)
        if not item:
            continue
        snap = snapshot_map.get(stock.id)
        latest_close = snap.close if snap else None
        daily_change = None
        if snap:
            prev_day = session.exec(
                select(DailyPrice)
                .where(DailyPrice.stock_id == stock.id, DailyPrice.trade_date < snap.latest_date)
                .order_by(DailyPrice.trade_date.desc())
                .limit(1)
            ).first()
            if prev_day and prev_day.close > 0:
                daily_change = round((snap.close - prev_day.close) / prev_day.close * 100, 2)
        five_day_change = None
        if latest_close and stock.id in price_5d_map:
            prev_close = price_5d_map[stock.id]
            if prev_close and prev_close > 0:
                five_day_change = round((latest_close - prev_close) / prev_close * 100, 2)
        result.append({
            "item_id": item.id,
            "stock_id": stock.id,
            "symbol": stock.symbol,
            "name": stock.name,
            "market": stock.market,
            "latest_close": latest_close,
            "daily_change": daily_change,
            "five_day_change": five_day_change,
            "note": item.note,
            "added_at": item.added_at.isoformat() if item.added_at else None,
        })
    return result


def _item_to_dict(item: WatchItem) -> Dict[str, Any]:
    return {
        "id": item.id,
        "user_id": item.user_id,
        "stock_id": item.stock_id,
        "group_id": item.group_id,
        "note": item.note,
        "added_at": item.added_at.isoformat() if item.added_at else None,
    }
