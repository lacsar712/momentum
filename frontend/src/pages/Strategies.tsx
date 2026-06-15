import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Loading from '../components/Loading'
import Modal from '../components/Modal'
import DatePicker from '../components/DatePicker'
import { useToast } from '../components/Toast'
// import { AxiosResponse } from 'axios'
import { Play } from 'lucide-react'

interface StrategyItem {
    name: string
    description: string
}

interface StockItem {
    symbol: string
    name: string
}

export default function Strategies() {
    const { pushToast } = useToast()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [items, setItems] = useState<StrategyItem[]>([])
    const [stocks, setStocks] = useState<StockItem[]>([])

    // Modal State
    const [open, setOpen] = useState(false)
    const [currentStrategy, setCurrentStrategy] = useState<string>('')
    const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
    const [dateRange, setDateRange] = useState({ start: '', end: '' })
    // Basic dynamic params support could be added here
    const [shortWindow, setShortWindow] = useState(5)
    const [longWindow, setLongWindow] = useState(20)

    useEffect(() => {
        setLoading(true)
        Promise.all([
            api.get('/strategies'),
            api.get<{ items: StockItem[] }>('/stocks', { params: { limit: 10000 } })
        ])
            .then(([resStrat, resStock]) => {
                setItems(resStrat.data)
                setStocks(resStock.data.items)
                if (resStock.data.items.length > 0) {
                    setSelectedSymbols([resStock.data.items[0].symbol])
                }
            })
            .catch(() => pushToast('资源加载失败', 'error'))
            .finally(() => setLoading(false))
    }, [])

    const openConfig = (name: string) => {
        setCurrentStrategy(name)
        setOpen(true)
    }

    const runBacktest = () => {
        if (!dateRange.start || !dateRange.end || selectedSymbols.length === 0) {
            pushToast('请完善参数配置', 'error')
            return
        }

        // Construct query params
        const params = new URLSearchParams()
        params.append('strategy', currentStrategy)
        params.append('start', dateRange.start)
        params.append('end', dateRange.end)
        params.append('symbols', selectedSymbols.join(','))
        // Passing custom params if supported by backend
        params.append('p1', shortWindow.toString())
        params.append('p2', longWindow.toString())

        navigate(`/backtest?${params.toString()}`)
    }

    const toggleSymbol = (sym: string) => {
        setSelectedSymbols(prev =>
            prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold">策略库</h2>
                <p className="text-sm text-muted-foreground">内置经典量化策略与参数模板</p>
            </div>
            <div className="glass-card rounded-2xl p-6">
                {loading ? (
                    <Loading />
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {items.map((item) => (
                            <div key={item.name} className="flex flex-col justify-between rounded-xl border border-border px-4 py-3 hover:bg-muted/50 transition duration-200">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="font-medium text-lg">{item.name}</div>
                                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">经典</span>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.description || '暂无描述'}</p>
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <span className="text-xs bg-muted px-2 py-1 rounded">参数可调</span>
                                        <span className="text-xs bg-muted px-2 py-1 rounded">支持对比</span>
                                    </div>
                                    <button
                                        className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                                        onClick={() => openConfig(item.name)}
                                    >
                                        <Play size={12} fill="currentColor" /> 配置回测
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal
                open={open}
                title={`配置策略: ${currentStrategy}`}
                onClose={() => setOpen(false)}
                footer={(
                    <div className="flex justify-end gap-3">
                        <button className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => setOpen(false)}>取消</button>
                        <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={runBacktest}>开始回测</button>
                    </div>
                )}
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-muted-foreground">回测标的 (支持多选)</label>
                        <div className="mt-2 flex flex-wrap gap-2 max-h-32 overflow-y-auto border border-border rounded-lg p-2">
                            {stocks.map(s => (
                                <button
                                    key={s.symbol}
                                    onClick={() => toggleSymbol(s.symbol)}
                                    className={`px-2 py-1 text-xs rounded border transition ${selectedSymbols.includes(s.symbol) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
                                >
                                    {s.name} <span className="opacity-60 ml-0.5 scale-90">{s.symbol}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">开始日期</label>
                            <div className="mt-1">
                                <DatePicker value={dateRange.start} onChange={(d) => setDateRange(p => ({ ...p, start: d }))} placeholder="选择开始" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">结束日期</label>
                            <div className="mt-1">
                                <DatePicker value={dateRange.end} onChange={(d) => setDateRange(p => ({ ...p, end: d }))} placeholder="选择结束" />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg bg-muted/30 p-3 border border-border">
                        <div className="text-xs font-medium mb-3">策略参数 (通用模板)</div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-muted-foreground">短周期 (Window)</label>
                                <input type="number" className="mt-1 w-full rounded border border-border px-2 py-1 text-sm bg-background" value={shortWindow} onChange={e => setShortWindow(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground">长周期 (Threshold)</label>
                                <input type="number" className="mt-1 w-full rounded border border-border px-2 py-1 text-sm bg-background" value={longWindow} onChange={e => setLongWindow(Number(e.target.value))} />
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
