import json
from datetime import date
from sqlmodel import select
from app.models import Stock, StrategyDefinition, DailyPrice, FactorValue, User, DividendEvent
from app.services.auth import hash_password
from app.services.strategies import get_strategy_map

_SAMPLE_DIVIDENDS = [
    {"symbol": "600519", "ex_date": "2024-06-19", "cash_dividend": 30.876, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "600519", "ex_date": "2023-06-20", "cash_dividend": 27.452, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "600519", "ex_date": "2022-06-30", "cash_dividend": 21.675, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "000858", "ex_date": "2024-07-05", "cash_dividend": 2.165, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "000858", "ex_date": "2023-07-04", "cash_dividend": 1.982, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "601318", "ex_date": "2024-07-16", "cash_dividend": 2.43, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "601318", "ex_date": "2023-07-17", "cash_dividend": 1.5, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "600036", "ex_date": "2024-07-12", "cash_dividend": 1.972, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "600036", "ex_date": "2023-07-13", "cash_dividend": 1.772, "bonus_ratio": 0.0, "rights_ratio": 0.0, "rights_price": 0.0},
    {"symbol": "000001", "ex_date": "2024-07-11", "cash_dividend": 0.216, "bonus_ratio": 0.0, "rights_ratio": 0.3, "rights_price": 10.0},
    {"symbol": "000001", "ex_date": "2023-07-12", "cash_dividend": 0.185, "bonus_ratio": 0.1, "rights_ratio": 0.0, "rights_price": 0.0},
]

def seed_basic_data(session):
    if not session.exec(select(User)).first():
        session.add(User(username="admin", password_hash=hash_password("123456"), role="admin"))
        session.add(User(username="analyst", password_hash=hash_password("123456"), role="analyst"))
        session.commit()
    if session.exec(select(Stock)).first():
        return
    # Remove dummy data generation as requested by user
    # samples = [...]
    
    # Initialize strategies
    if not session.exec(select(StrategyDefinition)).first():
        for name, func in get_strategy_map().items():
            session.add(StrategyDefinition(name=name, description=f"{name}策略", parameters_json=json.dumps({}, ensure_ascii=False)))
        session.commit()

    if not session.exec(select(DividendEvent)).first():
        for item in _SAMPLE_DIVIDENDS:
            stock = session.exec(select(Stock).where(Stock.symbol == item["symbol"])).first()
            if stock:
                session.add(DividendEvent(
                    stock_id=stock.id,
                    ex_date=date.fromisoformat(item["ex_date"]),
                    cash_dividend=item["cash_dividend"],
                    bonus_ratio=item["bonus_ratio"],
                    rights_ratio=item["rights_ratio"],
                    rights_price=item["rights_price"],
                ))
        session.commit()
