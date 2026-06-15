"""
实时行情服务
提供A股近实时行情数据，支持批量查询和会话订阅
数据源: 腾讯财经(主) / 新浪财经(备)
"""

import time
import uuid
import random
from typing import List, Dict, Any, Optional
from datetime import datetime

import requests

from app.services.cache import cache_get, cache_set
from app.services.data_sources import get_random_headers, get_session

CACHE_TTL = 2
SESSION_TTL = 3600


def _format_tencent_symbol(symbol: str) -> str:
    prefix = "sh" if str(symbol).startswith("6") else "sz"
    return f"{prefix}{symbol}"


def fetch_realtime_tencent(symbols: List[str]) -> List[Dict[str, Any]]:
    """
    腾讯财经实时行情接口
    接口: https://qt.gtimg.cn/q=sh600519,sz000001
    返回格式: v_sh600519="1~贵州茅台~600519~1680.00~1690.00~1685.00~...~"
    字段索引:
    0: 未知
    1: 名称
    2: 代码
    3: 当前价
    4: 昨收
    5: 今开
    6: 成交量(手)
    7: 外盘
    8: 内盘
    9: 买一价
    10: 买一量(手)
    19: 卖一价
    20: 卖一量(手)
    30: 时间
    31: 日期
    32: 涨跌额
    33: 涨跌幅
    36: 成交量(股)
    37: 成交额
    41: 市盈率
    45: 总市值(亿)
    """
    if not symbols:
        return []

    tencent_codes = [_format_tencent_symbol(s) for s in symbols]
    url = f"https://qt.gtimg.cn/q={','.join(tencent_codes)}"

    session = get_session()
    results = []

    try:
        resp = session.get(url, timeout=10, verify=False)
        if resp.status_code != 200:
            return []

        content = resp.text
        lines = content.strip().split(";")

        symbol_map = {_format_tencent_symbol(s): s for s in symbols}

        for line in lines:
            if "=" not in line or '""' in line:
                continue
            try:
                parts = line.split("=")[1].strip('"').split("~")
                if len(parts) < 40:
                    continue

                code = parts[2]
                tencent_key = _format_tencent_symbol(code)
                if tencent_key not in symbol_map:
                    continue

                price = float(parts[3]) if parts[3] and parts[3] != "" else 0.0
                prev_close = float(parts[4]) if parts[4] and parts[4] != "" else 0.0
                open_price = float(parts[5]) if parts[5] and parts[5] != "" else 0.0
                volume = float(parts[36]) if parts[36] and parts[36] != "" else 0.0
                amount = float(parts[37]) if parts[37] and parts[37] != "" else 0.0

                bid1_price = float(parts[9]) if parts[9] and parts[9] != "" else 0.0
                bid1_volume = float(parts[10]) if parts[10] and parts[10] != "" else 0.0
                ask1_price = float(parts[19]) if parts[19] and parts[19] != "" else 0.0
                ask1_volume = float(parts[20]) if parts[20] and parts[20] != "" else 0.0

                change = float(parts[32]) if parts[32] and parts[32] != "" else 0.0
                change_percent = float(parts[33]) if parts[33] and parts[33] != "" else 0.0

                date_str = parts[30] if len(parts) > 30 else ""
                time_str = parts[31] if len(parts) > 31 else ""
                timestamp = ""
                if date_str and time_str:
                    try:
                        dt = datetime.strptime(f"{date_str} {time_str}", "%Y%m%d %H%M%S")
                        timestamp = dt.isoformat()
                    except ValueError:
                        timestamp = datetime.now().isoformat()
                else:
                    timestamp = datetime.now().isoformat()

                results.append({
                    "symbol": code,
                    "name": parts[1],
                    "price": round(price, 2),
                    "prev_close": round(prev_close, 2),
                    "open": round(open_price, 2),
                    "change": round(change, 2),
                    "change_percent": round(change_percent, 2),
                    "bid1_price": round(bid1_price, 2),
                    "bid1_volume": int(bid1_volume),
                    "ask1_price": round(ask1_price, 2),
                    "ask1_volume": int(ask1_volume),
                    "volume": int(volume),
                    "amount": round(amount, 2),
                    "timestamp": timestamp,
                    "source": "tencent",
                })
            except (IndexError, ValueError) as e:
                print(f"[实时行情] 解析腾讯行情失败: {e}")
                continue

    except Exception as e:
        print(f"[实时行情] 腾讯接口请求失败: {e}")

    return results


def fetch_realtime_sina(symbols: List[str]) -> List[Dict[str, Any]]:
    """
    新浪财经实时行情接口 (备用)
    接口: https://hq.sinajs.cn/list=sh600519,sz000001
    """
    if not symbols:
        return []

    sina_codes = [_format_tencent_symbol(s) for s in symbols]
    url = f"https://hq.sinajs.cn/list={','.join(sina_codes)}"

    headers = get_random_headers()
    headers["Referer"] = "https://finance.sina.com.cn/"

    results = []

    try:
        resp = requests.get(url, headers=headers, timeout=10, verify=False)
        if resp.status_code != 200:
            return []

        resp.encoding = "gbk"
        content = resp.text
        lines = content.strip().split("\n")

        for line in lines:
            if '="' not in line:
                continue
            try:
                left = line.split('="')[0]
                right = line.split('="')[1].rstrip('";')
                code = left.replace("var hq_str_", "")
                parts = right.split(",")

                if len(parts) < 32:
                    continue

                name = parts[0]
                open_price = float(parts[1]) if parts[1] else 0.0
                prev_close = float(parts[2]) if parts[2] else 0.0
                price = float(parts[3]) if parts[3] else 0.0
                high = float(parts[4]) if parts[4] else 0.0
                low = float(parts[5]) if parts[5] else 0.0
                volume = float(parts[8]) if parts[8] else 0.0
                amount = float(parts[9]) if parts[9] else 0.0

                bid1_price = float(parts[11]) if parts[11] else 0.0
                bid1_volume = float(parts[10]) if parts[10] else 0.0
                ask1_price = float(parts[21]) if parts[21] else 0.0
                ask1_volume = float(parts[20]) if parts[20] else 0.0

                date_str = parts[30]
                time_str = parts[31]
                timestamp = ""
                try:
                    dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M:%S")
                    timestamp = dt.isoformat()
                except ValueError:
                    timestamp = datetime.now().isoformat()

                change = price - prev_close if prev_close > 0 else 0.0
                change_percent = (change / prev_close * 100) if prev_close > 0 else 0.0

                symbol_code = code[2:] if len(code) > 2 else code

                results.append({
                    "symbol": symbol_code,
                    "name": name,
                    "price": round(price, 2),
                    "prev_close": round(prev_close, 2),
                    "open": round(open_price, 2),
                    "high": round(high, 2),
                    "low": round(low, 2),
                    "change": round(change, 2),
                    "change_percent": round(change_percent, 2),
                    "bid1_price": round(bid1_price, 2),
                    "bid1_volume": int(bid1_volume),
                    "ask1_price": round(ask1_price, 2),
                    "ask1_volume": int(ask1_volume),
                    "volume": int(volume),
                    "amount": round(amount, 2),
                    "timestamp": timestamp,
                    "source": "sina",
                })
            except (IndexError, ValueError) as e:
                print(f"[实时行情] 解析新浪行情失败: {e}")
                continue

    except Exception as e:
        print(f"[实时行情] 新浪接口请求失败: {e}")

    return results


def get_realtime_quotes(symbols: List[str]) -> Dict[str, Any]:
    """
    获取批量股票的实时行情
    带 Redis 短缓存，避免频繁请求上游
    """
    if not symbols:
        return {"items": [], "cached": False, "timestamp": datetime.now().isoformat()}

    symbols_sorted = sorted(symbols)
    cache_key = f"realtime:quote:{','.join(symbols_sorted)}"

    cached = cache_get(cache_key)
    if cached:
        return {**cached, "cached": True}

    results = fetch_realtime_tencent(symbols_sorted)

    if len(results) < len(symbols_sorted) // 2:
        backup = fetch_realtime_sina(symbols_sorted)
        if backup:
            result_map = {r["symbol"]: r for r in results}
            for item in backup:
                if item["symbol"] not in result_map:
                    results.append(item)

    response = {
        "items": results,
        "cached": False,
        "timestamp": datetime.now().isoformat(),
        "count": len(results),
    }

    cache_set(cache_key, response, ttl=CACHE_TTL)

    return response


def create_session(symbols: List[str], user_id: Optional[int] = None) -> Dict[str, Any]:
    """
    创建实时行情订阅会话
    保存订阅股票列表，返回会话ID
    """
    session_id = str(uuid.uuid4())
    session_data = {
        "session_id": session_id,
        "symbols": list(set(symbols)),
        "user_id": user_id,
        "created_at": datetime.now().isoformat(),
        "last_poll_at": None,
    }

    cache_key = f"realtime:session:{session_id}"
    cache_set(cache_key, session_data, ttl=SESSION_TTL)

    return {"session_id": session_id, "symbols": session_data["symbols"]}


def get_session_snapshot(session_id: str) -> Dict[str, Any]:
    """
    获取会话的最新行情快照
    """
    cache_key = f"realtime:session:{session_id}"
    session_data = cache_get(cache_key)

    if not session_data:
        raise ValueError("会话不存在或已过期")

    symbols = session_data.get("symbols", [])
    quotes = get_realtime_quotes(symbols)

    session_data["last_poll_at"] = datetime.now().isoformat()
    cache_set(cache_key, session_data, ttl=SESSION_TTL)

    return {
        "session_id": session_id,
        "symbols": symbols,
        "quotes": quotes,
    }


def update_session_symbols(session_id: str, symbols: List[str]) -> Dict[str, Any]:
    """
    更新会话的订阅股票列表
    """
    cache_key = f"realtime:session:{session_id}"
    session_data = cache_get(cache_key)

    if not session_data:
        raise ValueError("会话不存在或已过期")

    session_data["symbols"] = list(set(symbols))
    session_data["updated_at"] = datetime.now().isoformat()
    cache_set(cache_key, session_data, ttl=SESSION_TTL)

    return {"session_id": session_id, "symbols": session_data["symbols"]}


def add_session_symbols(session_id: str, symbols: List[str]) -> Dict[str, Any]:
    """向会话添加股票"""
    cache_key = f"realtime:session:{session_id}"
    session_data = cache_get(cache_key)

    if not session_data:
        raise ValueError("会话不存在或已过期")

    current = set(session_data.get("symbols", []))
    current.update(symbols)
    session_data["symbols"] = list(current)
    session_data["updated_at"] = datetime.now().isoformat()
    cache_set(cache_key, session_data, ttl=SESSION_TTL)

    return {"session_id": session_id, "symbols": session_data["symbols"]}


def remove_session_symbols(session_id: str, symbols: List[str]) -> Dict[str, Any]:
    """从会话移除股票"""
    cache_key = f"realtime:session:{session_id}"
    session_data = cache_get(cache_key)

    if not session_data:
        raise ValueError("会话不存在或已过期")

    current = set(session_data.get("symbols", []))
    for s in symbols:
        current.discard(s)
    session_data["symbols"] = list(current)
    session_data["updated_at"] = datetime.now().isoformat()
    cache_set(cache_key, session_data, ttl=SESSION_TTL)

    return {"session_id": session_id, "symbols": session_data["symbols"]}
