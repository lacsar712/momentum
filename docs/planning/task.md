# A股可视化选股与量化交易系统 Task List

## Phase 1: Project Initialization & Infrastructure (Week 1)
- [/] Initialize project repository structure (`frontend`, `backend`, `docker-compose.yml`)
- [x] Create `docker-compose.yml` with PostgreSQL, Redis, Backend, Frontend
- [x] Backend: Initialize FastAPI project with SQLModel
- [x] Backend: Configure Database connection and Docker environment variables
- [x] Frontend: Initialize React + Vite + TypeScript + Tailwind CSS project
- [x] Frontend: Setup Nginx configuration for reverse proxy

## Critical Fixes & Enhancements (Current Priority)
- [x] 修复数据同步问题
    - [x] 调查 akshare/eastmoney 接口返回 0 的原因
    - [x] 移除 seed.py 中的模拟数据
    - [x] 添加详细的同步日志记录 (backend)
    - [x] 前端展示同步日志 (/logs)
    - [x] 确保 sync_stock_list 返回真实数据
    - [x] 解决 502 Timeout 问题 (Nginx配置优化)
- [x] 系统汉化 (Deep Localization)
    - [x] 替换原生 DatePicker 为中文日历组件
    - [x] 汉化所有页面 (Dashboard, DataCenter, etc.)
    - [x] 汉化所有 Placeholder 和 Loading 提示
    - [x] 汉化图表 Tooltip 和 Legend
    - [x] 系统日志数据源汉化
- [x] UI 重构 (Modern Light Futuristic)
    - [x] 全局样式重写 (Light Theme, Subtle Gradients)
    - [x] 侧边栏/导航栏重设计 (Fixed Full Height, Merged Footer)
    - [x] 统一卡片样式 (Soft Shadows, Rounded Corners)
    - [x] 优化字体、间距与交互反馈 (Hover/Active)
- [x] 数据完整性验证
    - [x] 修复 Screening 模块 KeyError 问题
- [x] 数据同步稳定性增强
    - [x] 实现 HTTPAdapter 与 Retry 机制 (Handle RemoteDisconnected)
    - [x] 增加随机请求延迟 (Rate Limiting Mitigation)
    - [x] 实现同步进度条反馈 (Backend Global State + Frontend Polling)
    - [x] 优化 DataCenter 界面展示 (Real-time Progress Modal)
    - [x] 优化数据源请求配置 (Timeouts & Headers)
- [x] 系统汉化 (Deep Localization)
    - [x] 系统日志数据源汉化

## Phase 2: Data Acquisition & Storage (Week 2-3)
- [x] Database: Define `StockBasic`, `DailyBar`, `Financial` tables
- [x] Data Service: Implement AkShare data fetcher (Stock List)
- [x] Data Service: Implement history data fetcher (Daily Bars)
- [x] Data Service: Implement financial indicator fetcher
- [x] Data Service: Implement "Sync/Update" mechanism (Incremental update)
- [x] Scheduler: Setup APScheduler for daily data sync tasks (15:35)
- [x] API: Create endpoints for retrieving stock data (List, History)

## Phase 3: Strategy Engine & Backtesting (Week 4-5)
- [x] Strategy: Implement `BaseStrategy` class (Abstract)
- [x] Strategy: Implement "MA Cross" Strategy
- [x] Strategy: Implement "Momentum" Strategy
- [x] Strategy: Implement "Mean Reversion" Strategy
- [x] Strategy: Implement at least 7 more strategies (RSI, MACD, KDJ, Volatility, etc)
- [x] Backtest: Build vectorized backtesting engine (Fast calculation)
- [x] Backtest: Calculate performance metrics (Sharpe, Drawdown, Return)
- [x] API: Create endpoints for running backtests and retrieving results

## Phase 4: Stock Screener & Analysis (Week 6)
- [x] Screener: Implement backend query builder for multi-factor filtering
- [x] Screener: Support "Technical Indicator" filtering (RSI, KDJ values)
- [x] Screener: Support "Morphology" recognition (Pattern matching logic)
- [x] API: Create endpoints for Stock Screening (Search/Filter/Export/Preset)
- [x] Screener: Improve preset interaction (Auto-run, Modal Delete, Export State)

## Phase 5: Frontend Development (Week 7-9)
- [x] UI: Implement App Shell (Sidebar, Header, Theme Toggle)
- [x] UI: Create "Market Overview" Dashboard
- [x] UI: Create "Stock Screener" Page (Filter forms, Results table)
- [x] UI: Create "Stock Detail" Page with ECharts K-Line (Candlestick + Volume + MA)
- [x] UI: Create "Strategy Lab" Page (Param config, Backtest button, Result charts)
- [ ] UI: Implement "Morphology Selection" Interface
- [x] UI: Polishing & Animations (Framer Motion / CSS Transitions)

## Phase 6: Verification & Delivery (Week 10)
- [ ] Tests: Write backend unit tests for Strategy and Data modules
- [ ] Tests: Write frontend specific component tests
- [ ] Docker: Verify full `docker compose up --build` works cleanly
- [ ] Documentation: Write `README.md` (Deployment, API, Features)
- [ ] Documentation: Write User Manual and Maintenance Guide
