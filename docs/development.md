# 开发指南 (Development Guide)

## 1. 环境准备 (Prerequisites)

请确保本地安装以下环境：
- **Docker & Docker Compose**: 推荐 Docker Desktop 最新版。
- **Node.js**: v18 或 v20 (LTS)。
- **Python**: v3.11+。
- **Git**: 版本控制。

## 2. 本地开发 (Local Development)

虽然推荐使用 Docker 快速启动，但在开发过程中，通常需要在本地运行服务以便调试。

### 2.1 后端启动 (Backend)
1. 进入后端目录：
   ```bash
   cd backend
   ```
2. 创建并激活虚拟环境：
   ```bash
   python -m venv venv
   source venv/bin/activate  # macOS/Linux
   # venv\Scripts\activate   # Windows
   ```
3. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```
4. 配置环境变量（可选，默认使用 sqlite 或 docker postgres）：
   创建一个 `.env` 文件，配置 `DATABASE_URL`。
5. 启动服务：
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   API 文档地址: `http://localhost:8000/docs`

### 2.2 前端启动 (Frontend)
1. 进入前端目录：
   ```bash
   cd frontend
   ```
2. 安装依赖：
   ```bash
   npm install
   ```
3. 启动开发服务器：
   ```bash
   npm run dev
   ```
   访问地址: `http://localhost:5173` (注意：需配置 Vite 代理转发 `/api` 到 `localhost:8000`)。

## 3. 代码规范 (Code Style)

- **Python**: 遵循 PEP 8 规范。建议使用 `black` 格式化代码，`isort` 排序导入。
- **TypeScript/React**: 使用 `ESLint` 和 `Prettier`。组件命名采用 PascalCase，函数和变量采用 camelCase。

## 4. 目录结构说明

```
momentum/
├── backend/
│   ├── app/
│   │   ├── models/       # 数据库模型 (SQLModel)
│   │   ├── routers/      # API 路由定义
│   │   ├── services/     # 业务逻辑 (回测、筛选、数据同步)
│   │   └── main.py       # 程序入口
│   └── tests/            # 单元测试
├── frontend/
│   ├── src/
│   │   ├── components/   # 通用 UI 组件 (Modal, Button, Chart)
│   │   ├── pages/        # 页面视图 (Dashboard, Screening)
│   │   ├── lib/          # 工具函数 & API 封装
│   │   └── App.tsx       # 路由配置
│   └── index.css         # Tailwind CSS 入口
├── docs/                 # 项目文档
└── docker-compose.yml    # 容器编排配置
```

## 5. 常见开发任务

### 添加一个新的 API
1. 在 `backend/app/schemas.py` 定义请求/响应模型。
2. 在 `backend/app/routers.py` 添加路由处理函数。
3. 在 `backend/app/services/` 实现具体业务逻辑。

### 修改前端页面
1. 在 `frontend/src/pages/` 找到对应页面组件。
2. 使用 `frontend/src/lib/api.ts` 发起请求。
3. 使用 `frontend/src/components/` 下的组件构建 UI。
