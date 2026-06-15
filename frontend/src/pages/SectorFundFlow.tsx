import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { ArrowLeft, TrendingUp, TrendingDown, BarChart2, Building2 } from 'lucide-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'

interface FundFlowItem {
    industry: string
    stock_count: number
    avg_fund_flow: number
    total_fund_flow: number
    window_days: number
}

export default function SectorFundFlow() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [window, setWindow] = useState<5 | 10 | 20>(5)
    const [data, setData] = useState<FundFlowItem[]>([])

    useEffect(() => {
        setLoading(true)
        setError(null)
        api.get('/sectors/fund-flow/ranking', { params: { window } })
            .then((res) => {
                setData(res.data.items || [])
            })
            .catch((err) => {
                setError(err.response?.data?.detail || '加载失败，请稍后重试')
            })
            .finally(() => setLoading(false))
    }, [window])

    const chartOption = useMemo(() => {
        if (!data.length) return {}

        const topData = data.slice(0, 15)
        const industries = topData.map((item) => item.industry).reverse()
        const values = topData.map((item) => item.avg_fund_flow / 100000000).reverse()

        const colors = values.map((v) => (v >= 0 ? '#ef4444' : '#10b981'))

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any) => {
                    const data = params[0]
                    const value = data.value
                    return `${data.name}<br/>日均资金流: ${value >= 0 ? '+' : ''}${value.toFixed(2)} 亿`
                },
            },
            grid: {
                left: '3%',
                right: '8%',
                bottom: '3%',
                top: '3%',
                containLabel: true,
            },
            xAxis: {
                type: 'value',
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                axisLabel: {
                    color: '#64748b',
                    fontSize: 11,
                    formatter: (value: number) => `${value} 亿`,
                },
            },
            yAxis: {
                type: 'category',
                data: industries,
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false },
                axisLabel: {
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 500,
                },
            },
            series: [
                {
                    type: 'bar',
                    data: values.map((value, index) => ({
                        value,
                        itemStyle: {
                            color: colors[index],
                            borderRadius: value >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6],
                        },
                    })),
                    barWidth: '60%',
                    label: {
                        show: true,
                        position: 'right',
                        formatter: (params: any) => {
                            const value = params.value
                            return `${value >= 0 ? '+' : ''}${value.toFixed(2)}亿`
                        },
                        color: '#64748b',
                        fontSize: 11,
                    },
                },
            ],
        }
    }, [data])

    const formatAmount = (value: number) => {
        if (Math.abs(value) > 100000000) {
            return (value / 100000000).toFixed(2) + ' 亿'
        }
        if (Math.abs(value) > 10000) {
            return (value / 10000).toFixed(2) + ' 万'
        }
        return value.toFixed(2)
    }

    const topInflow = data.filter((d) => d.avg_fund_flow > 0).slice(0, 5)
    const topOutflow = [...data].reverse().filter((d) => d.avg_fund_flow < 0).slice(0, 5)

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
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">行业资金流总览</h2>
                    <p className="text-sm text-slate-500 mt-1">基于成交额变动的资金流向分析</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                    {[5, 10, 20].map((w) => (
                        <button
                            key={w}
                            onClick={() => setWindow(w as 5 | 10 | 20)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                                window === w
                                    ? 'bg-white text-primary shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            {w} 日
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="rounded-2xl bg-white border border-slate-200/60 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                            <TrendingUp size={18} className="text-red-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">资金流入 TOP 5</h3>
                            <p className="text-xs text-slate-400">{window} 日平均资金流入</p>
                        </div>
                    </div>
                    {topInflow.length ? (
                        <div className="space-y-3">
                            {topInflow.map((item, index) => (
                                <div
                                    key={item.industry}
                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/sector/${encodeURIComponent(item.industry)}`)}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                                            {index + 1}
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">{item.industry}</p>
                                            <p className="text-xs text-slate-400">{item.stock_count} 只成分股</p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-red-600">
                                        +{formatAmount(item.avg_fund_flow)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-slate-400 text-sm">暂无数据</div>
                    )}
                </div>

                <div className="rounded-2xl bg-white border border-slate-200/60 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <TrendingDown size={18} className="text-emerald-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">资金流出 TOP 5</h3>
                            <p className="text-xs text-slate-400">{window} 日平均资金流出</p>
                        </div>
                    </div>
                    {topOutflow.length ? (
                        <div className="space-y-3">
                            {topOutflow.map((item, index) => (
                                <div
                                    key={item.industry}
                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/sector/${encodeURIComponent(item.industry)}`)}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                                            {index + 1}
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">{item.industry}</p>
                                            <p className="text-xs text-slate-400">{item.stock_count} 只成分股</p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-emerald-600">
                                        {formatAmount(item.avg_fund_flow)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-slate-400 text-sm">暂无数据</div>
                    )}
                </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/60 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BarChart2 size={18} className="text-primary" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-900">全行业资金流排行</h3>
                        <p className="text-xs text-slate-400">{window} 日平均资金流向 TOP 15</p>
                    </div>
                </div>
                {loading ? (
                    <Loading />
                ) : data.length ? (
                    <ReactECharts option={chartOption} style={{ height: 500 }} />
                ) : (
                    <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                        暂无资金流数据
                    </div>
                )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-900">完整排行榜</h3>
                    <p className="text-xs text-slate-400 mt-1">共 {data.length} 个行业</p>
                </div>
                {loading ? (
                    <Loading />
                ) : data.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50/50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        排名
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        行业
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        成分股数
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        日均资金流
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        累计资金流
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.map((item, index) => (
                                    <tr
                                        key={item.industry}
                                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                        onClick={() => navigate(`/sector/${encodeURIComponent(item.industry)}`)}
                                    >
                                        <td className="px-6 py-3">
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                                item.avg_fund_flow >= 0
                                                    ? 'bg-red-50 text-red-600'
                                                    : 'bg-emerald-50 text-emerald-600'
                                            }`}>
                                                {index + 1}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <Building2 size={16} className="text-primary" />
                                                </div>
                                                <span className="text-sm font-semibold text-slate-900">{item.industry}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-right text-sm text-slate-600">
                                            {item.stock_count} 只
                                        </td>
                                        <td className={`px-6 py-3 text-right text-sm font-bold ${
                                            item.avg_fund_flow >= 0 ? 'text-red-600' : 'text-emerald-600'
                                        }`}>
                                            {item.avg_fund_flow >= 0 ? '+' : ''}{formatAmount(item.avg_fund_flow)}
                                        </td>
                                        <td className={`px-6 py-3 text-right text-sm font-medium ${
                                            item.total_fund_flow >= 0 ? 'text-red-500' : 'text-emerald-500'
                                        }`}>
                                            {item.total_fund_flow >= 0 ? '+' : ''}{formatAmount(item.total_fund_flow)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-16 text-center">
                        <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                            <BarChart2 size={32} className="text-slate-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">暂无数据</h3>
                        <p className="text-sm text-slate-500">请先同步股票日线数据</p>
                    </div>
                )}
            </div>
        </div>
    )
}
