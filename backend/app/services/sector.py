"""
行业板块分析服务 - 提供行业聚合视图相关功能
"""
from datetime import date
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
from sqlalchemy import func, and_
from sqlmodel import select, Session
from app.models import Stock, DailyPrice


def get_sector_list(session: Session) -> List[Dict[str, Any]]:
    """
    获取行业列表，包含每个行业的汇总指标

    Returns:
        行业列表，每个行业包含：行业名称、成员股数、平均PE、平均PB、总市值、当日涨跌幅
    """
    stocks = session.exec(
        select(Stock)
        .where(Stock.industry != None)
        .where(Stock.industry != "")
    ).all()

    if not stocks:
        return []

    stock_ids = [s.id for s in stocks]

    latest_prices_subquery = (
        select(
            DailyPrice.stock_id,
            func.max(DailyPrice.trade_date).label("latest_date")
        )
        .where(DailyPrice.stock_id.in_(stock_ids))
        .group_by(DailyPrice.stock_id)
        .subquery()
    )

    latest_prices = session.exec(
        select(DailyPrice)
        .join(
            latest_prices_subquery,
            and_(
                DailyPrice.stock_id == latest_prices_subquery.c.stock_id,
                DailyPrice.trade_date == latest_prices_subquery.c.latest_date
            )
        )
    ).all()

    price_map = {p.stock_id: p for p in latest_prices}

    prev_date_subquery = (
        select(
            DailyPrice.stock_id,
            func.max(DailyPrice.trade_date).label("prev_date")
        )
        .where(DailyPrice.stock_id.in_(stock_ids))
        .where(DailyPrice.trade_date < select(func.max(DailyPrice.trade_date)).scalar_subquery())
        .group_by(DailyPrice.stock_id)
        .subquery()
    )

    prev_prices = session.exec(
        select(DailyPrice)
        .join(
            prev_date_subquery,
            and_(
                DailyPrice.stock_id == prev_date_subquery.c.stock_id,
                DailyPrice.trade_date == prev_date_subquery.c.prev_date
            )
        )
    ).all()

    prev_price_map = {p.stock_id: p for p in prev_prices}

    sector_data: Dict[str, Dict[str, Any]] = {}

    for stock in stocks:
        industry = stock.industry
        if not industry:
            continue

        if industry not in sector_data:
            sector_data[industry] = {
                "industry": industry,
                "stock_count": 0,
                "total_market_cap": 0.0,
                "pe_sum": 0.0,
                "pe_count": 0,
                "pb_sum": 0.0,
                "pb_count": 0,
                "change_sum": 0.0,
                "change_count": 0,
            }

        data = sector_data[industry]
        data["stock_count"] += 1

        if stock.market_cap and stock.market_cap > 0:
            data["total_market_cap"] += stock.market_cap

        if stock.pe_ratio and stock.pe_ratio > 0:
            data["pe_sum"] += stock.pe_ratio
            data["pe_count"] += 1

        if stock.pb_ratio and stock.pb_ratio > 0:
            data["pb_sum"] += stock.pb_ratio
            data["pb_count"] += 1

        latest_price = price_map.get(stock.id)
        prev_price = prev_price_map.get(stock.id)
        if latest_price and prev_price and prev_price.close > 0:
            daily_change = (latest_price.close - prev_price.close) / prev_price.close
            data["change_sum"] += daily_change
            data["change_count"] += 1

    result = []
    for industry, data in sector_data.items():
        avg_pe = data["pe_sum"] / data["pe_count"] if data["pe_count"] > 0 else None
        avg_pb = data["pb_sum"] / data["pb_count"] if data["pb_count"] > 0 else None
        avg_change = data["change_sum"] / data["change_count"] * 100 if data["change_count"] > 0 else None

        result.append({
            "industry": industry,
            "stock_count": data["stock_count"],
            "avg_pe": round(avg_pe, 2) if avg_pe is not None else None,
            "avg_pb": round(avg_pb, 2) if avg_pb is not None else None,
            "total_market_cap": round(data["total_market_cap"], 2),
            "daily_change_pct": round(avg_change, 2) if avg_change is not None else None,
        })

    return sorted(result, key=lambda x: x["stock_count"], reverse=True)


def get_sector_detail(session: Session, industry: str) -> Optional[Dict[str, Any]]:
    """
    获取行业详情

    Args:
        industry: 行业名称

    Returns:
        行业详情，包含指数曲线、Top/Bottom成分股、平均换手率序列
    """
    stocks = session.exec(
        select(Stock)
        .where(Stock.industry == industry)
    ).all()

    if not stocks:
        return None

    stock_ids = [s.id for s in stocks]

    all_prices = session.exec(
        select(DailyPrice)
        .where(DailyPrice.stock_id.in_(stock_ids))
        .order_by(DailyPrice.trade_date)
    ).all()

    if not all_prices:
        return {
            "industry": industry,
            "stock_count": len(stocks),
            "index_curve": [],
            "top_gainers": [],
            "top_losers": [],
            "turnover_series": [],
        }

    price_dict: Dict[int, List[DailyPrice]] = {}
    for p in all_prices:
        if p.stock_id not in price_dict:
            price_dict[p.stock_id] = []
        price_dict[p.stock_id].append(p)

    all_dates = sorted(set(p.trade_date for p in all_prices))

    index_curve = _compute_equal_weight_index(price_dict, stock_ids, all_dates)

    top_gainers, top_losers = _get_top_bottom_stocks(stocks, price_dict, all_dates)

    turnover_series = _compute_turnover_series(stocks, price_dict, all_dates)

    return {
        "industry": industry,
        "stock_count": len(stocks),
        "index_curve": index_curve,
        "top_gainers": top_gainers,
        "top_losers": top_losers,
        "turnover_series": turnover_series,
    }


def _compute_equal_weight_index(
    price_dict: Dict[int, List[DailyPrice]],
    stock_ids: List[int],
    all_dates: List[date]
) -> List[Dict[str, Any]]:
    """
    基于成员股每日等权收益率合成行业指数曲线
    """
    if not all_dates:
        return []

    date_returns: Dict[date, List[float]] = {d: [] for d in all_dates}

    for stock_id in stock_ids:
        prices = price_dict.get(stock_id, [])
        if len(prices) < 2:
            continue

        price_by_date = {p.trade_date: p.close for p in prices}
        sorted_dates = sorted(price_by_date.keys())

        for i in range(1, len(sorted_dates)):
            d = sorted_dates[i]
            prev_close = price_by_date[sorted_dates[i - 1]]
            curr_close = price_by_date[d]
            if prev_close > 0:
                daily_return = (curr_close - prev_close) / prev_close
                if d in date_returns:
                    date_returns[d].append(daily_return)

    index_value = 1000.0
    index_curve = []
    base_date = all_dates[0]

    for d in all_dates:
        returns = date_returns.get(d, [])
        if returns:
            avg_return = sum(returns) / len(returns)
            index_value *= (1 + avg_return)

        index_curve.append({
            "trade_date": d.strftime("%Y-%m-%d"),
            "close": round(index_value, 2),
        })

    return index_curve


def _get_top_bottom_stocks(
    stocks: List[Stock],
    price_dict: Dict[int, List[DailyPrice]],
    all_dates: List[date]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    获取行业内涨跌幅 Top 10 / Bottom 10 成分股
    """
    if len(all_dates) < 2:
        return [], []

    last_date = all_dates[-1]
    prev_date = all_dates[-2]

    stock_changes = []
    for stock in stocks:
        prices = price_dict.get(stock.id, [])
        price_by_date = {p.trade_date: p for p in prices}

        last_price = price_by_date.get(last_date)
        prev_price = price_by_date.get(prev_date)

        if last_price and prev_price and prev_price.close > 0:
            change_pct = (last_price.close - prev_price.close) / prev_price.close * 100
            stock_changes.append({
                "symbol": stock.symbol,
                "name": stock.name,
                "close": last_price.close,
                "change_pct": round(change_pct, 2),
                "market_cap": stock.market_cap,
            })

    sorted_by_gain = sorted(stock_changes, key=lambda x: x["change_pct"], reverse=True)
    top_gainers = sorted_by_gain[:10]
    top_losers = list(reversed(sorted_by_gain[-10:])) if len(sorted_by_gain) >= 10 else list(reversed(sorted_by_gain))

    return top_gainers, top_losers


def _compute_turnover_series(
    stocks: List[Stock],
    price_dict: Dict[int, List[DailyPrice]],
    all_dates: List[date]
) -> List[Dict[str, Any]]:
    """
    计算行业平均换手率序列
    使用成交额/市值作为换手率代理指标
    """
    turnover_series = []

    stock_market_caps = {s.id: s.market_cap for s in stocks if s.market_cap and s.market_cap > 0}

    for d in all_dates:
        day_turnovers = []
        for stock_id, market_cap in stock_market_caps.items():
            prices = price_dict.get(stock_id, [])
            price_by_date = {p.trade_date: p for p in prices}
            price = price_by_date.get(d)
            if price and price.amount and price.amount > 0:
                turnover = price.amount / market_cap * 100
                day_turnovers.append(turnover)

        if day_turnovers:
            avg_turnover = sum(day_turnovers) / len(day_turnovers)
            turnover_series.append({
                "trade_date": d.strftime("%Y-%m-%d"),
                "turnover_rate": round(avg_turnover, 4),
            })

    return turnover_series


def get_sector_fund_flow_ranking(
    session: Session,
    window: int = 5
) -> List[Dict[str, Any]]:
    """
    行业资金流入排行榜

    基于 DailyPrice.amount 差分作为资金流代理指标

    Args:
        window: 时间窗口 (5/10/20 日)

    Returns:
        行业资金流排序列表
    """
    if window not in [5, 10, 20]:
        window = 5

    stocks = session.exec(
        select(Stock)
        .where(Stock.industry != None)
        .where(Stock.industry != "")
    ).all()

    if not stocks:
        return []

    stock_ids = [s.id for s in stocks]

    all_prices = session.exec(
        select(DailyPrice)
        .where(DailyPrice.stock_id.in_(stock_ids))
        .where(DailyPrice.amount != None)
        .order_by(DailyPrice.trade_date.desc())
    ).all()

    if not all_prices:
        return []

    price_df = pd.DataFrame([{
        "stock_id": p.stock_id,
        "trade_date": p.trade_date,
        "amount": p.amount,
        "close": p.close,
    } for p in all_prices])

    price_df = price_df.sort_values("trade_date")

    sector_amounts: Dict[str, pd.DataFrame] = {}

    for stock in stocks:
        industry = stock.industry
        if not industry:
            continue

        stock_prices = price_df[price_df["stock_id"] == stock.id].copy()
        if stock_prices.empty:
            continue

        stock_prices = stock_prices.sort_values("trade_date")

        if industry not in sector_amounts:
            sector_amounts[industry] = pd.DataFrame()

        if sector_amounts[industry].empty:
            sector_amounts[industry] = stock_prices[["trade_date", "amount"]].copy()
        else:
            sector_amounts[industry] = pd.concat([
                sector_amounts[industry],
                stock_prices[["trade_date", "amount"]].copy()
            ])

    result = []
    for industry, df in sector_amounts.items():
        daily_amount = df.groupby("trade_date")["amount"].sum().reset_index()
        daily_amount = daily_amount.sort_values("trade_date")

        if len(daily_amount) < window + 1:
            continue

        recent = daily_amount.tail(window + 1)
        recent["amount_diff"] = recent["amount"].diff()
        avg_flow = recent["amount_diff"].iloc[1:].mean()

        total_flow = recent["amount_diff"].iloc[1:].sum()

        stock_count = len([s for s in stocks if s.industry == industry])

        result.append({
            "industry": industry,
            "stock_count": stock_count,
            "avg_fund_flow": round(avg_flow, 2) if pd.notna(avg_flow) else 0,
            "total_fund_flow": round(total_flow, 2) if pd.notna(total_flow) else 0,
            "window_days": window,
        })

    result.sort(key=lambda x: x["avg_fund_flow"], reverse=True)

    return result


def get_stock_sector_percentile(
    session: Session,
    symbol: str
) -> Optional[Dict[str, Any]]:
    """
    获取单只股票在所属行业内的分位数

    Args:
        symbol: 股票代码

    Returns:
        股票在行业内的分位数信息
    """
    stock = session.exec(
        select(Stock).where(Stock.symbol == symbol)
    ).first()

    if not stock or not stock.industry:
        return None

    industry = stock.industry

    industry_stocks = session.exec(
        select(Stock)
        .where(Stock.industry == industry)
    ).all()

    if not industry_stocks:
        return None

    stock_ids = [s.id for s in industry_stocks]

    latest_prices_subquery = (
        select(
            DailyPrice.stock_id,
            func.max(DailyPrice.trade_date).label("latest_date")
        )
        .where(DailyPrice.stock_id.in_(stock_ids))
        .group_by(DailyPrice.stock_id)
        .subquery()
    )

    latest_prices = session.exec(
        select(DailyPrice)
        .join(
            latest_prices_subquery,
            and_(
                DailyPrice.stock_id == latest_prices_subquery.c.stock_id,
                DailyPrice.trade_date == latest_prices_subquery.c.latest_date
            )
        )
    ).all()

    latest_price_map = {p.stock_id: p for p in latest_prices}

    prev_date_subquery = (
        select(
            DailyPrice.stock_id,
            func.max(DailyPrice.trade_date).label("prev_date")
        )
        .where(DailyPrice.stock_id.in_(stock_ids))
        .where(
            DailyPrice.trade_date < select(
                func.max(DailyPrice.trade_date)
            ).where(DailyPrice.stock_id.in_(stock_ids)).scalar_subquery()
        )
        .group_by(DailyPrice.stock_id)
        .subquery()
    )

    prev_prices = session.exec(
        select(DailyPrice)
        .join(
            prev_date_subquery,
            and_(
                DailyPrice.stock_id == prev_date_subquery.c.stock_id,
                DailyPrice.trade_date == prev_date_subquery.c.prev_date
            )
        )
    ).all()

    prev_price_map = {p.stock_id: p for p in prev_prices}

    market_caps = []
    pe_ratios = []
    pb_ratios = []
    daily_changes = []

    for s in industry_stocks:
        if s.market_cap and s.market_cap > 0:
            market_caps.append((s.id, s.market_cap))
        if s.pe_ratio and s.pe_ratio > 0:
            pe_ratios.append((s.id, s.pe_ratio))
        if s.pb_ratio and s.pb_ratio > 0:
            pb_ratios.append((s.id, s.pb_ratio))

        latest = latest_price_map.get(s.id)
        prev = prev_price_map.get(s.id)
        if latest and prev and prev.close > 0:
            change = (latest.close - prev.close) / prev.close * 100
            daily_changes.append((s.id, change))

    def calculate_percentile(stock_id: int, values: List[Tuple[int, float]]) -> Optional[float]:
        if not values:
            return None

        sorted_values = sorted(values, key=lambda x: x[1])
        stock_value = None
        for sid, val in sorted_values:
            if sid == stock_id:
                stock_value = val
                break

        if stock_value is None:
            return None

        rank = sum(1 for _, v in sorted_values if v < stock_value)
        percentile = (rank / len(sorted_values)) * 100
        return round(percentile, 2)

    return {
        "symbol": stock.symbol,
        "name": stock.name,
        "industry": industry,
        "industry_stock_count": len(industry_stocks),
        "market_cap_percentile": calculate_percentile(stock.id, market_caps),
        "pe_percentile": calculate_percentile(stock.id, pe_ratios),
        "pb_percentile": calculate_percentile(stock.id, pb_ratios),
        "daily_change_percentile": calculate_percentile(stock.id, daily_changes),
        "market_cap_value": stock.market_cap,
        "pe_value": stock.pe_ratio,
        "pb_value": stock.pb_ratio,
    }
