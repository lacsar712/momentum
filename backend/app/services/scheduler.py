from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.db import get_session
from app.services.data_sync import sync_daily, sync_stock_list
from app.services.snapshot_updater import update_stock_snapshots
from app.models import Stock
from sqlmodel import select
from datetime import date, timedelta
import logging

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

def daily_sync_job():
    logger.info("Starting scheduled daily sync...")
    with get_session() as session:
        # 1. Sync stock list first
        sync_stock_list(session)
        
        # 2. Sync daily data for all stocks
        stocks = session.exec(select(Stock)).all()
        symbols = [s.symbol for s in stocks]
        
        today = date.today()
        # If today is weekend, maybe skip? But akshare handles it.
        # Sync last 3 days to be safe
        start_date = today - timedelta(days=3)
        
        logger.info(f"Syncing {len(symbols)} stocks from {start_date} to {today}")
        sync_daily(session, symbols, start_date, today, sync_type="scheduled")
        
        # 3. 更新股票快照表 (预计算技术指标)
        logger.info("Updating stock snapshots for fast screening...")
        updated_count = update_stock_snapshots(session)
        logger.info(f"Stock snapshots updated: {updated_count} stocks")
        
    logger.info("Scheduled daily sync completed.")

def init_scheduler():
    # Run at 15:35 every weekday
    trigger = CronTrigger(day_of_week='mon-fri', hour=15, minute=35)
    scheduler.add_job(daily_sync_job, trigger, id='daily_sync', replace_existing=True)
    scheduler.start()
    logger.info("APScheduler started. Daily sync scheduled for 15:35 Mon-Fri.")

