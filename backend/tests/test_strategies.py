import pytest
import pandas as pd
from app.services.strategies import MACrossStrategy, RSIStrategy

def test_ma_cross_strategy():
    data = {"close": [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10]} # Simple trend reversal
    df = pd.DataFrame(data)
    strategy = MACrossStrategy(short_window=2, long_window=5)
    signals = strategy.run(df)
    assert len(signals) == len(df)
    # Check that we get some signals (0 or 1)
    assert signals.isin([0, 1]).all()

def test_rsi_strategy():
    data = {"close": [100] * 20} # Flat line
    df = pd.DataFrame(data)
    strategy = RSIStrategy(window=14, oversold=30)
    signals = strategy.run(df)
    assert len(signals) == len(df)

if __name__ == "__main__":
    # Manually run if needed
    test_ma_cross_strategy()
    test_rsi_strategy()
    print("Basic strategy tests passed.")
