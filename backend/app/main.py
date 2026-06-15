import logging
import time
from datetime import date
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from apscheduler.schedulers.background import BackgroundScheduler
from app.core.config import settings
from app.db import init_db, get_session
from app.routers import router
from app.services.seed import seed_basic_data
from app.services.data_sync import sync_stock_list, sync_daily
from app.models import Stock
from sqlmodel import select

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("momentum")

from app.services.scheduler import init_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Backend starting up")
    init_db()
    session = get_session()
    seed_basic_data(session)
    init_scheduler()
    yield
    logger.info("Backend shutting down")

app = FastAPI(
    title="Momentum A-Share System",
    description="Quantitative Trading System Backend",
    version="1.0.0",
    lifespan=lifespan
)

app.include_router(router)

@app.middleware("http")
async def request_timing(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = (time.time() - start) * 1000
    logger.info("request completed", extra={"path": request.url.path, "status_code": response.status_code, "duration_ms": round(duration, 2)})
    return response

@app.get("/")
async def root():
    return {"message": "欢迎使用 Momentum API", "docs": "/docs"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}
