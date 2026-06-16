from typing import List, Dict, Any, Callable, Optional
from datetime import date
import numpy as np
import pandas as pd

AnomalyRule = Dict[str, Any]
AnomalyResult = Dict[str, Any]

RULES: List[AnomalyRule] = [
    {
        "id": "price_change_threshold",
        "name": "单日涨跌幅突破阈值",
        "description": "单日涨跌幅超过指定阈值",
        "params": [
            {"key": "threshold", "label": "涨跌幅阈值", "type": "slider", "default": 5.0, "min": 1.0, "max": 15.0, "step": 0.5, "unit": "%"},
            {"key": "direction", "label": "方向", "type": "select", "default": "both", "options": [{"value": "up", "label": "上涨"}, {"value": "down", "label": "下跌"}, {"value": "both", "label": "双向"}]},
        ],
        "default_enabled": True,
    },
    {
        "id": "volume_surge",
        "name": "成交量超过近20日均量N倍",
        "description": "当日成交量显著放大，超过近20日均量的指定倍数",
        "params": [
            {"key": "multiplier", "label": "均量倍数", "type": "slider", "default": 2.0, "min": 1.5, "max": 10.0, "step": 0.5, "unit": "倍"},
            {"key": "ma_window", "label": "均量窗口", "type": "number", "default": 20, "min": 5, "max": 60, "step": 1, "unit": "日"},
        ],
        "default_enabled": True,
    },
    {
        "id": "consecutive_trend",
        "name": "连续K日同向上涨/下跌",
        "description": "连续K个交易日收盘价同向上涨或下跌",
        "params": [
            {"key": "days", "label": "连续天数", "type": "slider", "default": 3, "min": 2, "max": 10, "step": 1, "unit": "日"},
            {"key": "direction", "label": "方向", "type": "select", "default": "both", "options": [{"value": "up", "label": "上涨"}, {"value": "down", "label": "下跌"}, {"value": "both", "label": "双向"}]},
        ],
        "default_enabled": True,
    },
    {
        "id": "long_shadow",
        "name": "长上影/长下影K线",
        "description": "K线实体较小但影线较长，表明多空博弈激烈",
        "params": [
            {"key": "shadow_ratio", "label": "影线实体比", "type": "slider", "default": 2.0, "min": 1.0, "max": 5.0, "step": 0.5, "unit": "倍"},
            {"key": "type", "label": "类型", "type": "select", "default": "both", "options": [{"value": "upper", "label": "长上影"}, {"value": "lower", "label": "长下影"}, {"value": "both", "label": "双向"}]},
        ],
        "default_enabled": True,
    },
    {
        "id": "amplitude_breakout",
        "name": "振幅突破阈值",
        "description": "当日最高价与最低价之差超过指定阈值",
        "params": [
            {"key": "threshold", "label": "振幅阈值", "type": "slider", "default": 5.0, "min": 2.0, "max": 20.0, "step": 0.5, "unit": "%"},
        ],
        "default_enabled": True,
    },
    {
        "id": "price_volume_divergence",
        "name": "量价背离",
        "description": "价格创新高但成交量未同步放大，或价格创新低但成交量未同步放大",
        "params": [
            {"key": "lookback", "label": "回看窗口", "type": "number", "default": 20, "min": 10, "max": 60, "step": 1, "unit": "日"},
            {"key": "divergence_threshold", "label": "背离阈值", "type": "slider", "default": 0.8, "min": 0.5, "max": 1.5, "step": 0.1, "unit": "倍"},
        ],
        "default_enabled": True,
    },
    {
        "id": "gap_open",
        "name": "跳空高/低开",
        "description": "当日开盘价显著高于/低于前日收盘价",
        "params": [
            {"key": "threshold", "label": "缺口阈值", "type": "slider", "default": 2.0, "min": 0.5, "max": 10.0, "step": 0.5, "unit": "%"},
            {"key": "direction", "label": "方向", "type": "select", "default": "both", "options": [{"value": "up", "label": "跳空高开"}, {"value": "down", "label": "跳空低开"}, {"value": "both", "label": "双向"}]},
        ],
        "default_enabled": True,
    },
    {
        "id": "new_high_low",
        "name": "突破N日新高/新低",
        "description": "收盘价突破N个交易日以来的新高或新低",
        "params": [
            {"key": "lookback", "label": "回看窗口", "type": "slider", "default": 60, "min": 20, "max": 250, "step": 5, "unit": "日"},
            {"key": "type", "label": "类型", "type": "select", "default": "both", "options": [{"value": "high", "label": "创新高"}, {"value": "low", "label": "创新低"}, {"value": "both", "label": "双向"}]},
        ],
        "default_enabled": True,
    },
]


def _calculate_strength_score(trigger_value: float, threshold: float, max_factor: float = 3.0) -> float:
    """
    根据触发值与阈值的比例计算强度评分(0-1)
    """
    if threshold == 0:
        return 0.5
    ratio = abs(trigger_value) / abs(threshold)
    normalized = min(ratio / max_factor, 1.0)
    return 0.3 + normalized * 0.7


def _check_price_change_threshold(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    threshold = params.get("threshold", 5.0) / 100
    direction = params.get("direction", "both")

    if row_idx < 1:
        return None

    prev_close = df.iloc[row_idx - 1]["close"]
    curr_close = df.iloc[row_idx]["close"]
    change_pct = (curr_close - prev_close) / prev_close

    triggered = False
    trigger_direction = ""
    if direction in ("up", "both") and change_pct >= threshold:
        triggered = True
        trigger_direction = "up"
    if direction in ("down", "both") and change_pct <= -threshold:
        triggered = True
        trigger_direction = "down"

    if not triggered:
        return None

    strength = _calculate_strength_score(abs(change_pct), threshold)
    return {
        "rule_id": "price_change_threshold",
        "rule_name": "单日涨跌幅突破阈值",
        "strength_score": strength,
        "metrics": {
            "change_pct": round(change_pct * 100, 2),
            "prev_close": round(prev_close, 2),
            "curr_close": round(curr_close, 2),
            "direction": trigger_direction,
            "threshold": params.get("threshold", 5.0),
        },
    }


def _check_volume_surge(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    multiplier = params.get("multiplier", 2.0)
    ma_window = params.get("ma_window", 20)

    if row_idx < ma_window:
        return None

    avg_volume = df.iloc[row_idx - ma_window : row_idx]["volume"].mean()
    curr_volume = df.iloc[row_idx]["volume"]

    if avg_volume == 0:
        return None

    volume_ratio = curr_volume / avg_volume

    if volume_ratio < multiplier:
        return None

    strength = _calculate_strength_score(volume_ratio, multiplier, max_factor=5.0)
    return {
        "rule_id": "volume_surge",
        "rule_name": "成交量放量",
        "strength_score": strength,
        "metrics": {
            "curr_volume": round(curr_volume, 0),
            "avg_volume": round(avg_volume, 0),
            "volume_ratio": round(volume_ratio, 2),
            "multiplier": multiplier,
            "ma_window": ma_window,
        },
    }


def _check_consecutive_trend(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    days = params.get("days", 3)
    direction = params.get("direction", "both")

    if row_idx < days:
        return None

    closes = df.iloc[row_idx - days : row_idx + 1]["close"].values
    changes = np.diff(closes)

    all_up = np.all(changes > 0)
    all_down = np.all(changes < 0)

    triggered = False
    trigger_direction = ""
    if direction in ("up", "both") and all_up:
        triggered = True
        trigger_direction = "up"
    if direction in ("down", "both") and all_down:
        triggered = True
        trigger_direction = "down"

    if not triggered:
        return None

    total_change = (closes[-1] - closes[0]) / closes[0]
    strength = _calculate_strength_score(abs(total_change), days * 0.02)
    return {
        "rule_id": "consecutive_trend",
        "rule_name": f"连续{days}日{'上涨' if trigger_direction == 'up' else '下跌'}",
        "strength_score": strength,
        "metrics": {
            "days": days,
            "direction": trigger_direction,
            "total_change_pct": round(total_change * 100, 2),
            "start_price": round(closes[0], 2),
            "end_price": round(closes[-1], 2),
        },
    }


def _check_long_shadow(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    shadow_ratio = params.get("shadow_ratio", 2.0)
    shadow_type = params.get("type", "both")

    row = df.iloc[row_idx]
    open_p, high_p, low_p, close_p = row["open"], row["high"], row["low"], row["close"]

    body_size = abs(close_p - open_p)
    upper_shadow = high_p - max(open_p, close_p)
    lower_shadow = min(open_p, close_p) - low_p

    if body_size == 0:
        body_size = 0.01 * close_p

    upper_ratio = upper_shadow / body_size
    lower_ratio = lower_shadow / body_size

    triggered = False
    trigger_type = ""
    ratio = 0.0

    if shadow_type in ("upper", "both") and upper_ratio >= shadow_ratio:
        triggered = True
        trigger_type = "upper"
        ratio = upper_ratio
    if shadow_type in ("lower", "both") and lower_ratio >= shadow_ratio:
        if not triggered or lower_ratio > upper_ratio:
            triggered = True
            trigger_type = "lower"
            ratio = lower_ratio

    if not triggered:
        return None

    strength = _calculate_strength_score(ratio, shadow_ratio, max_factor=5.0)
    return {
        "rule_id": "long_shadow",
        "rule_name": "长上影线" if trigger_type == "upper" else "长下影线",
        "strength_score": strength,
        "metrics": {
            "type": trigger_type,
            "open": round(open_p, 2),
            "high": round(high_p, 2),
            "low": round(low_p, 2),
            "close": round(close_p, 2),
            "body_size": round(body_size, 2),
            "upper_shadow": round(upper_shadow, 2),
            "lower_shadow": round(lower_shadow, 2),
            "ratio": round(ratio, 2),
            "threshold": shadow_ratio,
        },
    }


def _check_amplitude_breakout(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    threshold = params.get("threshold", 5.0) / 100

    row = df.iloc[row_idx]
    high_p, low_p = row["high"], row["low"]

    if low_p == 0:
        return None

    amplitude = (high_p - low_p) / low_p

    if amplitude < threshold:
        return None

    strength = _calculate_strength_score(amplitude, threshold, max_factor=4.0)
    return {
        "rule_id": "amplitude_breakout",
        "rule_name": "振幅突破",
        "strength_score": strength,
        "metrics": {
            "amplitude_pct": round(amplitude * 100, 2),
            "high": round(high_p, 2),
            "low": round(low_p, 2),
            "threshold": params.get("threshold", 5.0),
        },
    }


def _check_price_volume_divergence(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    lookback = params.get("lookback", 20)
    divergence_threshold = params.get("divergence_threshold", 0.8)

    if row_idx < lookback:
        return None

    window = df.iloc[row_idx - lookback : row_idx + 1]
    curr_close = df.iloc[row_idx]["close"]
    curr_volume = df.iloc[row_idx]["volume"]

    prev_high_close = window["close"].iloc[:-1].max()
    prev_high_volume = window[window["close"].iloc[:-1] == prev_high_close]["volume"].values[0] if prev_high_close > 0 else 0

    prev_low_close = window["close"].iloc[:-1].min()
    prev_low_volume = window[window["close"].iloc[:-1] == prev_low_close]["volume"].values[0] if prev_low_close > 0 else 0

    avg_volume = window["volume"].iloc[:-1].mean()

    triggered = False
    divergence_type = ""
    metrics = {}

    if curr_close > prev_high_close and prev_high_volume > 0:
        volume_ratio = curr_volume / prev_high_volume
        if volume_ratio < divergence_threshold:
            triggered = True
            divergence_type = "bullish_divergence"
            metrics = {
                "type": divergence_type,
                "curr_close": round(curr_close, 2),
                "prev_high_close": round(prev_high_close, 2),
                "curr_volume": round(curr_volume, 0),
                "prev_high_volume": round(prev_high_volume, 0),
                "volume_ratio": round(volume_ratio, 2),
                "avg_volume": round(avg_volume, 0),
            }

    if curr_close < prev_low_close and prev_low_volume > 0:
        volume_ratio = curr_volume / prev_low_volume
        if volume_ratio < divergence_threshold:
            if not triggered or volume_ratio < metrics.get("volume_ratio", 999):
                triggered = True
                divergence_type = "bearish_divergence"
                metrics = {
                    "type": divergence_type,
                    "curr_close": round(curr_close, 2),
                    "prev_low_close": round(prev_low_close, 2),
                    "curr_volume": round(curr_volume, 0),
                    "prev_low_volume": round(prev_low_volume, 0),
                    "volume_ratio": round(volume_ratio, 2),
                    "avg_volume": round(avg_volume, 0),
                }

    if not triggered:
        return None

    strength = _calculate_strength_score(1.0 / (metrics.get("volume_ratio", 1.0) + 0.01), 1.0 / divergence_threshold, max_factor=3.0)
    return {
        "rule_id": "price_volume_divergence",
        "rule_name": "量价背离" + ("(顶背离)" if divergence_type == "bullish_divergence" else "(底背离)"),
        "strength_score": strength,
        "metrics": metrics,
    }


def _check_gap_open(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    threshold = params.get("threshold", 2.0) / 100
    direction = params.get("direction", "both")

    if row_idx < 1:
        return None

    prev_close = df.iloc[row_idx - 1]["close"]
    curr_open = df.iloc[row_idx]["open"]

    if prev_close == 0:
        return None

    gap_pct = (curr_open - prev_close) / prev_close

    triggered = False
    trigger_direction = ""
    if direction in ("up", "both") and gap_pct >= threshold:
        triggered = True
        trigger_direction = "up"
    if direction in ("down", "both") and gap_pct <= -threshold:
        triggered = True
        trigger_direction = "down"

    if not triggered:
        return None

    strength = _calculate_strength_score(abs(gap_pct), threshold, max_factor=4.0)
    return {
        "rule_id": "gap_open",
        "rule_name": "跳空高开" if trigger_direction == "up" else "跳空低开",
        "strength_score": strength,
        "metrics": {
            "gap_pct": round(gap_pct * 100, 2),
            "prev_close": round(prev_close, 2),
            "curr_open": round(curr_open, 2),
            "direction": trigger_direction,
            "threshold": params.get("threshold", 2.0),
        },
    }


def _check_new_high_low(
    df: pd.DataFrame, params: Dict[str, Any], row_idx: int
) -> Optional[AnomalyResult]:
    lookback = params.get("lookback", 60)
    check_type = params.get("type", "both")

    if row_idx < lookback:
        return None

    window = df.iloc[row_idx - lookback : row_idx]
    curr_close = df.iloc[row_idx]["close"]
    prev_high = window["close"].max()
    prev_low = window["close"].min()

    triggered = False
    trigger_type = ""

    if check_type in ("high", "both") and curr_close > prev_high:
        triggered = True
        trigger_type = "high"
    if check_type in ("low", "both") and curr_close < prev_low:
        if not triggered:
            triggered = True
            trigger_type = "low"

    if not triggered:
        return None

    if trigger_type == "high":
        breakout_pct = (curr_close - prev_high) / prev_high
        strength = _calculate_strength_score(breakout_pct, 0.02, max_factor=5.0)
        rule_name = f"突破{lookback}日新高"
    else:
        breakout_pct = (prev_low - curr_close) / prev_low
        strength = _calculate_strength_score(breakout_pct, 0.02, max_factor=5.0)
        rule_name = f"突破{lookback}日新低"

    return {
        "rule_id": "new_high_low",
        "rule_name": rule_name,
        "strength_score": strength,
        "metrics": {
            "type": trigger_type,
            "curr_close": round(curr_close, 2),
            "prev_high": round(prev_high, 2) if trigger_type == "high" else None,
            "prev_low": round(prev_low, 2) if trigger_type == "low" else None,
            "breakout_pct": round(breakout_pct * 100, 2),
            "lookback": lookback,
        },
    }


RULE_FUNCTIONS: Dict[str, Callable] = {
    "price_change_threshold": _check_price_change_threshold,
    "volume_surge": _check_volume_surge,
    "consecutive_trend": _check_consecutive_trend,
    "long_shadow": _check_long_shadow,
    "amplitude_breakout": _check_amplitude_breakout,
    "price_volume_divergence": _check_price_volume_divergence,
    "gap_open": _check_gap_open,
    "new_high_low": _check_new_high_low,
}


def get_rule_definitions() -> List[Dict[str, Any]]:
    """
    返回所有规则的定义，包括参数配置和默认值
    """
    return RULES


def scan_stock_anomalies(
    df: pd.DataFrame,
    rule_configs: Dict[str, Dict[str, Any]],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[AnomalyResult]:
    """
    扫描单只股票的异动事件
    rule_configs: {rule_id: {enabled: bool, params: {...}}}
    """
    results = []
    if df.empty:
        return results

    df = df.sort_values("trade_date").reset_index(drop=True)

    if start_date:
        df = df[df["trade_date"] >= pd.Timestamp(start_date)]
    if end_date:
        df = df[df["trade_date"] <= pd.Timestamp(end_date)]

    if df.empty:
        return results

    df = df.reset_index(drop=True)

    for row_idx in range(len(df)):
        for rule_id, config in rule_configs.items():
            if not config.get("enabled", True):
                continue
            if rule_id not in RULE_FUNCTIONS:
                continue

            rule_func = RULE_FUNCTIONS[rule_id]
            params = config.get("params", {})

            result = rule_func(df, params, row_idx)
            if result:
                trade_date = df.iloc[row_idx]["trade_date"]
                result["trigger_date"] = trade_date if isinstance(trade_date, date) else trade_date.date()
                results.append(result)

    return results


def scan_market_anomalies(
    session,
    rule_configs: Dict[str, Dict[str, Any]],
    symbols: Optional[List[str]] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    stock_callback: Optional[Callable[[List[Dict[str, Any]]], None]] = None,
) -> List[Dict[str, Any]]:
    """
    扫描全市场或指定股票池的异动事件
    stock_callback: 每扫描完一只股票的回调，参数为该股票发现的异动结果列表
    """
    from app.models import Stock, DailyPrice
    from sqlmodel import select

    if symbols is None:
        stocks = session.exec(select(Stock)).all()
    else:
        stocks = session.exec(select(Stock).where(Stock.symbol.in_(symbols))).all()

    total = len(stocks)
    all_results = []

    for idx, stock in enumerate(stocks):
        prices = session.exec(
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock.id)
            .order_by(DailyPrice.trade_date)
        ).all()

        if not prices:
            if progress_callback and (idx + 1) % 10 == 0:
                progress_callback(idx + 1, total, f"正在扫描 {stock.symbol} {stock.name}")
            continue

        df = pd.DataFrame([p.dict() for p in prices])

        max_lookback = 250
        if len(df) < max_lookback:
            pass

        stock_results = scan_stock_anomalies(df, rule_configs, start_date, end_date)

        for result in stock_results:
            result["symbol"] = stock.symbol
            result["name"] = stock.name
            all_results.append(result)

        if stock_callback and stock_results:
            stock_callback(stock_results)

        if progress_callback and (idx + 1) % 10 == 0:
            progress_callback(idx + 1, total, f"正在扫描 {stock.symbol} {stock.name}")

    if progress_callback:
        progress_callback(total, total, "扫描完成")

    return all_results
