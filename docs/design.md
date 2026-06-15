# 详细设计文档 (Detailed Design)

## 1. 数据库设计 (Database Schema)

系统使用 PostgreSQL 存储核心业务数据，Redis 用于缓存热点数据（如 K 线图数据、计算结果）。

### 1.1 实体关系图 (ERD)

- **Stock (股票基础表)**
    - `id`: Int, Primary Key
    - `symbol`: String, Index (e.g., "600519")
    - `name`: String (e.g., "贵州茅台")
    - `market`: String (e.g., "SH", "SZ")
    - `list_date`: Date
    - `market_cap`: Decimal (总市值)
    - `pe_ttm`: Decimal (滚动市盈率)
    - `pb`: Decimal (市净率)

- **DailyPrice (日线行情表)**
    - `id`: Int, Primary Key
    - `stock_id`: Int, Foreign Key -> Stock.id
    - `trade_date`: Date, Index
    - `open`: Decimal
    - `high`: Decimal
    - `low`: Decimal
    - `close`: Decimal
    - `volume`: BigInt
    - `amount`: Decimal

- **ScreeningPreset (选股预设)**
    - `id`: Int, Primary Key
    - `name`: String
    - `payload_json`: Text (存储 JSON 格式的筛选条件)
    - `created_at`: Datetime

- **BacktestResult (回测结果)**
    - `id`: Int, Primary Key
    - `strategy_name`: String
    - `params_json`: Text (策略参数)
    - `annual_return`: Decimal
    - `max_drawdown`: Decimal
    - `sharpe_ratio`: Decimal
    - `created_at`: Datetime

- **DataSyncLog (同步日志)**
    - `id`: Int, Primary Key
    - `data_source`: String (e.g., "akshare")
    - `status`: String ("success", "failed")
    - `message`: String
    - `created_at`: Datetime

## 2. API 接口设计

遵循 RESTful 规范，基础路径 `/api/v1`。

### 2.1 行情数据 (Market Data)
- `GET /stocks`: 获取股票列表（支持分页、搜索）。
- `POST /data/price_range`: 获取指定股票区间 K 线数据。
- `POST /data/sync/daily`: 触发日线数据同步任务。

### 2.2 选股筛选 (Screening)
- `POST /screening/run`: 执行选股查询。支持市值、PE、技术指标等多维度过滤。
- `POST /screening/preset`: 保存当前筛选条件为预设。
- `GET /screening/preset`: 获取所有保存的预设列表。
- `DELETE /screening/preset`: 删除指定预设。

### 2.3 策略回测 (Backtesting)
- `GET /strategies`: 获取可用策略列表。
- `POST /backtest/run`: 执行回测任务。输入：策略名、股票池、时间区间、参数。输出：收益率曲线、关键指标。

### 2.4 形态识别 (Pattern Recognition)
- `GET /patterns/library`: 获取支持的形态库（如“头肩顶”、“早晨之星”）。
- `POST /patterns/scan`: 扫描全市场匹配指定形态的股票，并计算历史胜率。

### 2.5 系统管理 (System)
- `POST /export`: 导出数据。默认导出最近 30 天数据以优化性能。
- `GET /dashboard/stats`: 获取看板统计数据。

## 3. 前端组件设计

- **Layout**: 侧边栏导航 + 顶部状态栏 + 内容区域。
- **DataGrid**: 通用表格组件，支持排序、分页、自定义列渲染。
- **Chart**: 基于 Apache ECharts 封装的图表组件，支持 K 线、折线、饼图。
- **Modal**: 使用 `createPortal` 实现的全局弹窗，解决 z-index 层级问题。
- **Loading**: 通用加载状态指示器，用于按钮和区块遮罩。
