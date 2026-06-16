import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import {
    ArrowLeft, Star, BarChart3, ScanLine, Copy, Check,
    TrendingUp, TrendingDown, Activity, Zap, Waves,
    DollarSign, TrendingUp as TrendingUpIcon, AlertCircle,
    Newspaper, ExternalLink, Clock,
} from 'lucide-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'

interface StockBasicInfo {
    symbol: string
    name: string
    market: string
    industry: string | null
    concept_tags: string[] | null
    market_cap: number | null
    pe_ratio: number | null
    pb_ratio: number | null
}

interface StockQuoteSnapshot {
    latest_date: string
    close: number
    volume: number
    change_pct: number | null
}

interface KLineItem {
    trade_date: string
    open: number
    high: number
    low: number
    close: number
    volume: number
}

interface FinancialSummary {
    report_date: string
    revenue: number | null
    net_profit: number | null
    roe: number | null
    debt_ratio: number | null
    revenue_yoy: number | null
    net_profit_yoy: number | null
}

interface FactorValues {
    factor_date: string
    momentum: number | null
    volatility: number | null
    liquidity: number | null
}

interface TechnicalIndicators {
    rsi: number | null
    macd_status: string | null
    kdj_status: string | null
    ma_trend: string | null
    ma5: number | null
    ma10: number | null
    ma20: number | null
    ma60: number | null
}

interface PatternRecord {
    pattern_name: string
    detected_date: string
    success_rate: number | null
    score: number | null
}

interface NewsItem {
    id: number
    source: string
    symbol: string | null
    stock_name: string | null
    sector: string | null
    title: string
    url: string
    publish_time: string
    summary: string | null
    news_type: string
    created_at: string
}

interface StockDetailResponse {
    basic_info: StockBasicInfo
    quote: StockQuoteSnapshot
    kline_60: KLineItem[]
    financial: FinancialSummary | null
    factors: FactorValues | null
    technical: TechnicalIndicators | null
    patterns_30: PatternRecord[]
}

export default function StockDetail() {
    const { symbol } = useParams<{ symbol: string }>()
    const navigate = useNavigate()
    const { pushToast } = useToast()

    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<StockDetailResponse | null>(null)
    const [activeTab, setActiveTab] = useState<'financial' | 'factors' | 'patterns' | 'news'>('financial')
    const [copied, setCopied] = useState(false)
    const [inWatchlist, setInWatchlist] = useState(false)

    const [stockNews, setStockNews] = useState<NewsItem[]>([])
    const [stockNewsLoading, setStockNewsLoading] = useState(false)

    useEffect(() => {
        if (!symbol) return
        fetchDetail()
    }, [symbol])

    const fetchDetail = () => {
        setLoading(true)
        api.get(`/stocks/${symbol}/detail`)
            .then((res) => {
                setData(res.data)
            })
            .catch(() => {
                pushToast('获取股票详情失败', 'error')
            })
            .finally(() => setLoading(false))
    }

    const fetchStockNews = () => {
        if (!symbol) return
        setStockNewsLoading(true)
        api.get(`/news/stock/${symbol}`, { params: { limit: 20 } })
            .then((res) => {
                setStockNews(res.data.items || [])
            })
            .catch(() => {})
            .finally(() => setStockNewsLoading(false))
    }

    useEffect(() => {
        if (activeTab === 'news' && symbol) {
            fetchStockNews()
        }
    }, [activeTab, symbol])

    const formatPublishTime = (iso: string): string => {
        if (!iso) return ''
        const date = new Date(iso)
        return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    const getNewsTypeColor = (type: string) => {
        switch (type) {
            case '公告': return 'bg-blue-50 text-blue-700 border-blue-200'
            case '研报': return 'bg-purple-50 text-purple-700 border-purple-200'
            default: return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }
    }

    const copySymbol = () => {
        if (!data) return
        navigator.clipboard.writeText(data.basic_info.symbol)
            .then(() => {
                setCopied(true)
                pushToast('代码已复制', 'success')
                setTimeout(() => setCopied(false), 2000)
            })
    }

    const addToWatchlist = async () => {
        if (!data) return
        try {
            const groupsRes = await api.get('/watchlist/groups')
            const groups = groupsRes.data.items || []
            if (groups.length === 0) {
                const createRes = await api.post('/watchlist/groups', { name: '默认分组' })
                groups.push(createRes.data)
            }
            const stockRes = await api.get('/stocks/query', { params: { keyword: data.basic_info.symbol, limit: 1 } })
            const stocks = stockRes.data.items || []
            if (stocks.length === 0) {
                pushToast('未找到股票信息', 'error')
                return
            }
            await api.post('/watchlist/items', {
                stock_id: stocks[0].id,
                group_id: groups[0].id,
            })
            setInWatchlist(true)
            pushToast(`已添加 ${data.basic_info.name} 到自选股`, 'success')
        } catch {
            pushToast('添加失败，请检查登录状态', 'error')
        }
    }

    const addToBacktest = () => {
        if (!data) return
        navigate(`/backtest?symbols=${data.basic_info.symbol}`)
        pushToast('已添加到回测池', 'success')
    }

    const goToPatterns = () => {
        if (!data) return
        navigate(`/patterns?symbol=${data.basic_info.symbol}`)
    }

    const klineOption = useMemo(() => {
        if (!data || data.kline_60.length === 0) return {}
        const dates = data.kline_60.map(k => k.trade_date)
        const ohlc = data.kline_60.map(k => [k.open, k.close, k.low, k.high])
        const volumes = data.kline_60.map(k => k.volume)

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                formatter: (params: any) => {
                    const candle = params[0]
                    const vol = params[1]
                    if (!candle) return ''
                    return `
                        <div class="font-medium">${candle.axisValue}</div>
                        开盘: ${candle.data[0]}<br/>
                        收盘: ${candle.data[1]}<br/>
                        最低: ${candle.data[2]}<br/>
                        最高: ${candle.data[3]}<br/>
                        成交量: ${vol ? (vol.data / 10000).toFixed(0) + '万手' : '-'}
                    `
                }
            },
            grid: [
                { left: '10%', right: '5%', top: '5%', height: '60%' },
                { left: '10%', right: '5%', top: '72%', height: '20%' },
            ],
            xAxis: [
                {
                    type: 'category',
                    data: dates,
                    axisLine: { onZero: false },
                    axisLabel: { show: false },
                },
                {
                    type: 'category',
                    gridIndex: 1,
                    data: dates,
                    axisLine: { onZero: false },
                    axisLabel: { rotate: 45, fontSize: 10 },
                },
            ],
            yAxis: [
                {
                    scale: true,
                    splitLine: { lineStyle: { type: 'dashed' } },
                },
                {
                    scale: true,
                    gridIndex: 1,
                    splitNumber: 2,
                    axisLabel: { show: false },
                },
            ],
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: [0, 1],
                    start: 0,
                    end: 100,
                },
            ],
            series: [
                {
                    name: 'K线',
                    type: 'candlestick',
                    data: ohlc,
                    itemStyle: {
                        color: '#ef4444',
                        color0: '#10b981',
                        borderColor: '#ef4444',
                        borderColor0: '#10b981',
                    },
                },
                {
                    name: '成交量',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: volumes,
                    itemStyle: {
                        color: (params: any) => {
                            const idx = params.dataIndex
                            if (idx === 0) return '#94a3b8'
                            return ohlc[idx][1] >= ohlc[idx][0] ? '#ef4444' : '#10b981'
                        }
                    }
                },
            ],
        }
    }, [data])

    const formatNumber = (value: number | null, decimals: number = 2, suffix: string = '') => {
        if (value === null || value === undefined) return '-'
        return value.toFixed(decimals) + suffix
    }

    const formatMoney = (value: number | null) => {
        if (value === null || value === undefined) return '-'
        if (value >= 100000000) {
            return (value / 100000000).toFixed(2) + ' 亿'
        } else if (value >= 10000) {
            return (value / 10000).toFixed(2) + ' 万'
        }
        return value.toFixed(2)
    }

    const getStatusColor = (status: string | null) => {
        if (!status) return 'text-slate-400'
        if (status.includes('多') || status.includes('金') || status.includes('底')) return 'text-emerald-600'
        if (status.includes('空') || status.includes('死') || status.includes('顶')) return 'text-red-500'
        if (status.includes('超买')) return 'text-orange-500'
        if (status.includes('超卖')) return 'text-blue-500'
        return 'text-slate-600'
    }

    const getStatusBg = (status: string | null) => {
        if (!status) return 'bg-slate-100'
        if (status.includes('多') || status.includes('金') || status.includes('底')) return 'bg-emerald-50'
        if (status.includes('空') || status.includes('死') || status.includes('顶')) return 'bg-red-50'
        if (status.includes('超买')) return 'bg-orange-50'
        if (status.includes('超卖')) return 'bg-blue-50'
        return 'bg-slate-100'
    }

    if (loading) return <Loading />
    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle size={48} className="text-slate-300 mb-4" />
                <p className="text-slate-500">未找到股票信息</p>
                <button
                    onClick={() => navigate(-1)}
                    className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition"
                >
                    返回
                </button>
            </div>
        )
    }

    const { basic_info, quote, technical, financial, factors, patterns_30 } = data

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                    <ArrowLeft size={18} className="text-slate-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        {basic_info.name}
                        <span className="text-sm font-normal text-slate-400 ml-2">{basic_info.symbol}</span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {basic_info.market}市场
                        {basic_info.industry && <span className="mx-2">·</span>}
                        {basic_info.industry}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <div className="flex items-baseline gap-3">
                                    <span className="text-4xl font-bold tabular-nums">
                                        {quote.close.toFixed(2)}
                                    </span>
                                    {quote.change_pct !== null && (
                                        <span className={`text-lg font-semibold flex items-center gap-1 ${quote.change_pct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {quote.change_pct >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                            {quote.change_pct >= 0 ? '+' : ''}{quote.change_pct.toFixed(2)}%
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-slate-400 mt-1">
                                    最新日期: {quote.latest_date}
                                    <span className="mx-2">·</span>
                                    成交量: {(quote.volume / 10000).toFixed(0)}万手
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={addToWatchlist}
                                    disabled={inWatchlist}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                                        inWatchlist
                                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                            : 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm shadow-amber-200'
                                    }`}
                                >
                                    <Star size={16} fill={inWatchlist ? 'currentColor' : 'none'} />
                                    {inWatchlist ? '已关注' : '加入自选'}
                                </button>
                                <button
                                    onClick={addToBacktest}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
                                >
                                    <BarChart3 size={16} />
                                    加入回测
                                </button>
                                <button
                                    onClick={goToPatterns}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm shadow-purple-200"
                                >
                                    <ScanLine size={16} />
                                    形态识别
                                </button>
                                <button
                                    onClick={copySymbol}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                    {copied ? '已复制' : '复制代码'}
                                </button>
                            </div>
                        </div>

                        {basic_info.concept_tags && basic_info.concept_tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-6">
                                {basic_info.concept_tags.map((tag, idx) => (
                                    <span
                                        key={idx}
                                        className="px-2.5 py-1 text-xs rounded-full bg-primary/5 text-primary border border-primary/10"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-4">
                            <div className="rounded-xl bg-slate-50 p-4">
                                <div className="text-xs text-slate-400">总市值</div>
                                <div className="text-lg font-semibold mt-1">{formatMoney(basic_info.market_cap)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4">
                                <div className="text-xs text-slate-400">市盈率 (PE)</div>
                                <div className="text-lg font-semibold mt-1">{formatNumber(basic_info.pe_ratio)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4">
                                <div className="text-xs text-slate-400">市净率 (PB)</div>
                                <div className="text-lg font-semibold mt-1">{formatNumber(basic_info.pb_ratio)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold mb-4">近60日K线走势</h3>
                        <ReactECharts option={klineOption} style={{ height: 400 }} />
                    </div>

                    {technical && (
                        <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Activity size={20} className="text-primary" />
                                技术指标
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="rounded-xl border border-slate-100 p-4">
                                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                        <Activity size={14} />
                                        RSI
                                    </div>
                                    <div className="text-2xl font-bold">
                                        {formatNumber(technical.rsi, 1)}
                                    </div>
                                    <div className={`text-xs mt-1 ${
                                        technical.rsi && technical.rsi > 70 ? 'text-orange-500' :
                                        technical.rsi && technical.rsi < 30 ? 'text-blue-500' : 'text-slate-400'
                                    }`}>
                                        {technical.rsi && technical.rsi > 70 ? '超买区' :
                                         technical.rsi && technical.rsi < 30 ? '超卖区' : '中性区'}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-100 p-4">
                                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                        <Waves size={14} />
                                        MACD
                                    </div>
                                    <div className={`text-sm font-semibold px-2 py-1 rounded-lg inline-block ${getStatusBg(technical.macd_status)} ${getStatusColor(technical.macd_status)}`}>
                                        {technical.macd_status || '-'}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-100 p-4">
                                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                        <Zap size={14} />
                                        KDJ
                                    </div>
                                    <div className={`text-sm font-semibold px-2 py-1 rounded-lg inline-block ${getStatusBg(technical.kdj_status)} ${getStatusColor(technical.kdj_status)}`}>
                                        {technical.kdj_status || '-'}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-100 p-4">
                                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                        <TrendingUpIcon size={14} />
                                        均线排列
                                    </div>
                                    <div className={`text-sm font-semibold px-2 py-1 rounded-lg inline-block ${getStatusBg(technical.ma_trend)} ${getStatusColor(technical.ma_trend)}`}>
                                        {technical.ma_trend || '-'}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-4 gap-4 text-sm">
                                <div>
                                    <div className="text-xs text-slate-400">MA5</div>
                                    <div className="font-semibold mt-1">{formatNumber(technical.ma5, 2)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400">MA10</div>
                                    <div className="font-semibold mt-1">{formatNumber(technical.ma10, 2)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400">MA20</div>
                                    <div className="font-semibold mt-1">{formatNumber(technical.ma20, 2)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400">MA60</div>
                                    <div className="font-semibold mt-1">{formatNumber(technical.ma60, 2)}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
                        <div className="flex border-b border-slate-100">
                            <button
                                onClick={() => setActiveTab('financial')}
                                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'financial'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <DollarSign size={14} className="inline mr-1" />
                                财务摘要
                            </button>
                            <button
                                onClick={() => setActiveTab('factors')}
                                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'factors'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <Zap size={14} className="inline mr-1" />
                                因子指标
                            </button>
                            <button
                                onClick={() => setActiveTab('patterns')}
                                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'patterns'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <ScanLine size={14} className="inline mr-1" />
                                形态触发
                                {patterns_30.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                                        {patterns_30.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('news')}
                                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'news'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <Newspaper size={14} className="inline mr-1" />
                                资讯
                                {stockNews.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                                        {stockNews.length}
                                    </span>
                                )}
                            </button>
                        </div>

                        <div className="p-5">
                            {activeTab === 'financial' && financial && (
                                <div className="space-y-4">
                                    <div className="text-xs text-slate-400">
                                        报告日期: {financial.report_date}
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-500">营业收入</span>
                                            <div className="text-right">
                                                <div className="font-semibold">{formatMoney(financial.revenue)}</div>
                                                {financial.revenue_yoy !== null && (
                                                    <div className={`text-xs ${financial.revenue_yoy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        同比 {financial.revenue_yoy >= 0 ? '+' : ''}{(financial.revenue_yoy * 100).toFixed(2)}%
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-500">净利润</span>
                                            <div className="text-right">
                                                <div className="font-semibold">{formatMoney(financial.net_profit)}</div>
                                                {financial.net_profit_yoy !== null && (
                                                    <div className={`text-xs ${financial.net_profit_yoy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        同比 {financial.net_profit_yoy >= 0 ? '+' : ''}{(financial.net_profit_yoy * 100).toFixed(2)}%
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-500">ROE (净资产收益率)</span>
                                            <span className="font-semibold">
                                                {financial.roe !== null ? (financial.roe * 100).toFixed(2) + '%' : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-500">资产负债率</span>
                                            <span className="font-semibold">
                                                {financial.debt_ratio !== null ? (financial.debt_ratio * 100).toFixed(2) + '%' : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'financial' && !financial && (
                                <div className="text-center py-8 text-slate-400">
                                    <DollarSign size={32} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">暂无财务数据</p>
                                </div>
                            )}

                            {activeTab === 'factors' && factors && (
                                <div className="space-y-4">
                                    <div className="text-xs text-slate-400">
                                        因子日期: {factors.factor_date}
                                    </div>
                                    <div className="space-y-4">
                                        <div className="rounded-xl bg-blue-50 p-4 border border-blue-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-blue-800">动量因子</span>
                                                <Zap size={14} className="text-blue-500" />
                                            </div>
                                            <div className={`text-2xl font-bold ${
                                                factors.momentum && factors.momentum > 0 ? 'text-red-500' : factors.momentum && factors.momentum < 0 ? 'text-emerald-500' : 'text-slate-700'
                                            }`}>
                                                {factors.momentum !== null ? (factors.momentum * 100).toFixed(2) + '%' : '-'}
                                            </div>
                                            <p className="text-xs text-blue-600/80 mt-1">
                                                {factors.momentum && factors.momentum > 0.1 ? '强势上涨趋势' :
                                                 factors.momentum && factors.momentum < -0.1 ? '弱势下跌趋势' : '震荡整理'}
                                            </p>
                                        </div>

                                        <div className="rounded-xl bg-orange-50 p-4 border border-orange-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-orange-800">波动率因子</span>
                                                <Activity size={14} className="text-orange-500" />
                                            </div>
                                            <div className="text-2xl font-bold text-orange-700">
                                                {factors.volatility !== null ? (factors.volatility * 100).toFixed(2) + '%' : '-'}
                                            </div>
                                            <p className="text-xs text-orange-600/80 mt-1">
                                                {factors.volatility && factors.volatility > 0.03 ? '高波动 高风险' :
                                                 factors.volatility && factors.volatility < 0.015 ? '低波动 走势稳' : '中等波动'}
                                            </p>
                                        </div>

                                        <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-emerald-800">流动性因子</span>
                                                <Waves size={14} className="text-emerald-500" />
                                            </div>
                                            <div className="text-2xl font-bold text-emerald-700">
                                                {factors.liquidity !== null ? (factors.liquidity / 10000).toFixed(0) + ' 万手' : '-'}
                                            </div>
                                            <p className="text-xs text-emerald-600/80 mt-1">
                                                {factors.liquidity && factors.liquidity > 5000000 ? '高流动性 易进出' :
                                                 factors.liquidity && factors.liquidity < 500000 ? '低流动性 需注意' : '中等流动性'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'factors' && !factors && (
                                <div className="text-center py-8 text-slate-400">
                                    <Zap size={32} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">暂无因子数据</p>
                                </div>
                            )}

                            {activeTab === 'patterns' && patterns_30.length > 0 && (
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {patterns_30.map((p, idx) => (
                                        <div key={idx} className="rounded-xl border border-slate-100 p-3 hover:border-primary/30 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium text-primary">{p.pattern_name}</span>
                                                {p.success_rate !== null && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                                        胜率 {Math.round(p.success_rate * 100)}%
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-slate-500">
                                                <span>{p.detected_date} 触发</span>
                                                {p.score !== null && (
                                                    <span>得分 {p.score.toFixed(2)}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === 'patterns' && patterns_30.length === 0 && (
                                <div className="text-center py-8 text-slate-400">
                                    <ScanLine size={32} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">近30天无形态触发</p>
                                </div>
                            )}

                            {activeTab === 'news' && (
                                <div>
                                    {stockNewsLoading ? (
                                        <div className="py-8">
                                            <Loading />
                                        </div>
                                    ) : stockNews.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400">
                                            <Newspaper size={32} className="mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">暂无相关资讯</p>
                                            <p className="text-xs text-slate-300 mt-1">请先在资讯中心同步数据</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                                            {stockNews.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="rounded-xl border border-slate-100 p-3 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
                                                    onClick={() => {
                                                        if (item.url) {
                                                            window.open(item.url, '_blank')
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <h4 className="text-sm font-semibold text-slate-800 line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                                                            {item.title}
                                                        </h4>
                                                        {item.url && (
                                                            <ExternalLink size={12} className="text-slate-300 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getNewsTypeColor(item.news_type)}`}>
                                                            {item.news_type}
                                                        </span>
                                                        <span className="text-xs text-slate-400">
                                                            {item.source}
                                                        </span>
                                                    </div>

                                                    {item.summary && (
                                                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                                            {item.summary}
                                                        </p>
                                                    )}

                                                    <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                                                        <Clock size={10} />
                                                        {formatPublishTime(item.publish_time)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {stockNews.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-slate-100">
                                            <button
                                                onClick={() => navigate('/news')}
                                                className="w-full text-xs text-primary hover:text-primary/80 font-medium flex items-center justify-center gap-1 transition-colors"
                                            >
                                                查看全部资讯
                                                <Newspaper size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
