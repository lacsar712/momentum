from sqlmodel import select, Session, create_engine
from app.models import Stock

# Setup DB connection (assuming default sqlite path or env)
# The user's docker-compose usually sets up checking DB. 
# But here I am running locally. I need to know where the DB is or reuse app logic.
# I'll try to import from main app initialization if possible, or just look at env.
# In this environment, I can't easily connect to the docker postgres unless port is exposed.
# Docker compose usually exposes ports.
# Let's assume I can use `app.db` if I run it via `python -m ...` or similar.

# Actually, I can just create a script that imports 'app.models' and 'app.db' (if existing) 
# and prints 5 stocks with their market_cap.

import sys
import os

# Add backend path to sys.path
sys.path.append("/Users/jack.yan/Downloads/labeleases/stage03/411/momentum/backend")

from app.db import get_session, init_db

# Mocking session dep or just using engine
from app.db import engine

def check_market_cap():
    with Session(engine) as session:
        stocks = session.exec(select(Stock).limit(10)).all()
        print(f"Found {len(stocks)} stocks.")
        for s in stocks:
            print(f"Symbol: {s.symbol}, Name: {s.name}, Market Cap: {s.market_cap}")

if __name__ == "__main__":
    check_market_cap()
