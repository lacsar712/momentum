import json
from datetime import date
from sqlmodel import select
from app.models import Stock, StrategyDefinition, DailyPrice, FactorValue, User
from app.services.auth import hash_password
from app.services.strategies import get_strategy_map

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
