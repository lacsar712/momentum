"""
多数据源集成模块
支持从多个权威金融数据源获取A股市场数据
包含防反爬机制，确保数据源获取数据稳定

数据源列表:
1. AkShare (东方财富) - 主数据源
2. EastMoney 直接API - 备用数据源
3. Sina 新浪财经 - 备用数据源
4. Tencent 腾讯财经 - 备用数据源
"""

import random
import time
from datetime import date
from typing import List, Dict, Any, Optional, Callable
import requests
import pandas as pd
import akshare as ak
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import warnings
warnings.filterwarnings('ignore')

# ==================== 防反爬配置 ====================

# 多User-Agent轮换池
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Safari/605.1",
]

# 请求头模板
HEADERS_TEMPLATE = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "DNT": "1",
}

# ==================== 请求工具函数 ====================

def get_random_headers() -> Dict[str, str]:
    """获取随机请求头"""
    headers = HEADERS_TEMPLATE.copy()
    headers["User-Agent"] = random.choice(USER_AGENTS)
    return headers

def random_delay(min_sec: float = 0.5, max_sec: float = 2.0):
    """随机延迟，模拟人类行为"""
    time.sleep(random.uniform(min_sec, max_sec))

def exponential_backoff_delay(attempt: int, base: float = 1.0, max_delay: float = 30.0):
    """指数退避延迟"""
    delay = min(base * (2 ** attempt) + random.uniform(0, 1), max_delay)
    time.sleep(delay)

def get_session() -> requests.Session:
    """创建带重试机制的请求会话"""
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS", "POST"]
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=20)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update(get_random_headers())
    return session

def safe_request(url: str, params: Dict[str, Any] | None = None, max_retries: int = 3) -> Dict[str, Any]:
    """
    安全的HTTP请求，带重试和防反爬机制
    """
    session = get_session()
    last_error = None
    
    for attempt in range(max_retries):
        try:
            random_delay(0.3, 1.0)
            session.headers.update(get_random_headers())
            
            response = session.get(url, params=params, timeout=30, verify=False)
            response.raise_for_status()
            
            data = response.json()
            print(f"[数据源] 请求成功: {url[:50]}...")
            return data
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                print(f"[数据源] 触发限流，等待后重试 (尝试 {attempt + 1}/{max_retries})")
                exponential_backoff_delay(attempt, base=5.0)
            else:
                last_error = e
                print(f"[数据源] HTTP错误 {e.response.status_code}: {e}")
                
        except requests.exceptions.ConnectionError as e:
            last_error = e
            print(f"[数据源] 连接错误 (尝试 {attempt + 1}/{max_retries}): {e}")
            exponential_backoff_delay(attempt)
            
        except Exception as e:
            last_error = e
            print(f"[数据源] 请求失败 (尝试 {attempt + 1}/{max_retries}): {e}")
            exponential_backoff_delay(attempt)
    
    raise RuntimeError(f"数据源请求失败: {last_error}")

# ==================== AkShare 数据源 ====================

def fetch_stock_list_akshare() -> pd.DataFrame:
    """
    AkShare 数据源 - 获取A股股票列表
    包含市值、市盈率、市净率等指标
    """
    last_error = None
    for attempt in range(3):
        try:
            random_delay(0.5, 1.5)
            df = ak.stock_zh_a_spot_em()
            df = df.rename(columns={
                "代码": "symbol", 
                "名称": "name", 
                "总市值": "market_cap", 
                "市盈率-动态": "pe_ratio", 
                "市净率": "pb_ratio"
            })
            df["market"] = df["symbol"].apply(lambda x: "SH" if str(x).startswith("6") else "SZ")
            print(f"[AkShare] 成功获取 {len(df)} 只股票数据")
            return df[["symbol", "name", "market", "market_cap", "pe_ratio", "pb_ratio"]]
        except Exception as e:
            last_error = e
            print(f"[AkShare] 股票列表获取失败 (尝试 {attempt + 1}/3): {e}")
            exponential_backoff_delay(attempt)
    
    raise last_error if last_error else RuntimeError("AkShare 股票列表获取失败")

def fetch_daily_akshare(symbol: str, start: date, end: date) -> pd.DataFrame:
    """AkShare 数据源 - 获取日线数据"""
    random_delay(0.3, 0.8)
    try:
        df = ak.stock_zh_a_hist(
            symbol=symbol, 
            period="daily", 
            start_date=start.strftime("%Y%m%d"), 
            end_date=end.strftime("%Y%m%d"), 
            adjust="qfq"
        )
        df = df.rename(columns={
            "日期": "trade_date", 
            "开盘": "open", 
            "最高": "high", 
            "最低": "low", 
            "收盘": "close", 
            "成交量": "volume", 
            "成交额": "amount"
        })
        df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date
        return df[["trade_date", "open", "high", "low", "close", "volume", "amount"]]
    except Exception as e:
        print(f"[AkShare] 日线数据获取失败 {symbol}: {e}")
        raise e

# ==================== EastMoney 东方财富数据源 ====================

def fetch_stock_list_eastmoney() -> pd.DataFrame:
    """
    东方财富 直接API - 获取A股股票列表
    备用数据源，当AkShare失败时使用
    """
    url = "https://push2.eastmoney.com/api/qt/clist/get"
    
    # 分别获取沪深主板
    all_dfs = []
    markets = [
        ("上海", "1.000001", "m:1+t:2,m:1+t:23"),  # 沪市
        ("深圳", "0.399001", "m:0+t:6,m:0+t:80"),  # 深市
    ]
    
    for market_name, fs_ref, fs_value in markets:
        try:
            params = {
                "pn": 1,
                "pz": 5000,
                "po": 1,
                "np": 1,
                "ut": "bd1d9ddb04089700cf9c27f6f7426281",
                "fltt": 2,
                "invt": 2,
                "fid": "f3",
                "fs": fs_value,
                "fields": "f12,f14,f2,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20,f21,f9,f23"
            }
            
            data = safe_request(url, params)
            
            if data and "data" in data and data["data"] and "diff" in data["data"]:
                items = data["data"]["diff"]
                df = pd.DataFrame(items)
                df = df.rename(columns={
                    "f12": "symbol",
                    "f14": "name",
                    "f20": "market_cap",
                    "f9": "pe_ratio",
                    "f23": "pb_ratio"
                })
                df["market"] = "SH" if "上海" in market_name else "SZ"
                all_dfs.append(df[["symbol", "name", "market", "market_cap", "pe_ratio", "pb_ratio"]])
                print(f"[EastMoney] {market_name}市场获取 {len(df)} 只股票")
                
        except Exception as e:
            print(f"[EastMoney] {market_name}市场获取失败: {e}")
            continue
    
    if all_dfs:
        result = pd.concat(all_dfs, ignore_index=True)
        print(f"[EastMoney] 共获取 {len(result)} 只股票数据")
        return result
    
    # 如果直接API失败，尝试AkShare的备用接口
    try:
        df = ak.stock_info_a_code_name()
        df = df.rename(columns={"code": "symbol", "name": "name"})
        df["market"] = df["symbol"].apply(lambda x: "SH" if str(x).startswith("6") else "SZ")
        print(f"[EastMoney-Fallback] 获取 {len(df)} 只股票基础数据")
        return df[["symbol", "name", "market"]]
    except Exception as e:
        print(f"[EastMoney] 所有方式均失败: {e}")
        return pd.DataFrame()

def fetch_daily_eastmoney(symbol: str, start: date, end: date) -> pd.DataFrame:
    """
    东方财富 直接API - 获取日线数据
    """
    market_code = "1" if symbol.startswith("6") else "0"
    secid = f"{market_code}.{symbol}"
    
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "secid": secid,
        "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        "klt": 101,  # 日线
        "fqt": 1,    # 前复权
        "beg": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "lmt": 1000000
    }
    
    try:
        data = safe_request(url, params)
        if data and "data" in data and data["data"] and "klines" in data["data"]:
            klines = data["data"]["klines"]
            rows = []
            for kline in klines:
                parts = kline.split(",")
                rows.append({
                    "trade_date": pd.to_datetime(parts[0]).date(),
                    "open": float(parts[1]),
                    "close": float(parts[2]),
                    "high": float(parts[3]),
                    "low": float(parts[4]),
                    "volume": float(parts[5]),
                    "amount": float(parts[6]),
                })
            df = pd.DataFrame(rows)
            print(f"[EastMoney] 成功获取 {symbol} 日线数据 {len(df)} 条")
            return df
    except Exception as e:
        print(f"[EastMoney] 日线数据获取失败 {symbol}: {e}")
    
    return pd.DataFrame()

# ==================== Sina 新浪财经数据源 ====================

def fetch_stock_list_sina() -> pd.DataFrame:
    """
    新浪财经 - 获取A股股票列表
    """
    url = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
    
    all_dfs = []
    pages_to_fetch = 5  # 每页80条，5页=400只
    
    for node in ["sh_a", "sz_a"]:
        for page in range(1, pages_to_fetch + 1):
            try:
                params = {
                    "page": page,
                    "num": 80,
                    "sort": "symbol",
                    "asc": 1,
                    "node": node,
                }
                data = safe_request(url, params)
                if data:
                    df = pd.DataFrame(data)
                    df = df.rename(columns={
                        "symbol": "raw_symbol",
                        "name": "name",
                        "mktcap": "market_cap",
                        "pe": "pe_ratio",
                        "pb": "pb_ratio"
                    })
                    df["symbol"] = df["raw_symbol"].apply(lambda x: x[2:] if len(x) > 2 else x)
                    df["market"] = "SH" if "sh" in node else "SZ"
                    all_dfs.append(df[["symbol", "name", "market"]])
            except Exception as e:
                print(f"[Sina] 获取 {node} 第 {page} 页失败: {e}")
                break
    
    if all_dfs:
        result = pd.concat(all_dfs, ignore_index=True).drop_duplicates(subset=["symbol"])
        print(f"[Sina] 共获取 {len(result)} 只股票数据")
        return result
    
    return pd.DataFrame()

def fetch_daily_sina(symbol: str, start: date, end: date) -> pd.DataFrame:
    """
    新浪财经 - 获取日线数据
    """
    prefix = "sh" if str(symbol).startswith("6") else "sz"
    url = "https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData"
    params = {
        "symbol": f"{prefix}{symbol}", 
        "scale": 240, 
        "datalen": 500
    }
    
    try:
        data = safe_request(url, params)
        df = pd.DataFrame(data)
        df["trade_date"] = pd.to_datetime(df["day"]).dt.date
        df = df.rename(columns={
            "open": "open", 
            "high": "high", 
            "low": "low", 
            "close": "close", 
            "volume": "volume"
        })
        df = df[(df["trade_date"] >= start) & (df["trade_date"] <= end)]
        return df[["trade_date", "open", "high", "low", "close", "volume"]]
    except Exception as e:
        print(f"[Sina] 日线数据获取失败 {symbol}: {e}")
        return pd.DataFrame()

# ==================== Tencent 腾讯财经数据源 ====================

def fetch_stock_list_tencent() -> pd.DataFrame:
    """
    腾讯财经 - 获取A股股票列表及实时行情数据
    使用 qt.gtimg.cn API，已确认可用
    返回包含市值、市盈率、市净率的完整数据
    """
    session = get_session()
    all_data = []
    
    # 先获取所有股票代码 - 从EastMoney备用接口获取代码列表
    try:
        # 使用AkShare获取股票代码列表
        stock_codes = []
        try:
            df_codes = ak.stock_info_a_code_name()
            stock_codes = df_codes["code"].tolist()
            print(f"[Tencent] 获取到 {len(stock_codes)} 个股票代码")
        except Exception as e:
            print(f"[Tencent] 获取股票代码列表失败: {e}")
            # 备用：使用常见股票代码
            stock_codes = [
                # 沪市主要股票
                "600519", "600036", "601318", "600000", "600276", "600030", "600887",
                "600900", "600104", "600050", "600028", "601166", "600016", "601398",
                "601288", "601857", "600019", "600585", "601088", "600309", "601601",
                "600309", "600703", "601012", "600196", "600031", "600048", "600029",
                # 深市主要股票
                "000858", "000001", "000002", "002415", "000651", "000333", "002304",
                "000568", "000725", "002594", "000063", "002142", "000538", "002024",
                "000776", "002027", "000876", "002032", "002475", "002230", "002352",
            ]
            print(f"[Tencent] 使用备用股票代码列表: {len(stock_codes)} 只")
            
        # 分批获取数据 (每批50只，避免请求过长)
        batch_size = 50
        total_batches = (len(stock_codes) + batch_size - 1) // batch_size
        
        for batch_idx in range(min(total_batches, 100)):  # 最多处理5000只股票
            batch_codes = stock_codes[batch_idx * batch_size : (batch_idx + 1) * batch_size]
            
            # 构建腾讯API请求代码格式 (sh600519, sz000858)
            tencent_codes = []
            for code in batch_codes:
                prefix = "sh" if str(code).startswith("6") else "sz"
                tencent_codes.append(f"{prefix}{code}")
            
            url = f"https://qt.gtimg.cn/q={','.join(tencent_codes)}"
            
            try:
                random_delay(0.2, 0.5)  # 防反爬延迟
                resp = session.get(url, timeout=15, verify=False)
                
                if resp.status_code == 200:
                    content = resp.text
                    lines = content.strip().split(";")
                    
                    for line in lines:
                        if "=" not in line or '""' in line:
                            continue
                        try:
                            # 解析格式: v_sh600519="1~贵州茅台~600519~..."
                            parts = line.split("=")[1].strip('"').split("~")
                            if len(parts) >= 50:
                                code = parts[2]
                                name = parts[1]
                                price = float(parts[3]) if parts[3] else 0
                                
                                # 市值 (parts[45] 是总市值，单位亿)
                                market_cap_yi = float(parts[45]) if parts[45] and parts[45] != "" else 0
                                market_cap = market_cap_yi * 100000000  # 转为元
                                
                                # 市盈率 (parts[41])
                                pe_ratio = float(parts[41]) if parts[41] and parts[41] != "" else None
                                
                                # 市净率 (parts[46])
                                pb_ratio = float(parts[46]) if parts[46] and parts[46] != "" else None
                                
                                # 行业信息 (parts[51] 如果有)
                                industry = parts[51] if len(parts) > 51 and parts[51] else None
                                
                                market = "SH" if str(code).startswith("6") else "SZ"
                                
                                all_data.append({
                                    "symbol": code,
                                    "name": name,
                                    "market": market,
                                    "market_cap": market_cap if market_cap > 0 else None,
                                    "pe_ratio": pe_ratio,
                                    "pb_ratio": pb_ratio,
                                    "industry": industry,
                                    "price": price,
                                })
                        except (IndexError, ValueError) as e:
                            continue
                            
            except Exception as e:
                print(f"[Tencent] 批次 {batch_idx + 1}/{total_batches} 失败: {e}")
                continue
            
            if batch_idx % 10 == 0:
                print(f"[Tencent] 进度: {batch_idx + 1}/{total_batches} 批次, 已获取 {len(all_data)} 只股票")
                
    except Exception as e:
        print(f"[Tencent] 股票列表获取异常: {e}")
    
    if all_data:
        df = pd.DataFrame(all_data)
        # 过滤掉无效数据
        df = df[df["market_cap"].notna() & (df["market_cap"] > 0)]
        print(f"[Tencent] 最终获取 {len(df)} 只有效股票数据")
        return df[["symbol", "name", "market", "market_cap", "pe_ratio", "pb_ratio", "industry"]]
    
    return pd.DataFrame()

def fetch_daily_tencent(symbol: str, start: date, end: date) -> pd.DataFrame:
    """
    腾讯财经 - 获取日线数据
    """
    market_code = "sh" if symbol.startswith("6") else "sz"
    url = f"https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get"
    
    params = {
        "param": f"{market_code}{symbol},day,{start.strftime('%Y-%m-%d')},{end.strftime('%Y-%m-%d')},640,qfq",
        "_appName": "android",
        "_dev": "Pixel 4",
        "_devId": "123456789",
        "_mid": "123456789",
        "_md5mid": "123456789",
        "_appver": "8.6.0",
        "_ifChId": "303",
        "_screenW": "1080",
        "_screenH": "2280",
        "_osVer": "12"
    }
    
    try:
        data = safe_request(url, params)
        if data and "data" in data:
            stock_key = f"{market_code}{symbol}"
            if stock_key in data["data"] and "qfqday" in data["data"][stock_key]:
                klines = data["data"][stock_key]["qfqday"]
                rows = []
                for kline in klines:
                    rows.append({
                        "trade_date": pd.to_datetime(kline[0]).date(),
                        "open": float(kline[1]),
                        "close": float(kline[2]),
                        "high": float(kline[3]),
                        "low": float(kline[4]),
                        "volume": float(kline[5]),
                    })
                df = pd.DataFrame(rows)
                print(f"[Tencent] 成功获取 {symbol} 日线数据 {len(df)} 条")
                return df
    except Exception as e:
        print(f"[Tencent] 日线数据获取失败 {symbol}: {e}")
    
    return pd.DataFrame()

# ==================== 财务数据获取 ====================

def fetch_financials_akshare(symbol: str) -> pd.DataFrame:
    """AkShare - 获取财务数据"""
    try:
        random_delay(0.3, 0.8)
        df = ak.stock_financial_analysis_indicator(symbol=symbol)
        df = df.rename(columns={
            "日期": "report_date",
            "主营业务收入": "revenue",
            "净利润": "net_profit", 
            "净资产收益率(%)": "roe",
            "资产负债率(%)": "debt_ratio"
        })
        df["report_date"] = pd.to_datetime(df["report_date"]).dt.date
        cols = ["report_date", "revenue", "net_profit", "roe", "debt_ratio"]
        existing_cols = [c for c in cols if c in df.columns]
        return df[existing_cols]
    except Exception as e:
        print(f"[AkShare] 财务数据获取失败 {symbol}: {e}")
        return pd.DataFrame()

def stock_zh_a_hist_safe(symbol, start_date, end_date):
    """安全的日线数据获取（AkShare）"""
    random_delay(0.3, 0.8)
    try:
        return ak.stock_zh_a_hist(
            symbol=symbol, 
            period="daily", 
            start_date=start_date.strftime("%Y%m%d"), 
            end_date=end_date.strftime("%Y%m%d"), 
            adjust="qfq"
        )
    except Exception as e:
        raise e

# ==================== 数据源配置 ====================

def get_data_sources():
    """
    获取所有数据源配置
    返回包含多个数据源的字典，每个数据源提供:
    - stock_list: 股票列表获取函数
    - daily: 日线数据获取函数
    - financials: 财务数据获取函数
    
    优先级说明:
    1. 腾讯财经 (qt.gtimg.cn) - 最稳定，可获取实时市值/PE/PB
    2. AkShare - 功能全面，但依赖东方财富API可能不稳定
    3. 东方财富直接API - 备用
    4. 新浪财经 - 备用
    """
    return {
        "tencent": {
            "name": "腾讯财经",
            "priority": 1,  # 最高优先级，已验证可用
            "stock_list": fetch_stock_list_tencent,
            "daily": fetch_daily_tencent,
            "financials": None
        },
        "akshare": {
            "name": "AkShare (东方财富)",
            "priority": 2,
            "stock_list": fetch_stock_list_akshare,
            "daily": fetch_daily_akshare,
            "financials": fetch_financials_akshare
        },
        "eastmoney": {
            "name": "东方财富直接API",
            "priority": 3,
            "stock_list": fetch_stock_list_eastmoney, 
            "daily": fetch_daily_eastmoney, 
            "financials": None
        },
        "sina": {
            "name": "新浪财经",
            "priority": 4,
            "stock_list": fetch_stock_list_sina, 
            "daily": fetch_daily_sina,
            "financials": None
        },
    }

def fetch_with_fallback(data_type: str, *args, **kwargs) -> pd.DataFrame:
    """
    带自动故障转移的数据获取
    按优先级尝试所有数据源，直到成功
    """
    sources = get_data_sources()
    sorted_sources = sorted(sources.items(), key=lambda x: x[1].get("priority", 99))
    
    for source_name, source_config in sorted_sources:
        fetcher = source_config.get(data_type)
        if fetcher is None:
            continue
        
        try:
            result = fetcher(*args, **kwargs)
            if result is not None and not (isinstance(result, pd.DataFrame) and result.empty):
                print(f"[数据源] 使用 {source_config['name']} 获取 {data_type} 成功")
                return result
        except Exception as e:
            print(f"[数据源] {source_config['name']} 获取 {data_type} 失败: {e}")
            continue
    
    raise RuntimeError(f"所有数据源均无法获取 {data_type}")
