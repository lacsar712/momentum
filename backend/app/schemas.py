from datetime import date
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
