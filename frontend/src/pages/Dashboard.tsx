import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import RiskBanner from '../components/RiskBanner'
import { TrendingUp, Database, CheckCircle, Activity } from 'lucide-react'

export default function Dashboard() {
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({ stock_count: 0, backtest_count: 0, screening_count: 0, data_status: '检查中' })
    const [chartData, setChartData] = useState<{ value: number, name: string, symbol: string }[]>([])

    const chartOption = {
        tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
                const data = params.data
                return `${data.name} (${data.symbol})<br/>市值: ${data.value}亿<br/>占比: ${params.percent}%`
            }
        },
        legend: { bottom: '0%', left: 'center', icon: 'circle' },
        series: [
            {
                name: '市值',
                type: 'pie',
                radius: ['40%', '70%'],
                center: ['50%', '45%'],
                itemStyle: {
                    borderRadius: 10,
                    borderColor: '#fff',
                    borderWidth: 3
                },
                data: chartData,
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 16,
                        fontWeight: 'bold',
                        formatter: '{b}\n{d}%'
                    }
                },
                label: {
                    show: false,
                    position: 'center'
                }
            }
        ]
    }

    useEffect(() => {
        setLoading(true)
        Promise.all([
            api.get('/dashboard/stats'),
            api.get('/dashboard/market_cap')
        ]).then(([resStats, resChart]) => {
            setStats(resStats.data)
            // Normalize chart data - handle different scales
            // If value > 10^10, it's likely raw (in yuan), divide by 10^8 to get 亿
            // If value < 10^4, it's likely already in 亿
            const normalizedChart = resChart.data.map((item: any) => {
                let val = item.value || 0
                // If the value seems to be in raw yuan (very large), convert to 亿
                if (val > 1000000000) {
                    val = val / 100000000
                }
                return {
                    value: Number(val.toFixed(2)),
                    name: item.name,
                    symbol: item.symbol
                }
            }).filter((item: any) => item.value > 0)
            setChartData(normalizedChart)
        }).finally(() => setLoading(false))
    }, [])

    const statItems = [
        {
            label: '股票覆盖',
            value: stats.stock_count,
            icon: Database,
            color: 'from-blue-500 to-cyan-400',
            bgColor: 'bg-blue-50',
            iconColor: 'text-blue-500'
        },
        {
            label: '回测任务',
            value: stats.backtest_count,
            icon: TrendingUp,
            color: 'from-purple-500 to-pink-400',
            bgColor: 'bg-purple-50',
            iconColor: 'text-purple-500'
        },
        {
            label: '选股方案',
            value: stats.screening_count,
            icon: CheckCircle,
            color: 'from-emerald-500 to-teal-400',
            bgColor: 'bg-emerald-50',
            iconColor: 'text-emerald-500'
        },
        {
            label: '数据源状态',
            value: stats.data_status,
            icon: Activity,
            color: 'from-orange-500 to-amber-400',
            bgColor: 'bg-orange-50',
            iconColor: 'text-orange-500'
        },
    ]

    return (
        <div className="space-y-8 animate-fade-in-up">
            <RiskBanner />

            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">系统总览</h2>
                <p className="text-sm text-slate-500 mt-1">实时掌握A股市场与策略表现</p>
            </div>

            <div className="grid grid-cols-4 gap-5">
                {statItems.map((item) => {
                    const Icon = item.icon
                    return (
                        <div
                            key={item.label}
                            className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200/60 p-5 shadow-sm hover:shadow-lg transition-shadow duration-300"
                        >
                            <div className="relative z-10">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{item.label}</p>
                                    <div className={`${item.bgColor} rounded-xl p-2`}>
                                        <Icon size={18} className={item.iconColor} />
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <span className={`text-3xl font-bold ${item.iconColor}`}>
                                        {item.value}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/60 p-8 shadow-sm">
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-900">重点股票市值分布</h3>
                    <p className="text-xs text-slate-400 mt-1">按总市值排序</p>
                </div>
                {loading ? <Loading /> : <ReactECharts option={chartOption} style={{ height: 360 }} />}
            </div>
        </div>
    )
}
