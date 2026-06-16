import { useEffect, useState, useCallback } from 'react'
import {
    TrendingUp, TrendingDown, Wallet, Landmark,
    ArrowUpDown, Search, RefreshCw, X,
    ChevronLeft, ChevronRight, RotateCcw,
} from 'lucide-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'

interface AccountSummary {
    account_id: number
    initial_capital: number
    available_cash: number
    position_market_value: number
    total_assets: number
    cumulative_pnl: number
    today_pnl: number
}

interface PositionItem {
    stock_id: number
    symbol: string
    name: string
    quantity: number
    avg_cost: number
    current_price: number
    market_value: number
    floating_pnl: number
    floating_pnl_pct: number
}

interface TradeItem {
    id: number
    symbol: string
    name: string
    direction: string
    quantity: number
    price: number
    commission: number
    status: string
    traded_at: string
}

interface StockOption {
    id: number
    symbol: string
    name: string
}

function formatMoney(v: number): string {
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '亿'
    if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(2) + '万'
    return v.toFixed(2)
}

export default function Portfolio() {
    const { pushToast } = useToast()

    const [account, setAccount] = useState<AccountSummary | null>(null)
    const [positions, setPositions] = useState<PositionItem[]>([])
    const [trades, setTrades] = useState<TradeItem[]>([])
    const [tradeTotal, setTradeTotal] = useState(0)
    const [tradePage, setTradePage] = useState(1)
    const [tradeFilterDir, setTradeFilterDir] = useState<string>('')
    const [tradeFilterSymbol, setTradeFilterSymbol] = useState<string>('')
    const [loading, setLoading] = useState(true)

    const [orderSymbol, setOrderSymbol] = useState('')
    const [orderDirection, setOrderDirection] = useState<'buy' | 'sell'>('buy')
    const [orderQuantity, setOrderQuantity] = useState('')
    const [orderPrice, setOrderPrice] = useState<number | null>(null)
    const [stockSearch, setStockSearch] = useState('')
    const [stockOptions, setStockOptions] = useState<StockOption[]>([])
    const [showStockDropdown, setShowStockDropdown] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const fetchAccount = useCallback(() => {
        api.get('/mock/account').then(res => setAccount(res.data)).catch(() => pushToast('获取账户信息失败', 'error'))
    }, [pushToast])

    const fetchPositions = useCallback(() => {
        api.get('/mock/positions').then(res => setPositions(res.data.items || [])).catch(() => pushToast('获取持仓失败', 'error'))
    }, [pushToast])

    const fetchTrades = useCallback(() => {
        const params: Record<string, string | number> = { page: tradePage, page_size: 10 }
        if (tradeFilterDir) params.direction = tradeFilterDir
        if (tradeFilterSymbol) params.symbol = tradeFilterSymbol
        api.get('/mock/trades', { params }).then(res => {
            setTrades(res.data.items || [])
            setTradeTotal(res.data.total || 0)
        }).catch(() => pushToast('获取成交记录失败', 'error'))
    }, [tradePage, tradeFilterDir, tradeFilterSymbol, pushToast])

    const fetchAll = useCallback(() => {
        setLoading(true)
        Promise.all([fetchAccount(), fetchPositions(), fetchTrades()]).finally(() => setLoading(false))
    }, [fetchAccount, fetchPositions, fetchTrades])

    useEffect(() => { fetchAll() }, [fetchAll])

    useEffect(() => {
        if (!stockSearch.trim()) { setStockOptions([]); setShowStockDropdown(false); return }
        const timer = setTimeout(() => {
            api.get('/stocks/query', { params: { keyword: stockSearch, limit: 8 } }).then(res => {
                setStockOptions(res.data.items || [])
                setShowStockDropdown(true)
            }).catch(() => setStockOptions([]))
        }, 300)
        return () => clearTimeout(timer)
    }, [stockSearch])

    useEffect(() => {
        if (!orderSymbol) { setOrderPrice(null); return }
        api.get(`/stocks/${orderSymbol}/detail`).then(res => {
            setOrderPrice(res.data.quote?.close ?? null)
        }).catch(() => setOrderPrice(null))
    }, [orderSymbol])

    const handleSubmitOrder = async () => {
        if (!orderSymbol || !orderQuantity || parseInt(orderQuantity) <= 0) {
            pushToast('请选择股票并输入有效数量', 'error')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/mock/order', {
                symbol: orderSymbol,
                direction: orderDirection,
                quantity: parseInt(orderQuantity),
            })
            pushToast(`${orderDirection === 'buy' ? '买入' : '卖出'}委托成功`, 'success')
            setOrderQuantity('')
            fetchAccount()
            fetchPositions()
            fetchTrades()
        } catch (err: any) {
            pushToast(err.response?.data?.detail || '下单失败', 'error')
        } finally {
            setSubmitting(false)
        }
    }

    const handleClosePosition = async (pos: PositionItem) => {
        if (!confirm(`确认一键平仓 ${pos.name}(${pos.symbol}) ${pos.quantity}股？`)) return
        try {
            await api.post('/mock/order', {
                symbol: pos.symbol,
                direction: 'sell',
                quantity: pos.quantity,
            })
            pushToast(`${pos.name} 已平仓`, 'success')
            fetchAccount()
            fetchPositions()
            fetchTrades()
        } catch (err: any) {
            pushToast(err.response?.data?.detail || '平仓失败', 'error')
        }
    }

    const handleReset = async () => {
        if (!confirm('确认重置账户？所有持仓和交易记录将被清空，资金恢复至100万。')) return
        try {
            await api.post('/mock/reset')
            pushToast('账户已重置', 'success')
            setOrderSymbol('')
            setOrderQuantity('')
            setOrderPrice(null)
            fetchAccount()
            fetchPositions()
            fetchTrades()
        } catch {
            pushToast('重置失败', 'error')
        }
    }

    const estimatedAmount = orderPrice && parseInt(orderQuantity || '0') > 0
        ? orderPrice * parseInt(orderQuantity)
        : 0
    const estimatedCommission = estimatedAmount * 0.00025
    const estimatedTotal = orderDirection === 'buy'
        ? estimatedAmount + estimatedCommission
        : estimatedAmount - estimatedCommission

    const totalTradePages = Math.max(1, Math.ceil(tradeTotal / 10))

    if (loading) return <Loading />

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">模拟交易</h2>
                    <p className="text-sm text-slate-500 mt-1">虚拟下单闭环，让分析结论落地操作</p>
                </div>
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all"
                >
                    <RotateCcw size={16} />
                    重置账户
                </button>
            </div>

            {/* Account Summary Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                        <Landmark size={14} />
                        总资产
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{formatMoney(account?.total_assets ?? 0)}</div>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                        <Wallet size={14} />
                        可用资金
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{formatMoney(account?.available_cash ?? 0)}</div>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                        <ArrowUpDown size={14} />
                        持仓市值
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{formatMoney(account?.position_market_value ?? 0)}</div>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                        {(account?.cumulative_pnl ?? 0) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        累计盈亏
                    </div>
                    <div className={`text-2xl font-bold ${(account?.cumulative_pnl ?? 0) >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {(account?.cumulative_pnl ?? 0) >= 0 ? '+' : ''}{formatMoney(account?.cumulative_pnl ?? 0)}
                    </div>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                        {(account?.today_pnl ?? 0) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        今日盈亏
                    </div>
                    <div className={`text-2xl font-bold ${(account?.today_pnl ?? 0) >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {(account?.today_pnl ?? 0) >= 0 ? '+' : ''}{formatMoney(account?.today_pnl ?? 0)}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Left: Positions Table */}
                <div className="col-span-2 rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="text-sm font-semibold text-slate-700">当前持仓</h3>
                        <button onClick={() => { fetchPositions(); fetchAccount() }} className="text-slate-400 hover:text-primary transition-colors">
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    {positions.length === 0 ? (
                        <div className="py-16 text-center text-sm text-slate-400">暂无持仓</div>
                    ) : (
                        <div className="overflow-auto max-h-[400px]">
                            <table className="w-full">
                                <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">代码</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">名称</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">持仓</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">成本</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">现价</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">市值</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">浮盈亏</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">盈亏%</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {positions.map(pos => (
                                        <tr key={pos.stock_id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{pos.symbol}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700">{pos.name}</td>
                                            <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">{pos.quantity}</td>
                                            <td className="px-4 py-3 text-sm text-right text-slate-600">{pos.avg_cost.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">{pos.current_price.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-slate-700">{formatMoney(pos.market_value)}</td>
                                            <td className={`px-4 py-3 text-sm text-right font-semibold ${pos.floating_pnl >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {pos.floating_pnl >= 0 ? '+' : ''}{formatMoney(pos.floating_pnl)}
                                            </td>
                                            <td className={`px-4 py-3 text-sm text-right font-semibold ${pos.floating_pnl_pct >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {pos.floating_pnl_pct >= 0 ? '+' : ''}{pos.floating_pnl_pct.toFixed(2)}%
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => handleClosePosition(pos)}
                                                    className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                                                >
                                                    一键平仓
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Right: Order Panel */}
                <div className="col-span-1 rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-sm font-semibold text-slate-700">下单面板</h3>
                    </div>
                    <div className="p-5 space-y-4">
                        {/* Stock Search */}
                        <div className="relative">
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">股票</label>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={stockSearch}
                                    onChange={e => { setStockSearch(e.target.value); if (!e.target.value) { setOrderSymbol(''); setOrderPrice(null) } }}
                                    placeholder="搜索代码或名称..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                                {orderSymbol && (
                                    <div className="mt-1 text-xs text-primary font-medium">
                                        已选：{stockOptions.find(s => s.symbol === orderSymbol)?.name || orderSymbol} ({orderSymbol})
                                        <button onClick={() => { setOrderSymbol(''); setOrderPrice(null); setStockSearch('') }} className="ml-2 text-slate-400 hover:text-red-500">
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            {showStockDropdown && stockOptions.length > 0 && !orderSymbol && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                                    {stockOptions.map(s => (
                                        <div
                                            key={s.id}
                                            onClick={() => {
                                                setOrderSymbol(s.symbol)
                                                setStockSearch(`${s.name} (${s.symbol})`)
                                                setShowStockDropdown(false)
                                            }}
                                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 cursor-pointer transition-colors text-sm"
                                        >
                                            <span className="font-medium text-slate-900">{s.symbol}</span>
                                            <span className="text-slate-500">{s.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Direction Toggle */}
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">方向</label>
                            <div className="flex rounded-xl overflow-hidden border-2 border-slate-200">
                                <button
                                    onClick={() => setOrderDirection('buy')}
                                    className={`flex-1 py-2.5 text-sm font-semibold transition-all ${orderDirection === 'buy' ? 'bg-red-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                >
                                    买入
                                </button>
                                <button
                                    onClick={() => setOrderDirection('sell')}
                                    className={`flex-1 py-2.5 text-sm font-semibold transition-all ${orderDirection === 'sell' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                >
                                    卖出
                                </button>
                            </div>
                        </div>

                        {/* Quantity */}
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">数量（股）</label>
                            <input
                                type="number"
                                min="1"
                                value={orderQuantity}
                                onChange={e => setOrderQuantity(e.target.value)}
                                placeholder="输入买入/卖出数量"
                                className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                        </div>

                        {/* Price & Amount Preview */}
                        <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">成交价</span>
                                <span className="font-medium text-slate-900">{orderPrice ? orderPrice.toFixed(2) : '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">成交金额</span>
                                <span className="font-medium text-slate-900">{estimatedAmount > 0 ? formatMoney(estimatedAmount) : '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">手续费 (0.025%)</span>
                                <span className="font-medium text-slate-900">{estimatedCommission > 0 ? estimatedCommission.toFixed(2) : '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                                <span className="text-slate-500">{orderDirection === 'buy' ? '合计支付' : '预计到账'}</span>
                                <span className={`font-bold ${orderDirection === 'buy' ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {estimatedAmount > 0 ? formatMoney(estimatedTotal) : '-'}
                                </span>
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            onClick={handleSubmitOrder}
                            disabled={submitting || !orderSymbol || !orderQuantity}
                            className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${orderDirection === 'buy' ? 'bg-red-500 hover:bg-red-600 shadow-md shadow-red-200' : 'bg-emerald-500 hover:bg-emerald-600 shadow-md shadow-emerald-200'}`}
                        >
                            {submitting ? '提交中...' : orderDirection === 'buy' ? '确认买入' : '确认卖出'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Trade History */}
            <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-700">历史成交</h3>
                        <div className="flex items-center gap-3">
                            <select
                                value={tradeFilterDir}
                                onChange={e => { setTradeFilterDir(e.target.value); setTradePage(1) }}
                                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-primary"
                            >
                                <option value="">全部方向</option>
                                <option value="buy">买入</option>
                                <option value="sell">卖出</option>
                            </select>
                            <input
                                type="text"
                                value={tradeFilterSymbol}
                                onChange={e => { setTradeFilterSymbol(e.target.value); setTradePage(1) }}
                                placeholder="按股票代码筛选"
                                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-36 bg-white focus:outline-none focus:border-primary"
                            />
                        </div>
                    </div>
                </div>
                {trades.length === 0 ? (
                    <div className="py-16 text-center text-sm text-slate-400">暂无成交记录</div>
                ) : (
                    <>
                        <div className="overflow-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">时间</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">代码</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">名称</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">方向</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">数量</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">成交价</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">手续费</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {trades.map(t => (
                                        <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-4 py-3 text-sm text-slate-600">{new Date(t.traded_at).toLocaleString('zh-CN')}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{t.symbol}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700">{t.name}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${t.direction === 'buy' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                    {t.direction === 'buy' ? '买入' : '卖出'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">{t.quantity}</td>
                                            <td className="px-4 py-3 text-sm text-right text-slate-700">{t.price.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-slate-500">{t.commission.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${t.status === 'filled' ? 'bg-emerald-50 text-emerald-600' : t.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-yellow-50 text-yellow-600'}`}>
                                                    {t.status === 'filled' ? '已成交' : t.status === 'cancelled' ? '已撤单' : '待成交'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
                            <span className="text-xs text-slate-500">共 {tradeTotal} 条记录</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setTradePage(p => Math.max(1, p - 1))}
                                    disabled={tradePage <= 1}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs text-slate-600 font-medium">{tradePage} / {totalTradePages}</span>
                                <button
                                    onClick={() => setTradePage(p => Math.min(totalTradePages, p + 1))}
                                    disabled={tradePage >= totalTradePages}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
