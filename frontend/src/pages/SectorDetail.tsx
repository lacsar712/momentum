import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { ArrowLeft, TrendingUp, TrendingDown, Building2, BarChart3 } from 'lucide-react'
import Loading from '../components/Loading'
import StockNameLink from '../components/StockNameLink'
import { api } from '../lib/api'

interface IndexPoint {
    trade_date: string
    close: number
}

interface StockItem {
    symbol: string
    name: string
    close: number
    change_pct: number
    market_cap: number | null
}

interface TurnoverPoint {
    trade_date: string
    turnover_rate: number
}

interface SectorDetailData {
    industry: string
    stock_count: number
    index_curve: IndexPoint[]
    top_gainers: StockItem[]
    top_losers: StockItem[]
    turnover_series: TurnoverPoint[]
}

export default function SectorDetail() {
    const { industry } = useParams<{ industry: string }>()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [detail, setDetail] = useState<SectorDetailData | null>(null)

    const decodedIndustry = useMemo(() => industry ? decodeURIComponent(industry) : '', [industry])

    useEffect(() => {
        if (!decodedIndustry) return

        setLoading(true)
        setError(null)
        api.get(`/sectors/${encodeURIComponent(decodedIndustry)}`)
            .then((res) => {
                setDetail(res.data)
            })
            .catch((err) => {
                setError(err.response?.data?.detail || '加载失败，请稍后重试')
            })
            .finally(() => setLoading(false))
    }, [decodedIndustry])

    const indexChartOption = useMemo(() => {
        if (!detail?.index_curve?.length) return {}

        const dates = detail.index_curve.map((item) => item.trade_date)
        const values = detail.index_curve.map((item) => item.close)

        const firstVal = values[0]
        const lastVal = values[values.length - 1]
        const change = ((lastVal - firstVal) / firstVal) * 100
        const isUp = change >= 0

        return {
            tooltip: {
                trigger: 'axis',
                formatter: (params: any) => {
                    const data = params[0]
                    return `${data.axisValue}<br/>行业指数: ${data.value.toFixed(2)}`
                },
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '10%',
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { color: '#64748b', fontSize: 11 },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                axisLabel: { color: '#64748b', fontSize: 11 },
            },
            series: [
                {
                    type: 'line',
                    data: values,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: {
                        color: isUp ? '#ef4444' : '#10b981',
                        width: 2,
                    },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: isUp ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)' },
                                { offset: 1, color: isUp ? 'rgba(239,68,68,0.01)' : 'rgba(16,185,129,0.01)' },
                            ],
                        },
                    },
                },
            ],
        }
    }, [detail])

    const turnoverChartOption = useMemo(() => {
        if (!detail?.turnover_series?.length) return {}

        const dates = detail.turnover_series.map((item) => item.trade_date)
        const values = detail.turnover_series.map((item) => item.turnover_rate)

        return {
            tooltip: {
                trigger: 'axis',
                formatter: (params: any) => {
                    const data = params[0]
                    return `${data.axisValue}<br/>换手率: ${data.value.toFixed(4)}%`
                },
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '10%',
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { color: '#64748b', fontSize: 11 },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                axisLabel: {
                    color: '#64748b',
                    fontSize: 11,
                    formatter: '{value}%',
                },
            },
            series: [
                {
                    type: 'bar',
                    data: values,
                    barWidth: '60%',
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: '#3b82f6' },
                                { offset: 1, color: '#93c5fd' },
                            ],
                        },
                        borderRadius: [4, 4, 0, 0],
                    },
                },
            ],
        }
    }, [detail])

    const formatMarketCap = (value: number | null) => {
        if (!value) return '-'
        if (value > 100000000) {
            return (value / 100000000).toFixed(2) + ' 亿'
        }
        if (value > 10000) {
            return (value / 10000).toFixed(2) + ' 万'
        }
        return value.toFixed(2)
    }

    if (error) {
        return (
            <div className="space-y-8 animate-fade-in-up">
                <button
                    onClick={() => navigate('/sector')}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                >
                    <ArrowLeft size={16} />
                    返回行业列表
                </button>

                <div className="rounded-2xl bg-white border border-slate-200/60 p-12 shadow-sm">
                    <div className="flex flex-col items-center text-center">
                        <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                            <TrendingDown size={32} className="text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">加载失败</h3>
                        <p className="text-sm text-slate-500 mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            重新加载
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in-up">
            <button
                onClick={() => navigate('/sector')}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
                <ArrowLeft size={16} />
                返回行业列表
            </button>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Building2 size={28} className="text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{decodedIndustry}</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            共 {detail?.stock_count || 0} 只成分股
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => navigate('/sector/fund-flow')}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary text-sm font-medium rounded-lg hover:bg-primary/20 transition-colors"
                >
                    <BarChart3 size={16} />
                    资金流总览
                </button>
            </div>

            {loading ? (
                <Loading />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="rounded-2xl bg-white border border-slate-200/60 p-6 shadow-sm">
                            <div className="mb-4">
                                <h3 className="text-base font-bold text-slate-900">行业指数走势</h3>
                                <p className="text-xs text-slate-400 mt-1">基于等权收益率合成</p>
                            </div>
                            {detail?.index_curve?.length ? (
                                <ReactECharts option={indexChartOption} style={{ height: 320 }} />
                            ) : (
                                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                                    暂无指数数据
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl bg-white border border-slate-200/60 p-6 shadow-sm">
                            <div className="mb-4">
                                <h3 className="text-base font-bold text-slate-900">平均换手率</h3>
                                <p className="text-xs text-slate-400 mt-1">行业整体流动性变化</p>
                            </div>
                            {detail?.turnover_series?.length ? (
                                <ReactECharts option={turnoverChartOption} style={{ height: 320 }} />
                            ) : (
                                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                                    暂无换手率数据
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-red-50/50 to-transparent">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={18} className="text-red-500" />
                                    <h3 className="text-base font-bold text-slate-900">涨幅 Top 10</h3>
                                </div>
                            </div>
                            {detail?.top_gainers?.length ? (
                                <div className="divide-y divide-slate-50">
                                    {detail.top_gainers.map((stock, index) => (
                                        <div
                                            key={stock.symbol}
                                            className="px-6 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                    index < 3 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {index + 1}
                                                </span>
                                                <div>
                                                    <StockNameLink symbol={stock.symbol} name={stock.name} />
                                                    <p className="text-xs text-slate-400">{stock.symbol}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-red-600">
                                                    +{stock.change_pct.toFixed(2)}%
                                                </p>
                                                <p className="text-xs text-slate-400">{formatMarketCap(stock.market_cap)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-400 text-sm">暂无数据</div>
                            )}
                        </div>

                        <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 to-transparent">
                                <div className="flex items-center gap-2">
                                    <TrendingDown size={18} className="text-emerald-500" />
                                    <h3 className="text-base font-bold text-slate-900">跌幅 Top 10</h3>
                                </div>
                            </div>
                            {detail?.top_losers?.length ? (
                                <div className="divide-y divide-slate-50">
                                    {detail.top_losers.map((stock, index) => (
                                        <div
                                            key={stock.symbol}
                                            className="px-6 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                    index < 3 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {index + 1}
                                                </span>
                                                <div>
                                                    <StockNameLink symbol={stock.symbol} name={stock.name} />
                                                    <p className="text-xs text-slate-400">{stock.symbol}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-emerald-600">
                                                    {stock.change_pct.toFixed(2)}%
                                                </p>
                                                <p className="text-xs text-slate-400">{formatMarketCap(stock.market_cap)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-400 text-sm">暂无数据</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
