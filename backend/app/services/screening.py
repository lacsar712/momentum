"""
高性能股票筛选服务 - SQL下推优化版本
使用预计算的StockSnapshot表，将筛选条件下推到数据库层
"""
from datetime import date
from typing import Dict, Any, List
from sqlalchemy import text
from sqlmodel import Session


def screen_stocks(session: Session, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    高性能股票筛选 - 使用SQL下推和预计算快照表
    
    优化策略:
    1. 基础筛选条件 (market_cap, pe, pb) 直接构建SQL WHERE子句
    2. 技术指标 (RSI, MACD, KDJ) 从预计算的StockSnapshot表读取
    3. 使用原生SQL避免ORM序列化开销
    4. 数据库层完成排序和分页
    """
    
    # 构建动态SQL
    sql = """
        SELECT 
            s.id,
            s.symbol,
            s.name,
            s.market,
            s.industry,
            s.market_cap,
            s.pe_ratio,
            s.pb_ratio,
            snap.close,
            snap.volume,
            snap.rsi,
            snap.macd_line,
            snap.macd_signal,
            snap.macd_hist,
            snap.kdj_k,
            snap.kdj_d,
            snap.kdj_j,
            snap.momentum,
            snap.volatility,
            snap.liquidity,
            snap.latest_date as trade_date
        FROM stock s
        LEFT JOIN stocksnapshot snap ON s.id = snap.stock_id
        WHERE 1=1
    """
    
    params = {}
    
    # ========== 基础筛选条件 (SQL下推) ==========
    basic = criteria.get("basic_filters", {})
    
    if basic.get("market_cap_min") is not None:
        sql += " AND s.market_cap >= :market_cap_min"
        params["market_cap_min"] = basic["market_cap_min"]
    
    if basic.get("market_cap_max") is not None:
        sql += " AND s.market_cap <= :market_cap_max"
        params["market_cap_max"] = basic["market_cap_max"]
    
    if basic.get("pe_min") is not None:
        sql += " AND s.pe_ratio >= :pe_min"
        params["pe_min"] = basic["pe_min"]
    
    if basic.get("pe_max") is not None:
        sql += " AND s.pe_ratio <= :pe_max"
        params["pe_max"] = basic["pe_max"]
    
    if basic.get("pb_min") is not None:
        sql += " AND s.pb_ratio >= :pb_min"
        params["pb_min"] = basic["pb_min"]
    
    if basic.get("pb_max") is not None:
        sql += " AND s.pb_ratio <= :pb_max"
        params["pb_max"] = basic["pb_max"]
    
    # ========== 技术指标筛选 (从快照表读取预计算值) ==========
    tech = criteria.get("technical_filters", {})
    
    if tech.get("rsi_min") is not None:
        sql += " AND snap.rsi >= :rsi_min"
        params["rsi_min"] = tech["rsi_min"]
    
    if tech.get("rsi_max") is not None:
        sql += " AND snap.rsi <= :rsi_max"
        params["rsi_max"] = tech["rsi_max"]
    
    if tech.get("macd_positive"):
        sql += " AND snap.macd_line > snap.macd_signal"
    
    if tech.get("kdj_positive"):
        sql += " AND snap.kdj_k > snap.kdj_d"
    
    # ========== 因子筛选 ==========
    factor = criteria.get("factor_filters", {})
    
    if factor.get("momentum_min") is not None:
        sql += " AND snap.momentum >= :momentum_min"
        params["momentum_min"] = factor["momentum_min"]
    
    if factor.get("momentum_max") is not None:
        sql += " AND snap.momentum <= :momentum_max"
        params["momentum_max"] = factor["momentum_max"]
    
    if factor.get("volatility_min") is not None:
        sql += " AND snap.volatility >= :volatility_min"
        params["volatility_min"] = factor["volatility_min"]
    
    if factor.get("volatility_max") is not None:
        sql += " AND snap.volatility <= :volatility_max"
        params["volatility_max"] = factor["volatility_max"]
    
    if factor.get("liquidity_min") is not None:
        sql += " AND snap.liquidity >= :liquidity_min"
        params["liquidity_min"] = factor["liquidity_min"]
    
    if factor.get("liquidity_max") is not None:
        sql += " AND snap.liquidity <= :liquidity_max"
        params["liquidity_max"] = factor["liquidity_max"]
    
    # ========== 自定义筛选 ==========
    custom_filters = criteria.get("custom_filters", [])
    for i, custom in enumerate(custom_filters):
        field = custom.get("field")
        # 安全检查：只允许已知字段
        allowed_fields = {
            "market_cap", "pe_ratio", "pb_ratio", "close", "volume",
            "rsi", "momentum", "volatility", "liquidity",
            "macd_line", "macd_signal", "kdj_k", "kdj_d", "kdj_j"
        }
        if field not in allowed_fields:
            continue
        
        # 确定字段来源表
        stock_fields = {"market_cap", "pe_ratio", "pb_ratio"}
        table_prefix = "s" if field in stock_fields else "snap"
        
        if custom.get("min") is not None:
            param_name = f"custom_{i}_min"
            sql += f" AND {table_prefix}.{field} >= :{param_name}"
            params[param_name] = custom["min"]
        
        if custom.get("max") is not None:
            param_name = f"custom_{i}_max"
            sql += f" AND {table_prefix}.{field} <= :{param_name}"
            params[param_name] = custom["max"]
    
    
    # ========== 排序和分页 (数据库层完成) ==========
    sql += " ORDER BY s.market_cap DESC NULLS LAST LIMIT 200"
    
    # 执行查询
    result = session.execute(text(sql), params)
    rows = result.fetchall()
    columns = result.keys()
    
    # 转换为字典列表
    import math
    items = []
    for row in rows:
        item = dict(zip(columns, row))
        # 处理日期序列化
        if item.get("trade_date"):
            item["trade_date"] = str(item["trade_date"])
        
        # 清洗 NaN 和 Inf 值，防止 JSON 序列化错误
        for key, value in item.items():
            if isinstance(value, float):
                if math.isnan(value) or math.isinf(value):
                    item[key] = None
        
        items.append(item)
    
    return items

