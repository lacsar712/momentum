"""
因子分析服务
提供横截面分布、分层回测、相关性矩阵、单股时序等分析功能
"""
from datetime import date, timedelta
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd
from sqlmodel import Session, select
from app.models import Stock, FactorValue, DailyPrice


FACTOR_NAMES = ["momentum", "volatility", "liquidity"]


def get_factor_distribution(
    session: Session,
    factor: str,
    target_date: date,
    stock_pool: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    获取指定因子在指定日期的横截面分布

    Args:
        session: 数据库会话
        factor: 因子名称 (momentum/volatility/liquidity)
        target_date: 目标日期
        stock_pool: 股票池代码列表，None 表示全市场

    Returns:
        包含 values, mean, std, quantiles 的字典
    """
    if factor not in FACTOR_NAMES:
        raise ValueError(f"因子名称必须是 {FACTOR_NAMES} 之一")

    query = (
        select(FactorValue, Stock.symbol, Stock.name)
        .join(Stock, FactorValue.stock_id == Stock.id)
        .where(FactorValue.factor_date == target_date)
    )

    if stock_pool:
        query = query.where(Stock.symbol.in_(stock_pool))

    results = session.exec(query).all()

    values = []
    stock_data = []
    for fv, symbol, name in results:
        val = getattr(fv, factor)
        if val is not None and not np.isnan(val):
            values.append(float(val))
            stock_data.append({
                "symbol": symbol,
                "name": name,
                "value": float(val),
            })

    if not values:
        return {
            "factor": factor,
            "date": target_date.isoformat(),
            "count": 0,
            "values": [],
            "mean": None,
            "std": None,
            "min": None,
            "max": None,
            "quantiles": {},
            "stocks": [],
        }

    arr = np.array(values)
    mean_val = float(np.mean(arr))
    std_val = float(np.std(arr))
    min_val = float(np.min(arr))
    max_val = float(np.max(arr))

    quantile_points = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]
    quantiles = {str(q): float(np.quantile(arr, q)) for q in quantile_points}

    stock_data.sort(key=lambda x: x["value"], reverse=True)
    for i, item in enumerate(stock_data):
        item["rank"] = i + 1

    return {
        "factor": factor,
        "date": target_date.isoformat(),
        "count": len(values),
        "values": values,
        "mean": mean_val,
        "std": std_val,
        "min": min_val,
        "max": max_val,
        "quantiles": quantiles,
        "stocks": stock_data,
    }


def _get_trading_days(session: Session, stock_id: int, start: date, end: date) -> List[date]:
    """获取指定股票在日期范围内的交易日列表"""
    prices = session.exec(
        select(DailyPrice.trade_date)
        .where(DailyPrice.stock_id == stock_id)
        .where(DailyPrice.trade_date >= start)
        .where(DailyPrice.trade_date <= end)
        .order_by(DailyPrice.trade_date)
    ).all()
    return [p for p in prices]


def _get_future_returns(
    session: Session,
    stock_id: int,
    start_date: date,
    k_days: int,
) -> Optional[pd.Series]:
    """
    获取指定股票从 start_date 开始未来 k 个交易日的收益率序列

    Returns:
        累计收益序列 (pd.Series)，索引为 0 到 k
    """
    prices = session.exec(
        select(DailyPrice)
        .where(DailyPrice.stock_id == stock_id)
        .where(DailyPrice.trade_date >= start_date)
        .order_by(DailyPrice.trade_date)
        .limit(k_days + 1)
    ).all()

    if len(prices) < 2:
        return None

    df = pd.DataFrame([{
        "trade_date": p.trade_date,
        "close": p.close,
    } for p in prices])

    df["ret"] = df["close"].pct_change().fillna(0)
    df["cum_ret"] = (1 + df["ret"]).cumprod()

    return df["cum_ret"]


def get_factor_layered_backtest(
    session: Session,
    factor: str,
    target_date: date,
    n_groups: int = 5,
    k_days: int = 20,
    stock_pool: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    因子分层回测

    按因子值排序均分为 N 组，返回每组未来 K 个交易日的等权累计收益序列

    Args:
        session: 数据库会话
        factor: 因子名称
        target_date: 因子观察日期
        n_groups: 分组数量
        k_days: 未来交易日数
        stock_pool: 股票池

    Returns:
        包含各组累计收益序列、多空组合收益的字典
    """
    if factor not in FACTOR_NAMES:
        raise ValueError(f"因子名称必须是 {FACTOR_NAMES} 之一")

    query = (
        select(FactorValue, Stock.symbol, Stock.id, Stock.name)
        .join(Stock, FactorValue.stock_id == Stock.id)
        .where(FactorValue.factor_date == target_date)
    )

    if stock_pool:
        query = query.where(Stock.symbol.in_(stock_pool))

    results = session.exec(query).all()

    stocks_data = []
    for fv, symbol, stock_id, name in results:
        val = getattr(fv, factor)
        if val is not None and not np.isnan(val):
            stocks_data.append({
                "stock_id": stock_id,
                "symbol": symbol,
                "name": name,
                "value": float(val),
            })

    if len(stocks_data) < n_groups * 2:
        return {
            "factor": factor,
            "date": target_date.isoformat(),
            "n_groups": n_groups,
            "k_days": k_days,
            "count": 0,
            "groups": [],
            "long_short": [],
            "dates": [],
        }

    stocks_data.sort(key=lambda x: x["value"], reverse=True)

    group_size = len(stocks_data) // n_groups
    groups = []
    for i in range(n_groups):
        start_idx = i * group_size
        if i == n_groups - 1:
            end_idx = len(stocks_data)
        else:
            end_idx = (i + 1) * group_size
        groups.append(stocks_data[start_idx:end_idx])

    group_returns = []
    valid_dates_set = set()

    for group in groups:
        group_cum_rets = []
        group_dates = []
        all_valid = True

        first_stock = group[0]
        trading_days = _get_trading_days(session, first_stock["stock_id"], target_date, target_date + timedelta(days=k_days * 2))

        if len(trading_days) < k_days + 1:
            all_valid = False
        else:
            trading_days = trading_days[:k_days + 1]

        if all_valid:
            daily_returns = np.zeros((len(group), k_days + 1))

            for idx, stock in enumerate(group):
                cum_rets = _get_future_returns(session, stock["stock_id"], trading_days[0], k_days)
                if cum_rets is None or len(cum_rets) < k_days + 1:
                    daily_returns[idx, :] = np.nan
                else:
                    daily_returns[idx, :] = cum_rets.values[:k_days + 1]

            valid_mask = ~np.isnan(daily_returns).all(axis=1)
            if valid_mask.sum() == 0:
                all_valid = False
            else:
                avg_cum = np.nanmean(daily_returns[valid_mask], axis=0)
                group_cum_rets = avg_cum.tolist()
                group_dates = [d.isoformat() for d in trading_days[:k_days + 1]]
                valid_dates_set.update(group_dates)

        group_returns.append({
            "group": i + 1,
            "label": f"第{i + 1}组 ({len(group)}只)",
            "stock_count": len(group),
            "cum_returns": group_cum_rets,
            "dates": group_dates,
            "stocks": [{"symbol": s["symbol"], "name": s["name"], "value": s["value"]} for s in group],
        })

    if len(group_returns) >= 2 and group_returns[0]["cum_returns"] and group_returns[-1]["cum_returns"]:
        long_cum = np.array(group_returns[0]["cum_returns"])
        short_cum = np.array(group_returns[-1]["cum_returns"])

        long_daily = np.diff(long_cum) / long_cum[:-1]
        short_daily = np.diff(short_cum) / short_cum[:-1]

        long_short_daily = long_daily - short_daily
        long_short = np.ones(len(long_short_daily) + 1)
        for i in range(len(long_short_daily)):
            long_short[i + 1] = long_short[i] * (1 + long_short_daily[i])

        long_short = long_short.tolist()
        long_short_dates = group_returns[0]["dates"]
    else:
        long_short = []
        long_short_dates = []

    return {
        "factor": factor,
        "date": target_date.isoformat(),
        "n_groups": n_groups,
        "k_days": k_days,
        "count": len(stocks_data),
        "groups": group_returns,
        "long_short": long_short,
        "long_short_dates": long_short_dates,
    }


def get_factor_correlation_matrix(
    session: Session,
    target_date: date,
    stock_pool: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    获取指定日期三个因子的相关性矩阵（皮尔逊相关系数）

    Args:
        session: 数据库会话
        target_date: 目标日期
        stock_pool: 股票池

    Returns:
        包含相关性矩阵的字典
    """
    query = (
        select(FactorValue)
        .join(Stock, FactorValue.stock_id == Stock.id)
        .where(FactorValue.factor_date == target_date)
    )

    if stock_pool:
        query = query.where(Stock.symbol.in_(stock_pool))

    results = session.exec(query).all()

    data = {f: [] for f in FACTOR_NAMES}

    for fv in results:
        valid = True
        vals = {}
        for f in FACTOR_NAMES:
            val = getattr(fv, f)
            if val is None or np.isnan(val):
                valid = False
                break
            vals[f] = float(val)
        if valid:
            for f in FACTOR_NAMES:
                data[f].append(vals[f])

    if len(data["momentum"]) < 3:
        return {
            "date": target_date.isoformat(),
            "count": 0,
            "factors": FACTOR_NAMES,
            "correlation_matrix": [[0.0] * len(FACTOR_NAMES) for _ in FACTOR_NAMES],
        }

    df = pd.DataFrame(data)
    corr_matrix = df.corr(method="pearson")

    return {
        "date": target_date.isoformat(),
        "count": len(data["momentum"]),
        "factors": FACTOR_NAMES,
        "correlation_matrix": corr_matrix.values.tolist(),
    }


def get_stock_factor_timeseries(
    session: Session,
    symbol: str,
    start_date: date,
    end_date: date,
) -> Dict[str, Any]:
    """
    获取单只股票的因子时序数据

    Args:
        session: 数据库会话
        symbol: 股票代码
        start_date: 开始日期
        end_date: 结束日期

    Returns:
        包含各因子时序数据的字典
    """
    stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
    if not stock:
        raise ValueError("股票不存在")

    factors = session.exec(
        select(FactorValue)
        .where(FactorValue.stock_id == stock.id)
        .where(FactorValue.factor_date >= start_date)
        .where(FactorValue.factor_date <= end_date)
        .order_by(FactorValue.factor_date)
    ).all()

    data = []
    for fv in factors:
        data.append({
            "date": fv.factor_date.isoformat(),
            "momentum": fv.momentum,
            "volatility": fv.volatility,
            "liquidity": fv.liquidity,
        })

    return {
        "symbol": symbol,
        "name": stock.name,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "count": len(data),
        "data": data,
    }


def get_available_factor_dates(
    session: Session,
    limit: int = 100,
) -> List[str]:
    """
    获取可用的因子日期列表（最近的若干个交易日

    Args:
        session: 数据库会话
        limit: 返回数量限制

    Returns:
        日期字符串列表
    """
    dates = session.exec(
        select(FactorValue.factor_date)
        .distinct()
        .order_by(FactorValue.factor_date.desc())
        .limit(limit)
    ).all()

    return [d.isoformat() for d in dates]
