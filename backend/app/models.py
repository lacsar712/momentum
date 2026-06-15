from datetime import date, datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class Stock(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    name: str
    market: str
    industry: Optional[str] = None
    concept_tags: Optional[str] = None
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    prices: List["DailyPrice"] = Relationship(back_populates="stock")
    financials: List["FinancialMetric"] = Relationship(back_populates="stock")
    factors: List["FactorValue"] = Relationship(back_populates="stock")
    snapshots: List["StockSnapshot"] = Relationship(back_populates="stock")

class DailyPrice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    stock_id: int = Field(foreign_key="stock.id", index=True)
    trade_date: date = Field(index=True)
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: Optional[float] = None
    stock: Optional[Stock] = Relationship(back_populates="prices")

class FinancialMetric(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    stock_id: int = Field(foreign_key="stock.id", index=True)
    report_date: date = Field(index=True)
    revenue: Optional[float] = None
    net_profit: Optional[float] = None
    roe: Optional[float] = None
    debt_ratio: Optional[float] = None
    revenue_yoy: Optional[float] = None
    net_profit_yoy: Optional[float] = None
    stock: Optional[Stock] = Relationship(back_populates="financials")

class FactorValue(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    stock_id: int = Field(foreign_key="stock.id", index=True)
    factor_date: date = Field(index=True)
    momentum: Optional[float] = None
    volatility: Optional[float] = None
    liquidity: Optional[float] = None
    stock: Optional[Stock] = Relationship(back_populates="factors")

class StrategyDefinition(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str
    parameters_json: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BacktestResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    strategy_name: str = Field(index=True)
    symbol: str = Field(index=True)
    start_date: date
    end_date: date
    annual_return: float
    max_drawdown: float
    sharpe: float
    win_rate: float
    profit_factor: float
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PatternResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    pattern_name: str = Field(index=True)
    detected_date: date
    success_rate: Optional[float] = None
    score: Optional[float] = None

class ScreeningPreset(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    payload_json: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DataSyncLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    data_source: str
    sync_type: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    role: str = Field(default="analyst")
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StockSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    stock_id: int = Field(foreign_key="stock.id", index=True, unique=True)
    latest_date: date
    close: float
    volume: float
    rsi: Optional[float] = None
    macd_line: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    kdj_k: Optional[float] = None
    kdj_d: Optional[float] = None
    kdj_j: Optional[float] = None
    momentum: Optional[float] = None
    volatility: Optional[float] = None
    liquidity: Optional[float] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    stock: Optional[Stock] = Relationship(back_populates="snapshots")
    ma5: Optional[float] = None
    ma10: Optional[float] = None
    ma20: Optional[float] = None
    ma60: Optional[float] = None

class WatchGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    name: str
    sort_weight: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    items: List["WatchItem"] = Relationship(back_populates="group")

class WatchItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    stock_id: int = Field(foreign_key="stock.id", index=True)
    group_id: int = Field(foreign_key="watchgroup.id", index=True)
    added_at: datetime = Field(default_factory=datetime.utcnow)
    note: Optional[str] = None
    group: Optional[WatchGroup] = Relationship(back_populates="items")
