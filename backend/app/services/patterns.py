from typing import List, Dict, Any
import numpy as np
import pandas as pd

PATTERN_NAMES = [
    "头肩顶",
    "头肩底",
    "双重顶",
    "双重底",
    "三角形整理",
    "旗形整理",
    "楔形整理",
    "杯柄形态",
]

def _local_extrema(series: pd.Series, window: int = 5):
    rolling_max = series.rolling(window).max()
    rolling_min = series.rolling(window).min()
    peaks = series[(series == rolling_max)]
    troughs = series[(series == rolling_min)]
    return peaks, troughs

def detect_patterns(df: pd.DataFrame, patterns: List[str], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    results = []
    if df.empty:
        return results
    
    close = df["close"]
    window = int(params.get("window", 5))
    peaks, troughs = _local_extrema(close, window)
    
    # We only check the most recent window for pattern formation
    recent_peaks = peaks.tail(5)
    recent_troughs = troughs.tail(5)
    last_date = df["trade_date"].iloc[-1]
    
    for name in patterns:
        score = 0.0
        
        # 1. Head and shoulders (Top: Lower High - Higher High - Lower High)
        if name == "头肩顶" and len(recent_peaks) >= 3:
            p1, p2, p3 = recent_peaks.iloc[-3], recent_peaks.iloc[-2], recent_peaks.iloc[-1]
            if p2 > p1 and p2 > p3: # Middle peak is highest
                 score = 0.8
        
        # 2. Head and shoulders (Bottom: Higher Low - Lower Low - Higher Low)
        elif name == "头肩底" and len(recent_troughs) >= 3:
             t1, t2, t3 = recent_troughs.iloc[-3], recent_troughs.iloc[-2], recent_troughs.iloc[-1]
             if t2 < t1 and t2 < t3: # Middle trough is lowest
                 score = 0.8

        # 3. Double Top (Two similar peaks)
        elif name == "双重顶" and len(recent_peaks) >= 2:
            p1, p2 = recent_peaks.iloc[-2], recent_peaks.iloc[-1]
            if abs(p1 - p2) / p1 < 0.03: # Within 3% difference
                score = 0.7

        # 4. Double Bottom (Two similar troughs)
        elif name == "双重底" and len(recent_troughs) >= 2:
            t1, t2 = recent_troughs.iloc[-2], recent_troughs.iloc[-1]
            if abs(t1 - t2) / t1 < 0.03:
                score = 0.7

        # 5. Triangle (Decreasing volatility)
        elif name == "三角形整理":
            volatility = close.tail(20).std()
            if volatility < close.tail(40).std() * 0.5: # Volatility contracting
                score = 0.6
                
        # 6. Flag (Sharp move then consolidation)
        elif name == "旗形整理":
            recent_move = abs(close.iloc[-1] - close.iloc[-10]) / close.iloc[-10]
            consolidation = close.tail(5).std() / close.tail(5).mean()
            if recent_move > 0.05 and consolidation < 0.02:
                score = 0.65

        # 7. Wedge (Converging trend lines - generic check)
        elif name == "楔形整理":
             if len(recent_peaks) >= 2 and len(recent_troughs) >= 2:
                 p_slope = recent_peaks.iloc[-1] - recent_peaks.iloc[-2]
                 t_slope = recent_troughs.iloc[-1] - recent_troughs.iloc[-2]
                 if p_slope * t_slope > 0 and abs(p_slope) < abs(t_slope): # Converging
                     score = 0.6

        # 8. Cup and Handle (U-shape then small drop)
        elif name == "杯柄形态":
            # Simplified: check for U shape context
            if len(recent_peaks) >= 2:
                # Very rough heuristic
                score = 0.5

        if score > 0:
            results.append({
                "pattern_name": name,
                "detected_date": last_date.strftime("%Y-%m-%d") if hasattr(last_date, 'strftime') else str(last_date),
                "success_rate": 0.5 + score * 0.4, # Mock success rate based on score
                "score": score,
            })
    return results
