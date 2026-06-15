# A股可视化选股与量化交易系统 部署说明书

## 1. 概述
本文档详细说明了 A股可视化选股与量化交易系统的部署流程，涵盖 **本地开发 (Development)** 和 **生产部署 (Production)** 环境。

## 2. 部署环境要求

### 2.1 硬件要求 (Production)
-   **CPU**: 4 Core Intel/AMD
-   **Memory**: 16GB RAM (建议)
-   **Storage**: 500GB SSD (需存储 PostgreSQL 历史数据)
-   **Network**: 自购云服务器需开放 80 端口，数据库 5432 不建议对外开放。

### 2.2 软件要求
-   **Docker Engine**: v24.0+
-   **Docker Compose**: v2.20+
-   **OS**: Ubuntu 22.04 LTS

## 3. 本地开发部署 (Development Deployment)
1.  **Clone Source Code**:
    ```bash
    git clone https://github.com/jack.yan/labeleases/stage03/411/momentum.git
    cd momentum
    ```
2.  **Dev Command**:
    ```bash
    docker compose up --build
    ```
    -   前端访问: http://localhost:3000 (React HMR enabled)
    -   后端访问: http://localhost:8000/docs (FastAPI Swagger UI)
    -   DB: localhost:5432 (postgres/momentum)
    -   Redis: localhost:6379

## 4. 生产环境部署 (Production Deployment)

### 4.1 环境准备
1.  **Update System**: `sudo apt update && sudo apt upgrade -y`
2.  **Install Docker**: 参考 Docker 官方文档安装 Docker Engine。

### 4.2 部署步骤
1.  **Copy Files**: 将 `docker-compose.yml`, `nginx.conf`, `requirements.txt`, `package.json` 等配置文件上传到服务器 `/opt/momentum`.
2.  **Environment Variables**: 创建 `.env` 文件。
    ```bash
    # POSTGRES_PASSWORD=strong_password
    # REDIS_PASSWORD=strong_password
    ```
3.  **Run Containers**:
    ```bash
    docker compose -f docker-compose.yml up -d --build
    ```
4.  **Verify**: `docker ps` 查看容器状态。

## 5. 维护手册

### 5.1 查看日志
-   Frontend: `docker logs momentum-frontend`
-   Backend: `docker logs momentum-backend`
-   Database: `docker logs momentum-db`

### 5.2 数据备份 (Backup)
-   **Database**:
    ```bash
    docker exec -t momentum-db pg_dumpall -c -U postgres > dump_`date +%d-%m-%Y"_"%H_%M_%S`.sql
    ```

### 5.3 数据恢复 (Restore)
-   **Database**:
    ```bash
    cat dump.sql | docker exec -i momentum-db psql -U postgres
    ```

### 5.4 定时任务监控
-   后端日志会输出 "Scheduler started"，并定期打印 "Sync Stocks Task Success"。
-   如果任务失败，请检查网络连接及 API 数据源状态。
