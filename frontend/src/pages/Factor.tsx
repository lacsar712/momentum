import { useEffect, useState, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import DatePicker from '../components/DatePicker'
import Select from '../components/Select'
import Loading from '../components/Loading'
import { RefreshCw, TrendingUp, BarChart3, Layers, Activity, ListOrdered } from 'lucide-react'

interface FactorStockItem {
    symbol: string
    name: string
    value: number
    rank: number
}

interface DistributionData {
    factor: string
    date: string
    count: number
    values: number[]
    mean: number | null
    std: number | null
    min: number | null
    max: number | null
    quantiles: Record<string, number>
    stocks: FactorStockItem[]
}

interface LayeredGroup {
    group: number
    label: string
    stock_count: number
    cum_returns: number[]
    dates: string[]
    stocks: { symbol: string; name: string; value: number }[]
}

interface LayeredBacktestData {
    factor: string
    date: string
    n_groups: number
    k_days: number
    count: number
    groups: LayeredGroup[]
    long_short: number[]
    long_short_dates: string[]
}

interface CorrelationData {
    date: string
    count: number
    factors: string[]
    correlation_matrix: number[][]
}

const FACTOR_OPTIONS = [
    { value: 'momentum', label: '动量因子 (Momentum)' },
    { value: 'volatility', label: '波动率因子 (Volatility)' },
    { value: 'liquidity', label: '流动性因子 (Liquidity)' },
]

const FACTOR_LABELS: Record<string, string> = {
    momentum: '动量因子',
    volatility: '波动率因子',
    liquidity: '流动性因子',
}

const GROUP_OPTIONS = [
    { value: '3', label: '3 组' },
    { value: '5', label: '5 组' },
    { value: '10', label: '10 组' },
    { value: '20', label: '20 组' },
]

const KDAY_OPTIONS = [
    { value: '5', label: '5 个交易日' },
    { value: '10', label: '10 个交易日' },
    { value: '20', label: '20 个交易日' },
    { value: '60', label: '60 个交易日' },
    { value: '120', label: '120 个交易日' },
]

const POOL_OPTIONS = [
    { value: 'all', label: '全市场' },
]

const GROUP_COLORS = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#64748b',
    '#1e293b',
]

interface EmptyStateProps {
    title: string
    description: string
    icon?: 'warn' | 'info'
}

function EmptyState({ title, description, icon = 'warn' }: EmptyStateProps) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
                icon === 'warn' ? 'bg-amber-50' : 'bg-slate-50'
            }`}>
                {icon === 'warn' ? (
                    <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                ) : (
                    <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                )}
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">{title}</h3>
            <p className="text-sm text-slate-500 max-w-xs">{description}</p>
        </div>
    )
}

export default function Factor() {
    const { pushToast } = useToast()

    const [factor, setFactor] = useState('momentum')
    const [targetDate, setTargetDate] = useState('')
    const [nGroups, setNGroups] = useState('5')
    const [kDays, setKDays] = useState('20')
    const [stockPool, setStockPool] = useState('all')

    const [availableDates, setAvailableDates] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [distributionData, setDistributionData] = useState<DistributionData | null>(null)
    const [layeredData, setLayeredData] = useState<LayeredBacktestData | null>(null)
    const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null)

    useEffect(() => {
        api.get<{ dates: string[] }>('/factors/dates', { params: { limit: 100 } })
            .then((res) => {
                setAvailableDates(res.data.dates)
                if (res.data.dates.length > 0 && !targetDate) {
                    setTargetDate(res.data.dates[0])
                }
            })
            .catch(() => pushToast('获取可用日期失败', 'error'))
    }, [])

    const fetchAllData = useCallback(() => {
        if (!targetDate) return

        setLoading(true)

        const poolSymbols: string[] | null = stockPool === 'all' ? null : null

        Promise.all([
            api.post<DistributionData>('/factors/distribution', {
                factor,
                target_date: targetDate,
                stock_pool: poolSymbols,
            }),
            api.post<LayeredBacktestData>('/factors/layered-backtest', {
                factor,
                target_date: targetDate,
                n_groups: parseInt(nGroups),
                k_days: parseInt(kDays),
                stock_pool: poolSymbols,
            }),
            api.post<CorrelationData>('/factors/correlation', {
                target_date: targetDate,
                stock_pool: poolSymbols,
            }),
        ])
            .then(([distRes, layerRes, corrRes]) => {
                setDistributionData(distRes.data)
                setLayeredData(layerRes.data)
                setCorrelationData(corrRes.data)
            })
            .catch(() => pushToast('因子分析数据加载失败', 'error'))
            .finally(() => setLoading(false))
    }, [factor, targetDate, nGroups, kDays, stockPool])

    useEffect(() => {
        if (targetDate && availableDates.length > 0) {
            fetchAllData()
        }
    }, [targetDate])

    const handleRefresh = () => {
        fetchAllData()
    }

    const getDistributionChartOption = () => {
        if (!distributionData || distributionData.count === 0) {
            return {}
        }

        const values = distributionData.values
        const min = distributionData.min || 0
        const max = distributionData.max || 1
        const binCount = Math.min(50, Math.ceil(Math.sqrt(values.length)))
        const binWidth = (max - min) / binCount

        const bins: number[] = new Array(binCount).fill(0)
        values.forEach((v) => {
            let idx = Math.floor((v - min) / binWidth)
            if (idx >= binCount) idx = binCount - 1
            if (idx < 0) idx = 0
            bins[idx]++
        })

        const barData = bins.map((count, i) => {
            const x = min + i * binWidth + binWidth / 2
            return [Number(x.toFixed(6)), count]
        })

        const quantileData = Object.entries(distributionData.quantiles).map(([q, v]) => ({
            name: `${parseFloat(q) * 100}%分位`,
            value: v,
        }))

        const q1 = distributionData.quantiles['0.25'] || 0
        const q2 = distributionData.quantiles['0.5'] || 0
        const q3 = distributionData.quantiles['0.75'] || 0

        return {
            title: {
                text: `${FACTOR_LABELS[factor]} 横截面分布`,
                subtext: `样本数: ${distributionData.count} | 均值: ${distributionData.mean?.toFixed(4)} | 标准差: ${distributionData.std?.toFixed(4)}`,
                left: 'center',
                top: 10,
                textStyle: { fontSize: 14, fontWeight: 600 },
                subtextStyle: { fontSize: 11, color: '#64748b' },
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
            },
            legend: {
                data: ['直方图', '箱线图'],
                top: 60,
            },
            grid: [
                { left: 60, right: 40, top: 100, bottom: 80, height: '55%' },
                { left: 60, right: 40, top: '75%', height: '15%' },
            ],
            xAxis: [
                {
                    type: 'value',
                    gridIndex: 0,
                    scale: true,
                    axisLabel: { formatter: (v: number) => v.toFixed(3) },
                },
                {
                    type: 'value',
                    gridIndex: 1,
                    scale: true,
                    axisLabel: { formatter: (v: number) => v.toFixed(3) },
                },
            ],
            yAxis: [
                {
                    type: 'value',
                    gridIndex: 0,
                    name: '频数',
                },
                {
                    type: 'category',
                    gridIndex: 1,
                    data: ['因子值'],
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { fontSize: 11, color: '#64748b' },
                },
            ],
            series: [
                {
                    name: '直方图',
                    type: 'bar',
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: barData,
                    barWidth: '95%',
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: '#3b82f6' },
                                { offset: 1, color: '#93c5fd' },
                            ],
                        },
                        borderRadius: [2, 2, 0, 0],
                    },
                    markLine: {
                        symbol: 'none',
                        silent: false,
                        label: {
                            formatter: '{b}',
                            position: 'insideEndTop',
                            fontSize: 10,
                            color: '#f97316',
                        },
                        lineStyle: {
                            type: 'dashed',
                            color: '#f97316',
                            width: 1.5,
                        },
                        data: quantileData.map((q) => ({
                            name: q.name,
                            xAxis: q.value,
                        })),
                    },
                },
                {
                    name: '箱线图',
                    type: 'boxplot',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: [[min, q1, q2, q3, max]],
                    boxWidth: ['60%', '60%'],
                    itemStyle: {
                        color: '#fef3c7',
                        borderColor: '#f59e0b',
                        borderWidth: 2,
                    },
                },
            ],
        }
    }

    const getLayeredChartOption = () => {
        if (!layeredData || layeredData.groups.length === 0) {
            return {}
        }

        const series: any[] = layeredData.groups.map((group, idx) => ({
            name: group.label,
            type: 'line',
            data: group.cum_returns.map((v, i) => [group.dates[i], v]),
            smooth: true,
            symbol: 'none',
            lineStyle: {
                width: 2,
                color: GROUP_COLORS[idx % GROUP_COLORS.length],
            },
        }))

        if (layeredData.long_short.length > 0) {
            series.push({
                name: '多空组合',
                type: 'line',
                data: layeredData.long_short.map((v, i) => [layeredData.long_short_dates[i], v]),
                smooth: true,
                symbol: 'none',
                lineStyle: {
                    width: 3,
                    type: 'dashed',
                    color: '#8b5cf6',
                },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(139, 92, 246, 0.2)' },
                            { offset: 1, color: 'rgba(139, 92, 246, 0.02)' },
                        ],
                    },
                },
            })
        }

        const legendData = [
            ...layeredData.groups.map((g) => g.label),
            ...(layeredData.long_short.length > 0 ? ['多空组合'] : []),
        ]

        return {
            title: {
                text: `${FACTOR_LABELS[factor]} 分层回测净值`,
                subtext: `分组数: ${layeredData.n_groups} | 持有期: ${layeredData.k_days} 天 | 样本数: ${layeredData.count}`,
                left: 'center',
                top: 10,
                textStyle: { fontSize: 14, fontWeight: 600 },
                subtextStyle: { fontSize: 11, color: '#64748b' },
            },
            tooltip: {
                trigger: 'axis',
                formatter: (params: any[]) => {
                    let result = `<div class="font-medium mb-1">${params[0]?.axisValue}</div>`
                    params.forEach((p) => {
                        const retNum = (p.data[1] - 1) * 100
                        const ret = retNum.toFixed(2)
                        result += `<div class="flex justify-between gap-4">
                            <span>${p.marker}${p.seriesName}</span>
                            <span class="font-mono font-medium">${retNum >= 0 ? '+' : ''}${ret}%</span>
                        </div>`
                    })
                    return result
                },
            },
            legend: {
                data: legendData,
                top: 60,
                type: 'scroll',
            },
            grid: {
                left: 60,
                right: 40,
                top: 100,
                bottom: 50,
            },
            xAxis: {
                type: 'category',
                data: layeredData.groups[0]?.dates || [],
                axisLabel: {
                    rotate: 45,
                    fontSize: 10,
                },
            },
            yAxis: {
                type: 'value',
                name: '净值',
                axisLabel: {
                    formatter: (v: number) => v.toFixed(2),
                },
            },
            series,
        }
    }

    const getCorrelationChartOption = () => {
        if (!correlationData || correlationData.count === 0) {
            return {}
        }

        const factors = correlationData.factors.map((f) => FACTOR_LABELS[f] || f)
        const matrix = correlationData.correlation_matrix

        const data: any[] = []
        for (let i = 0; i < matrix.length; i++) {
            for (let j = 0; j < matrix[i].length; j++) {
                data.push([j, i, matrix[i][j]])
            }
        }

        return {
            title: {
                text: '因子相关性矩阵',
                subtext: `样本数: ${correlationData.count} | 日期: ${correlationData.date}`,
                left: 'center',
                top: 10,
                textStyle: { fontSize: 14, fontWeight: 600 },
                subtextStyle: { fontSize: 11, color: '#64748b' },
            },
            tooltip: {
                formatter: (params: any) => {
                    return `${factors[params.data[1]]} × ${factors[params.data[0]]}<br/>相关系数: <b>${params.data[2].toFixed(4)}</b>`
                },
            },
            grid: {
                left: 80,
                right: 40,
                top: 80,
                bottom: 40,
            },
            xAxis: {
                type: 'category',
                data: factors,
                axisLabel: { fontSize: 11 },
            },
            yAxis: {
                type: 'category',
                data: factors,
                axisLabel: { fontSize: 11 },
            },
            visualMap: {
                min: -1,
                max: 1,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: 0,
                textStyle: { fontSize: 10 },
                inRange: {
                    color: ['#1e40af', '#3b82f6', '#e0f2fe', '#f97316', '#dc2626'],
                },
            },
            series: [
                {
                    type: 'heatmap',
                    data,
                    label: {
                        show: true,
                        fontSize: 12,
                        fontWeight: 500,
                        formatter: (params: any) => params.data[2].toFixed(3),
                    },
                    itemStyle: {
                        borderColor: '#fff',
                        borderWidth: 2,
                        borderRadius: 4,
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowColor: 'rgba(0, 0, 0, 0.3)',
                        },
                    },
                },
            ],
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">因子分析</h1>
                    <p className="text-sm text-slate-500 mt-1">横截面分布、分层回测、因子相关性</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    刷新数据
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Activity size={18} className="text-primary" />
                    <h2 className="text-base font-semibold text-slate-800">分析参数</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">因子选择</label>
                        <Select
                            value={factor}
                            options={FACTOR_OPTIONS}
                            onChange={(v) => {
                                setFactor(v)
                                setTimeout(fetchAllData, 0)
                            }}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">因子日期</label>
                        <DatePicker
                            value={targetDate}
                            onChange={(v) => setTargetDate(v)}
                            placeholder="选择日期"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">分层数</label>
                        <Select
                            value={nGroups}
                            options={GROUP_OPTIONS}
                            onChange={(v) => {
                                setNGroups(v)
                                setTimeout(fetchAllData, 0)
                            }}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">未来 K 天</label>
                        <Select
                            value={kDays}
                            options={KDAY_OPTIONS}
                            onChange={(v) => {
                                setKDays(v)
                                setTimeout(fetchAllData, 0)
                            }}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">股票池</label>
                        <Select
                            value={stockPool}
                            options={POOL_OPTIONS}
                            onChange={setStockPool}
                        />
                    </div>
                </div>
            </div>

            {loading && (
                <div className="py-20 flex items-center justify-center">
                    <Loading />
                </div>
            )}

            {!loading && distributionData && (
                <>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <BarChart3 size={18} className="text-primary" />
                            <h2 className="text-base font-semibold text-slate-800">横截面分布</h2>
                        </div>
                        <div className="h-96">
                            {distributionData.count > 0 ? (
                                <ReactECharts
                                    option={getDistributionChartOption()}
                                    style={{ height: '100%', width: '100%' }}
                                    notMerge={true}
                                />
                            ) : (
                                <EmptyState
                                    title="暂无分布数据"
                                    description="当日没有可用的因子值数据，请选择其他日期"
                                />
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Layers size={18} className="text-primary" />
                            <h2 className="text-base font-semibold text-slate-800">分层回测净值</h2>
                        </div>
                        <div className="h-96">
                            {layeredData && layeredData.groups.length > 0 ? (
                                <ReactECharts
                                    option={getLayeredChartOption()}
                                    style={{ height: '100%', width: '100%' }}
                                    notMerge={true}
                                />
                            ) : (
                                <EmptyState
                                    title="样本不足，无法分层"
                                    description={`分层回测需要至少 ${parseInt(nGroups) * 2} 只有效因子值的股票，当前仅有 ${layeredData?.count || 0} 只。请减少分层数或选择数据更完整的日期。`}
                                />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp size={18} className="text-primary" />
                                <h2 className="text-base font-semibold text-slate-800">因子相关性</h2>
                            </div>
                            <div className="h-80">
                                {correlationData && correlationData.count > 0 ? (
                                    <ReactECharts
                                        option={getCorrelationChartOption()}
                                        style={{ height: '100%', width: '100%' }}
                                        notMerge={true}
                                    />
                                ) : (
                                    <EmptyState
                                        title="暂无相关性数据"
                                        description="当日有完整三因子数据的股票不足，无法计算相关性矩阵"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <ListOrdered size={18} className="text-primary" />
                                <h2 className="text-base font-semibold text-slate-800">
                                    {FACTOR_LABELS[factor]} 排名
                                    <span className="ml-2 text-sm font-normal text-slate-500">
                                        共 {distributionData.stocks.length} 只
                                    </span>
                                </h2>
                            </div>
                            {distributionData.stocks.length > 0 ? (
                                <div className="h-80 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                                <th className="py-2.5 px-3 font-medium w-16">排名</th>
                                                <th className="py-2.5 px-3 font-medium">代码</th>
                                                <th className="py-2.5 px-3 font-medium">名称</th>
                                                <th className="py-2.5 px-3 font-medium text-right">因子值</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {distributionData.stocks.slice(0, 100).map((stock) => (
                                                <tr
                                                    key={stock.symbol}
                                                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                                                >
                                                    <td className="py-2.5 px-3">
                                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                                            stock.rank <= 10
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : stock.rank >= distributionData.stocks.length - 9
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            {stock.rank}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono text-slate-700">{stock.symbol}</td>
                                                    <td className="py-2.5 px-3 text-slate-700">{stock.name}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">
                                                        {stock.value.toFixed(4)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="h-80">
                                    <EmptyState
                                        title="暂无排名数据"
                                        description="当日没有可用的因子值数据，无法生成排名"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
