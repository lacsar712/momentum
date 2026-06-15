import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { AxiosResponse } from 'axios'
import DatePicker from '../components/DatePicker'
import Select from '../components/Select'

interface StrategyItem {
    name: string
}

interface StockItem {
    symbol: string
    name: string
}

interface BacktestResult {
    symbol: string
    annual_return: number
    max_drawdown: number
    sharpe: number
    win_rate: number
    profit_factor: number
    equity_curve: number[]
    dates: string[]
}

export default function Backtest() {
    const { pushToast } = useToast()
    const [strategies, setStrategies] = useState<StrategyItem[]>([])
    const [stocks, setStocks] = useState<StockItem[]>([])
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({ strategy: '', symbols: '', start: '', end: '' })
    const [results, setResults] = useState<BacktestResult[]>([])

    const [searchParams] = useSearchParams()

    const [parameters, setParameters] = useState<Record<string, any>>({})

    useEffect(() => {
        // Fetch resources
        api.get<StrategyItem[]>('/strategies').then(res => setStrategies(res.data))
        api.get<{ items: StockItem[] }>('/stocks', { params: { limit: 10000 } }).then(res => setStocks(res.data.items))

        const strategyParam = searchParams.get('strategy')
        const symbolsParam = searchParams.get('symbols') || ''
        const startParam = searchParams.get('start') || ''
        const endParam = searchParams.get('end') || ''
        const p1 = searchParams.get('p1')
        const p2 = searchParams.get('p2')

        const newParams: Record<string, any> = {}
        if (p1) {
            const val = parseFloat(p1)
            newParams.short_window = val
            newParams.window = val
        }
        if (p2) {
            const val = parseFloat(p2)
            newParams.long_window = val
            newParams.threshold = val
        }
        setParameters(newParams)

        setForm(prev => ({
            ...prev,
            strategy: strategyParam || prev.strategy,
            symbols: symbolsParam || prev.symbols,
            start: startParam || prev.start,
            end: endParam || prev.end
        }))

        // Auto-run if all necessary params are present
        if (strategyParam && symbolsParam && startParam && endParam) {
            runBacktest(strategyParam, symbolsParam, startParam, endParam, newParams)
        }
    }, [searchParams])

    const runBacktest = (
        strategy = form.strategy,
        symbolsStr = form.symbols,
        start = form.start,
        end = form.end,
        params = parameters
    ) => {
        if (!strategy || !symbolsStr || !start || !end) {
            pushToast('请完善回测参数', 'error')
            return
        }
        const symbols = symbolsStr.split(',').map((s: string) => s.trim()).filter(Boolean)
        setLoading(true)
        pushToast('正在运行回测，请稍候...', 'info')
        api.post('/backtest/run', {
            strategy_name: strategy,
            symbols,
            start_date: start,
            end_date: end,
            parameters: params,
        })
            .then((res: AxiosResponse<BacktestResult[]>) => {
                setResults(res.data)
                pushToast(`回测完成，共 ${res.data.length} 个结果`, 'success')
            })
            .catch(() => pushToast('回测执行失败，请确认已登录', 'error'))
            .finally(() => setLoading(false))
    }

    const chartOption = useMemo(() => {
        const series = results.map((item: BacktestResult) => {
            const stockName = stocks.find((s) => s.symbol === item.symbol)?.name || item.symbol
            return {
                name: `${stockName} (${item.symbol})`,
                type: 'line',
                data: item.equity_curve,
                smooth: true,
                showSymbol: false,
            }
        })
        return {
            tooltip: { trigger: 'axis' },
            legend: {
                data: series.map((s) => s.name),
                bottom: 0
            },
            grid: { bottom: 80, containLabel: true },
            xAxis: {
                type: 'category',
                data: results[0]?.dates || [],
                axisLabel: { rotate: 45 }
            },
            yAxis: {
                type: 'value',
                scale: true,
                name: '策略净值'
            },
            series,
        }
    }, [results, stocks])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">回测分析</h2>
                    <p className="text-sm text-muted-foreground">自定义时间范围与策略参数回测</p>
                </div>
                <button
                    className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    onClick={() => runBacktest()}
                    disabled={loading}
                >
                    {loading && (
                        <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    )}
                    运行回测
                </button>
            </div>
            <div className="grid grid-cols-4 gap-4">
                <div className="glass-card rounded-2xl p-4">
                    <label className="text-xs text-muted-foreground">策略名称</label>
                    <div className="mt-2">
                        <Select
                            value={form.strategy}
                            onChange={(val) => setForm((prev) => ({ ...prev, strategy: val }))}
                            placeholder="请选择策略"
                            options={strategies.map((item: StrategyItem) => ({ value: item.name, label: item.name }))}
                        />
                    </div>
                </div>
                <div className="glass-card rounded-2xl p-4">
                    <label className="text-xs text-muted-foreground">股票列表</label>
                    <input className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm" placeholder="600000,000001" value={form.symbols} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, symbols: e.target.value }))} />
                    <p className="mt-1 text-xs text-muted-foreground">可选示例：贵州茅台(600519), 平安银行(000001)</p>
                </div>
                <div className="glass-card rounded-2xl p-4">
                    <label className="text-xs text-muted-foreground">开始日期</label>
                    <div className="mt-2">
                        <DatePicker value={form.start} onChange={(date) => setForm((prev) => ({ ...prev, start: date }))} placeholder="选择开始日期" />
                    </div>
                </div>
                <div className="glass-card rounded-2xl p-4">
                    <label className="text-xs text-muted-foreground">结束日期</label>
                    <div className="mt-2">
                        <DatePicker value={form.end} onChange={(date) => setForm((prev) => ({ ...prev, end: date }))} placeholder="选择结束日期" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-semibold">权益曲线</h3>
                    {loading ? <Loading /> : <ReactECharts option={chartOption} style={{ height: 320 }} />}
                </div>
                <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-semibold">关键指标</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        指标说明：
                        <br />• 夏普比率: 衡量收益风险比，&gt;1 为佳
                        <br />• 最大回撤: 历史最坏情况亏损幅度
                        <br />• 胜率: 盈利交易次数占比
                    </p>
                    <div className="mt-4 space-y-4 text-sm">
                        {results.map((item: BacktestResult) => (
                            <div key={item.symbol} className="rounded-xl border border-border px-4 py-3">
                                <div className="font-medium">{item.symbol}</div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                    <span>年化收益 {item.annual_return.toFixed(2)}</span>
                                    <span>最大回撤 {item.max_drawdown.toFixed(2)}</span>
                                    <span>夏普 {item.sharpe.toFixed(2)}</span>
                                    <span>胜率 {item.win_rate.toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
