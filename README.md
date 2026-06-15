# Momentum - A股量化分析与交易系统

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

基于 FastAPI 和 React 构建的现代化 A 股量化分析平台。提供从数据同步、策略回测、形态识别到可视化选股的一站式解决方案。

## � 项目文档

本项目包含完整的中文文档，请查阅 `docs/` 目录：

- **[架构设计 (Architecture)](docs/architecture.md)**: 系统微服务架构、技术选型与部署图。
- **[详细设计 (Detailed Design)](docs/design.md)**: 数据库 ER 图、API 接口定义与前端组件设计。
- **[开发指南 (Development Guide)](docs/development.md)**: 本地环境搭建、代码规范与目录结构说明。
- **[测试计划 (Test Plan)](docs/testing.md)**: 单元测试、集成测试策略与验收标准。
- **[用户手册 (User Manual)](docs/manual.md)**: 系统功能操作指南与常见问题解答。
- **[实施计划 (Implementation Plan)](docs/planning/implementation_plan.md)**: 项目开发阶段规划与里程碑。
- **[任务列表 (Task List)](docs/planning/task.md)**: 详细的功能开发任务追踪。

## 🚀 快速开始

### 前置要求
- Docker Desktop
- Git

### 启动步骤
1. 克隆仓库：
   ```bash
   git clone https://github.com/********/momentum.git
   cd momentum
   ```
2. 启动服务：
   ```bash
   docker compose up --build -d
   ```
3. 访问系统：
   打开浏览器访问 [http://localhost:3000](http://localhost:3000)

## ✨ 核心特性

- **数据中心**: 自动同步 AKShare 行情数据，支持增量更新与完整性校验。
- **综合选股**: 支持市值、PE/PB、技术指标（RSI, MACD）等多维组合筛选，支持保存方案。
- **形态识别**: 内置经典 K 线形态识别算法（头肩顶、双重底等），并回测历史胜率。
- **策略回测**: 向量化回测引擎，支持自定义策略参数，生成专业的回测报告（夏普比率、最大回撤）。
- **可视化**: 专业的 TradingView 风格 K 线图，支持指标叠加与板块热力图。

## 🛠 技术栈

- **前端**: React 18, TypeScript, Tailwind CSS, ECharts, Shadcn/ui
- **后端**: Python 3.11, FastAPI, SQLModel, Pandas, Numpy
- **基础设施**: Docker, PostgreSQL (TimescaleDB Ready), Redis

## ⚙️ 交互优化 (v1.1.0)
- **全局加载反馈**: 所有长耗时操作（同步、筛选、回测）均增加 Loading 状态与防抖保护。
- **智能导出**: 导出功能自动优化时间范围，防止大数据量导致的超时。
- **方案自动化**: 选股方案加载时自动填充条件、切换标签页并执行筛选。

## 📝 许可证
MIT License
