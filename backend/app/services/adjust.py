from datetime import date
from typing import List, Dict, Any
import pandas as pd
from sqlmodel import Session, select
from app.models import DailyPrice, DividendEvent


def _get_dividend_events(session: Session, stock_id: int, start_date: date, end_date: date) -> List[DividendEvent]:
    return session.exec(
        select(DividendEvent)
        .where(DividendEvent.stock_id == stock_id)
        .where(DividendEvent.ex_date >= start_date)
        .where(DividendEvent.ex_date <= end_date)
        .order_by(DividendEvent.ex_date)
    ).all()


def _ex_adjust_factor(close_before: float, event: DividendEvent) -> float:
    if close_before <= 0:
        return 1.0
    cash = event.cash_dividend
    bonus = event.bonus_ratio
    rights = event.rights_ratio
    rights_price = event.rights_price
    denom = close_before - cash + rights_price * rights
    numer = close_before * (1 + bonus + rights)
    if denom <= 0:
        return 1.0
    return numer / denom


def adjust_prices(
    session: Session,
    stock_id: int,
    start_date: date,
    end_date: date,
    frequency: str = "D",
    adjust: str = "none",
) -> Dict[str, Any]:
    prices = session.exec(
        select(DailyPrice)
        .where(DailyPrice.stock_id == stock_id)
        .where(DailyPrice.trade_date >= start_date)
        .where(DailyPrice.trade_date <= end_date)
        .order_by(DailyPrice.trade_date)
    ).all()

    if not prices:
        return {"prices": [], "dividend_events": []}

    events = _get_dividend_events(session, stock_id, start_date, end_date)

    df = pd.DataFrame([p.dict() for p in prices])
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df = df.sort_values("trade_date").reset_index(drop=True)

    if adjust != "none" and events:
        df = _apply_adjust(df, events, adjust)

    if frequency != "D":
        df = _resample(df, frequency)

    if pd.api.types.is_datetime64_any_dtype(df["trade_date"]):
        df["trade_date"] = df["trade_date"].dt.strftime("%Y-%m-%d")

    return {
        "prices": df.to_dict(orient="records") if not df.empty else [],
        "dividend_events": [_event_to_dict(e) for e in events],
    }


def _apply_adjust(df: pd.DataFrame, events: List[DividendEvent], mode: str) -> pd.DataFrame:
    df = df.copy()
    sorted_events = sorted(events, key=lambda e: e.ex_date)

    event_factors: Dict[str, float] = {}
    for ev in sorted_events:
        ev_str = ev.ex_date.isoformat()
        prev_close = _find_prev_close(df, ev.ex_date)
        if prev_close is not None:
            event_factors[ev_str] = _ex_adjust_factor(prev_close, ev)
        else:
            event_factors[ev_str] = 1.0

    factors = [1.0] * len(df)
    if mode == "hfq":
        cum = 1.0
        for i in range(len(df)):
            dt_str = df.iloc[i]["trade_date"].strftime("%Y-%m-%d")
            if dt_str in event_factors:
                cum *= event_factors[dt_str]
            factors[i] = cum
    elif mode == "qfq":
        cum = 1.0
        for i in range(len(df) - 1, -1, -1):
            dt_str = df.iloc[i]["trade_date"].strftime("%Y-%m-%d")
            factors[i] = cum
            if dt_str in event_factors:
                cum /= event_factors[dt_str]

    df["open"] = (df["open"] * factors).round(4)
    df["high"] = (df["high"] * factors).round(4)
    df["low"] = (df["low"] * factors).round(4)
    df["close"] = (df["close"] * factors).round(4)
    return df


def _find_prev_close(df: pd.DataFrame, ex_date: date) -> float | None:
    target = pd.Timestamp(ex_date)
    prev_rows = df[df["trade_date"] < target]
    if prev_rows.empty:
        return None
    return prev_rows.iloc[-1]["close"]


def _resample(df: pd.DataFrame, frequency: str) -> pd.DataFrame:
    if "trade_date" not in df.columns:
        return df
    if not pd.api.types.is_datetime64_any_dtype(df["trade_date"]):
        df["trade_date"] = pd.to_datetime(df["trade_date"])
    df_indexed = df.set_index("trade_date")
    rule = "W" if frequency == "W" else "M"
    resampled = df_indexed.resample(rule).agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }).dropna()
    resampled = resampled.reset_index()
    return resampled


def _event_to_dict(e: DividendEvent) -> Dict[str, Any]:
    return {
        "id": e.id,
        "stock_id": e.stock_id,
        "ex_date": e.ex_date.isoformat() if hasattr(e.ex_date, "isoformat") else str(e.ex_date),
        "cash_dividend": e.cash_dividend,
        "bonus_ratio": e.bonus_ratio,
        "rights_ratio": e.rights_ratio,
        "rights_price": e.rights_price,
    }
