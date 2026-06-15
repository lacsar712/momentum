FROM python:3.11-slim

WORKDIR /app

# Configure pip mirror for speed
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/

# Install system dependencies
# gcc and python3-dev are often needed for compiling pandas/numpy/c-extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
