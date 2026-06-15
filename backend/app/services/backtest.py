import numpy as np
import pandas as pd

def compute_metrics(returns: pd.Series) -> dict:
    if returns.empty:
        return {"annual_return": 0.0, "max_drawdown": 0.0, "sharpe": 0.0, "win_rate": 0.0, "profit_factor": 0.0}
    cumulative = (1 + returns).cumprod()
    peak = cumulative.cummax()
    drawdown = (cumulative - peak) / peak
    annual_return = cumulative.iloc[-1] ** (252 / len(returns)) - 1
    sharpe = returns.mean() / (returns.std() + 1e-9) * np.sqrt(252)
    win_rate = (returns > 0).mean()
    profit_factor = returns[returns > 0].sum() / (abs(returns[returns < 0].sum()) + 1e-9)
    return {
        "annual_return": float(annual_return),
        "max_drawdown": float(drawdown.min()),
        "sharpe": float(sharpe),
        "win_rate": float(win_rate),
        "profit_factor": float(profit_factor),
    }

def run_backtest(df: pd.DataFrame, signal: pd.Series) -> dict:
    aligned = df.copy()
    aligned["signal"] = signal.shift(1).fillna(0)
    aligned["ret"] = aligned["close"].pct_change().fillna(0)
    aligned["strategy_ret"] = aligned["signal"] * aligned["ret"]
    metrics = compute_metrics(aligned["strategy_ret"])
    equity_curve = (1 + aligned["strategy_ret"]).cumprod()
    return {
        "metrics": metrics,
        "equity_curve": equity_curve.tolist(),
        "returns": aligned["strategy_ret"].tolist(),
        "dates": aligned["trade_date"].astype(str).tolist(),
    }
