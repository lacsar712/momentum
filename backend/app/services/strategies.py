
from abc import ABC, abstractmethod
import pandas as pd
from app.services.indicators import moving_average, rsi, macd, kdj

class BaseStrategy(ABC):
    def __init__(self, **kwargs):
        self.params = kwargs

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        pass

    def run(self, df: pd.DataFrame) -> pd.Series:
        return self.generate_signals(df)

class MACrossStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        short_window = int(self.params.get("short_window", 5))
        long_window = int(self.params.get("long_window", 20))
        short_ma = moving_average(df["close"], short_window)
        long_ma = moving_average(df["close"], long_window)
        return (short_ma > long_ma).astype(int)

class MomentumStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        window = int(self.params.get("window", 20))
        momentum = df["close"].pct_change(window)
        return (momentum > 0).astype(int)

class MeanReversionStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        window = int(self.params.get("window", 20))
        threshold = float(self.params.get("threshold", -0.05))
        returns = df["close"].pct_change(window)
        return (returns < threshold).astype(int)

class RSIStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        window = int(self.params.get("window", 14))
        oversold = float(self.params.get("oversold", 30))
        r = rsi(df["close"], window)
        return (r < oversold).astype(int)

class MACDStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        macd_line, signal_line, _ = macd(df["close"])
        return (macd_line > signal_line).astype(int)

class KDJStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        k, d, j = kdj(df)
        return ((k > d) & (j > 0)).astype(int)

class VolatilityBreakoutStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        window = int(self.params.get("window", 14))
        volatility = df["close"].pct_change().rolling(window).std()
        threshold = volatility.rolling(window).mean()
        return (volatility > threshold).astype(int)

class VolumeSpikeStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        window = int(self.params.get("window", 20))
        vol_ma = df["volume"].rolling(window).mean()
        return (df["volume"] > vol_ma * 1.5).astype(int)

class TrendFollowingStrategy(BaseStrategy):
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        window = int(self.params.get("window", 50))
        ma = moving_average(df["close"], window)
        return (df["close"] > ma).astype(int)

# Wrappers for compatibility
def get_strategy_map():
    return {
        "均线交叉": lambda df, **k: MACrossStrategy(**k).run(df),
        "动量策略": lambda df, **k: MomentumStrategy(**k).run(df),
        "均值回归": lambda df, **k: MeanReversionStrategy(**k).run(df),
        "RSI 反转": lambda df, **k: RSIStrategy(**k).run(df),
        "MACD 金叉": lambda df, **k: MACDStrategy(**k).run(df),
        "KDJ 反转": lambda df, **k: KDJStrategy(**k).run(df),
        "波动突破": lambda df, **k: VolatilityBreakoutStrategy(**k).run(df),
        "量能放大": lambda df, **k: VolumeSpikeStrategy(**k).run(df),
        "趋势跟随": lambda df, **k: TrendFollowingStrategy(**k).run(df),
    }

