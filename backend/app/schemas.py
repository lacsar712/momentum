from datetime import date, datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class DateRangeRequest(BaseModel):
    start_date: date
    end_date: date
    symbols: Optional[List[str]] = None
    sync_type: str = Field(default="incremental")

class DailyDataRequest(BaseModel):
    trade_date: date
    symbols: Optional[List[str]] = None

class PriceRangeRequest(BaseModel):
    symbol: str
    start_date: date
    end_date: date
    frequency: str = Field(default="D") # D, W, M

class ScreeningRequest(BaseModel):
    name: Optional[str] = None
    basic_filters: Dict[str, Any] = Field(default_factory=dict)
    technical_filters: Dict[str, Any] = Field(default_factory=dict)
    factor_filters: Dict[str, Any] = Field(default_factory=dict)
    custom_filters: List[Dict[str, Any]] = Field(default_factory=list)

class ScreeningExportRequest(ScreeningRequest):
    file_type: str = Field(default="csv")

class ScreeningResponse(BaseModel):
    total: int
    items: List[Dict[str, Any]]

class PatternScanRequest(BaseModel):
    symbols: Optional[List[str]] = None
    patterns: List[str]
    start_date: date
    end_date: date
    params: Dict[str, Any] = Field(default_factory=dict)

class BacktestRequest(BaseModel):
    strategy_name: str
    symbols: List[str]
    start_date: date
    end_date: date
    parameters: Dict[str, Any] = Field(default_factory=dict)

class ExportRequest(BaseModel):
    symbols: Optional[List[str]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    file_type: str = Field(default="csv")

class PresetRequest(BaseModel):
    name: str
    payload: Dict[str, Any]

class LoginRequest(BaseModel):
    username: str
    password: str

class AuthResponse(BaseModel):
    token: str
    role: str

class LogDeleteRequest(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    delete_all: bool = False

class WatchGroupCreate(BaseModel):
    name: str

class WatchGroupUpdate(BaseModel):
    name: str

class WatchGroupReorder(BaseModel):
    ordered_ids: List[int]

class WatchItemAdd(BaseModel):
    stock_id: int
    group_id: int
    note: Optional[str] = None

class WatchItemMove(BaseModel):
    target_group_id: int

class WatchItemNoteUpdate(BaseModel):
    note: str

class WatchBatchImport(BaseModel):
    group_id: int
    stock_ids: List[int]

class StockBasicInfo(BaseModel):
    symbol: str
    name: str
    market: str
    industry: Optional[str] = None
    concept_tags: Optional[List[str]] = None
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None

class StockQuoteSnapshot(BaseModel):
    latest_date: date
    close: float
    volume: float
    change_pct: Optional[float] = None

class KLineItem(BaseModel):
    trade_date: date
    open: float
    high: float
    low: float
    close: float
    volume: float

class FinancialSummary(BaseModel):
    report_date: date
    revenue: Optional[float] = None
    net_profit: Optional[float] = None
    roe: Optional[float] = None
    debt_ratio: Optional[float] = None
    revenue_yoy: Optional[float] = None
    net_profit_yoy: Optional[float] = None

class FactorValues(BaseModel):
    factor_date: date
    momentum: Optional[float] = None
    volatility: Optional[float] = None
    liquidity: Optional[float] = None

class TechnicalIndicators(BaseModel):
    rsi: Optional[float] = None
    macd_status: Optional[str] = None
    kdj_status: Optional[str] = None
    ma_trend: Optional[str] = None
    ma5: Optional[float] = None
    ma10: Optional[float] = None
    ma20: Optional[float] = None
    ma60: Optional[float] = None

class PatternRecord(BaseModel):
    pattern_name: str
    detected_date: date
    success_rate: Optional[float] = None
    score: Optional[float] = None

class StockDetailResponse(BaseModel):
    basic_info: StockBasicInfo
    quote: StockQuoteSnapshot
    kline_60: List[KLineItem]
    financial: Optional[FinancialSummary] = None
    factors: Optional[FactorValues] = None
    technical: Optional[TechnicalIndicators] = None
    patterns_30: List[PatternRecord]

class MockOrderRequest(BaseModel):
    symbol: str
    direction: str
    quantity: int

class MockAccountSummary(BaseModel):
    account_id: int
    initial_capital: float
    available_cash: float
    position_market_value: float
    total_assets: float
    cumulative_pnl: float
    today_pnl: float

class MockPositionItem(BaseModel):
    stock_id: int
    symbol: str
    name: str
    quantity: int
    avg_cost: float
    current_price: float
    market_value: float
    floating_pnl: float
    floating_pnl_pct: float

class MockTradeItem(BaseModel):
    id: int
    symbol: str
    name: str
    direction: str
    quantity: int
    price: float
    commission: float
    status: str
    traded_at: datetime

class PriceRangeAdjRequest(BaseModel):
    symbol: str
    start_date: date
    end_date: date
    frequency: str = Field(default="D")
    adjust: str = Field(default="none")

class DividendEventItem(BaseModel):
    id: int
    stock_id: int
    ex_date: date
    cash_dividend: float
    bonus_ratio: float
    rights_ratio: float
    rights_price: float

class DividendEventCreate(BaseModel):
    symbol: str
    ex_date: date
    cash_dividend: float = 0.0
    bonus_ratio: float = 0.0
    rights_ratio: float = 0.0
    rights_price: float = 0.0

class AdjustedPriceResponse(BaseModel):
    prices: List[Dict[str, Any]]
    dividend_events: List[DividendEventItem]
