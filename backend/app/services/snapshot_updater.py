"""
快照更新服务 - 定时更新 StockSnapshot 预计算表
每日收盘后批量计算所有股票的技术指标并写入快照表
"""
from datetime import date, datetime, timedelta
from typing import Callable, Optional
import pandas as pd
from sqlmodel import select, Session
from app.models import Stock, DailyPrice, FactorValue, StockSnapshot
from app.services.indicators import rsi, macd, kdj


def update_stock_snapshots(
    session: Session,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> int:
    """
    批量更新所有股票的快照数据
    
    Args:
        session: 数据库会话
        progress_callback: 进度回调函数 (current, total, message)
    
    Returns:
        更新的股票数量
    """
    stocks = session.exec(select(Stock)).all()
    total = len(stocks)
    updated = 0
    
    if progress_callback:
        progress_callback(0, total, "开始更新股票快照...")
    
    for i, stock in enumerate(stocks):
        try:
            # 获取该股票最新的60条价格数据，无论日期新旧
            prices = session.exec(
                select(DailyPrice)
                .where(DailyPrice.stock_id == stock.id)
                .order_by(DailyPrice.trade_date.desc())
                .limit(60)
            ).all()
            
            if not prices:
                continue
            
            # 按日期升序排列以便计算指标
            prices.reverse()
            
            # 转换为DataFrame
            df = pd.DataFrame([{
                "trade_date": p.trade_date,
                "open": p.open,
                "high": p.high,
                "low": p.low,
                "close": p.close,
                "volume": p.volume
            } for p in prices])
            
            if df.empty or len(df) < 14:  # 至少需要14天数据计算RSI
                continue
            
            # 获取最新一天的数据
            latest = df.iloc[-1]
            latest_date = latest["trade_date"]
            close_price = float(latest["close"])
            volume_val = float(latest["volume"])
            
            # 计算技术指标
            rsi_series = rsi(df["close"], window=14)
            rsi_val = float(rsi_series.iloc[-1]) if not pd.isna(rsi_series.iloc[-1]) else None
            
            macd_line_series, macd_signal_series, macd_hist_series = macd(df["close"])
            macd_line_val = float(macd_line_series.iloc[-1]) if not pd.isna(macd_line_series.iloc[-1]) else None
            macd_signal_val = float(macd_signal_series.iloc[-1]) if not pd.isna(macd_signal_series.iloc[-1]) else None
            macd_hist_val = float(macd_hist_series.iloc[-1]) if not pd.isna(macd_hist_series.iloc[-1]) else None
            
            k_series, d_series, j_series = kdj(df)
            kdj_k_val = float(k_series.iloc[-1]) if not pd.isna(k_series.iloc[-1]) else None
            kdj_d_val = float(d_series.iloc[-1]) if not pd.isna(d_series.iloc[-1]) else None
            kdj_j_val = float(j_series.iloc[-1]) if not pd.isna(j_series.iloc[-1]) else None
            
            # 获取因子数据
            factor = session.exec(
                select(FactorValue)
                .where(FactorValue.stock_id == stock.id)
                .order_by(FactorValue.factor_date.desc())
                .limit(1)
            ).first()
            
            momentum_val = factor.momentum if factor else None
            volatility_val = factor.volatility if factor else None
            liquidity_val = factor.liquidity if factor else None
            
            # 更新或创建快照
            snapshot = session.exec(
                select(StockSnapshot).where(StockSnapshot.stock_id == stock.id)
            ).first()
            
            if snapshot:
                snapshot.latest_date = latest_date
                snapshot.close = close_price
                snapshot.volume = volume_val
                snapshot.rsi = rsi_val
                snapshot.macd_line = macd_line_val
                snapshot.macd_signal = macd_signal_val
                snapshot.macd_hist = macd_hist_val
                snapshot.kdj_k = kdj_k_val
                snapshot.kdj_d = kdj_d_val
                snapshot.kdj_j = kdj_j_val
                snapshot.momentum = momentum_val
                snapshot.volatility = volatility_val
                snapshot.liquidity = liquidity_val
                snapshot.updated_at = datetime.utcnow()
            else:
                snapshot = StockSnapshot(
                    stock_id=stock.id,
                    latest_date=latest_date,
                    close=close_price,
                    volume=volume_val,
                    rsi=rsi_val,
                    macd_line=macd_line_val,
                    macd_signal=macd_signal_val,
                    macd_hist=macd_hist_val,
                    kdj_k=kdj_k_val,
                    kdj_d=kdj_d_val,
                    kdj_j=kdj_j_val,
                    momentum=momentum_val,
                    volatility=volatility_val,
                    liquidity=liquidity_val
                )
                session.add(snapshot)
            
            updated += 1
            
            if progress_callback and (i + 1) % 100 == 0:
                progress_callback(i + 1, total, f"已处理 {i + 1}/{total} 只股票")
        
        except Exception as e:
            # 单只股票失败不影响整体
            print(f"更新股票 {stock.symbol} 快照失败: {e}")
            continue
    
    session.commit()
    
    if progress_callback:
        progress_callback(total, total, f"快照更新完成，共更新 {updated} 只股票")
    
    return updated
