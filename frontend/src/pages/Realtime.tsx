import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Zap, Grid3X3, List, Play, Pause, RefreshCw, X, Plus,
    TrendingUp, TrendingDown, Search, Star, Check, Loader2,
    ChevronDown,
} from 'lucide-react'
import StockNameLink from '../components/StockNameLink'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'

interface QuoteItem {
    symbol: string
    name: string
    price: number
    prev_close: number
    open: number
    change: number
    change_percent: number
    bid1_price: number
    bid1_volume: number
    ask1_price: number
    ask1_volume: number
    volume: number
    amount: number
    timestamp: string
    source: string
}

interface WatchGroupType {
    id: number
    name: string
    item_count: number
}

const POLL_INTERVAL = 3000

export default function Realtime() {
    const navigate = useNavigate()
    const { pushToast } = useToast()

    const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
    const [isPaused, setIsPaused] = useState(false)
    const [quotes, setQuotes] = useState<QuoteItem[]>([])
    const [loading, setLoading] = useState(false)
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [flashingSymbols, setFlashingSymbols] = useState<Record<string, 'up' | 'down'>>({})

    const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
    const prevPricesRef = useRef<Record<string, number>>({})

    const [showStockPicker, setShowStockPicker] = useState(false)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [stockSuggestions, setStockSuggestions] = useState<{ symbol: string; name: string; id: number }[]>([])
    const [pickerLoading, setPickerLoading] = useState(false)

    const [watchGroups, setWatchGroups] = useState<WatchGroupType[]>([])
    const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false)

    const pickerRef = useRef<HTMLDivElement>(null)
    const watchlistRef = useRef<HTMLDivElement>(null)

    const fetchQuotes = useCallback(async () => {
        if (selectedSymbols.length === 0) {
            setQuotes([])
            return
        }
        try {
            setLoading(true)
            const res = await api.get('/realtime/quote', {
                params: { symbols: selectedSymbols.join(',') }
            })
            const items: QuoteItem[] = res.data.items || []

            const prevPrices = prevPricesRef.current
            const newFlashing: Record<string, 'up' | 'down'> = {}
            items.forEach(item => {
                const prevPrice = prevPrices[item.symbol]
                if (prevPrice !== undefined && prevPrice !== item.price) {
                    newFlashing[item.symbol] = item.price > prevPrice ? 'up' : 'down'
                }
                prevPrices[item.symbol] = item.price
            })

            if (Object.keys(newFlashing).length > 0) {
                setFlashingSymbols(newFlashing)
                setTimeout(() => setFlashingSymbols({}), 400)
            }

            setQuotes(items)
            setLastUpdate(res.data.timestamp || new Date().toISOString())
        } catch (e) {
            console.error('获取实时行情失败', e)
        } finally {
            setLoading(false)
        }
    }, [selectedSymbols])

    useEffect(() => {
        if (isPaused || selectedSymbols.length === 0) return

        const timer = setInterval(fetchQuotes, POLL_INTERVAL)
        return () => clearInterval(timer)
    }, [isPaused, selectedSymbols, fetchQuotes])

    useEffect(() => {
        if (selectedSymbols.length > 0 && !isPaused) {
            fetchQuotes()
        }
    }, [selectedSymbols, isPaused, fetchQuotes])

    useEffect(() => {
        api.get('/watchlist/groups').then(res => {
            setWatchGroups(res.data.items || [])
        }).catch(() => {})
    }, [])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowStockPicker(false)
            }
            if (watchlistRef.current && !watchlistRef.current.contains(e.target as Node)) {
                setShowWatchlistDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSearchStock = (keyword: string) => {
        setSearchKeyword(keyword)
        if (!keyword.trim()) {
            setStockSuggestions([])
            return
        }
        setPickerLoading(true)
        api.get('/stocks/query', { params: { keyword, limit: 10 } })
            .then(res => {
                setStockSuggestions(res.data.items || [])
            })
            .finally(() => setPickerLoading(false))
    }

    const addStock = (symbol: string, stockName?: string) => {
        if (selectedSymbols.includes(symbol)) return
        setSelectedSymbols(prev => [...prev, symbol])
        if (isPaused && stockName) {
            setQuotes(prev => [...prev, {
                symbol,
                name: stockName,
                price: 0,
                prev_close: 0,
                open: 0,
                change: 0,
                change_percent: 0,
                bid1_price: 0,
                bid1_volume: 0,
                ask1_price: 0,
                ask1_volume: 0,
                volume: 0,
                amount: 0,
                timestamp: '',
                source: '',
            }])
        }
        pushToast(`已添加 ${symbol}`, 'success')
    }

    const removeStock = (symbol: string) => {
        setSelectedSymbols(prev => prev.filter(s => s !== symbol))
        delete prevPricesRef.current[symbol]
        setQuotes(prev => prev.filter(q => q.symbol !== symbol))
    }

    const handleRefresh = () => {
        fetchQuotes()
        pushToast('已刷新', 'success')
    }

    const handleImportWatchlist = async (groupId: number) => {
        try {
            const res = await api.get(`/watchlist/groups/${groupId}/items`)
            const items = res.data.items || []
            const newItems = items.filter((item: any) => !selectedSymbols.includes(item.symbol))
            const symbols = newItems.map((item: any) => item.symbol)
            if (symbols.length > 0) {
                setSelectedSymbols(prev => [...prev, ...symbols])
                if (isPaused) {
                    const placeholders = newItems.map((item: any) => ({
                        symbol: item.symbol,
                        name: item.name,
                        price: 0,
                        prev_close: 0,
                        open: 0,
                        change: 0,
                        change_percent: 0,
                        bid1_price: 0,
                        bid1_volume: 0,
                        ask1_price: 0,
                        ask1_volume: 0,
                        volume: 0,
                        amount: 0,
                        timestamp: '',
                        source: '',
                    }))
                    setQuotes(prev => [...prev, ...placeholders])
                }
                pushToast(`已导入 ${symbols.length} 只股票`, 'success')
            } else {
                pushToast('自选股已全部添加', 'info')
            }
            setShowWatchlistDropdown(false)
        } catch {
            pushToast('导入失败', 'error')
        }
    }

    const formatVolume = (vol: number): string => {
        if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿'
        if (vol >= 10000) return (vol / 10000).toFixed(2) + '万'
        return vol.toString()
    }

    const renderChangeBadge = (value: number, percent: number) => {
        const isUp = value >= 0
        return (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isUp ? '+' : ''}{value.toFixed(2)} ({isUp ? '+' : ''}{percent.toFixed(2)}%)
            </span>
        )
    }

    const getFlashClass = (symbol: string) => {
        const flash = flashingSymbols[symbol]
        if (!flash) return ''
        return flash === 'up'
            ? 'bg-red-50/60 ring-2 ring-red-300/50'
            : 'bg-emerald-50/60 ring-2 ring-emerald-300/50'
    }

    const hasQuoteData = (quote: QuoteItem | undefined) => {
        return quote && quote.timestamp !== ''
    }

    const quoteMap: Record<string, QuoteItem> = {}
    quotes.forEach(q => { quoteMap[q.symbol] = q })

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Zap size={24} className="text-amber-500" />
                        实时看盘
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">近实时行情追踪，每 3 秒自动刷新 · 支持批量订阅与自选股导入</p>
                </div>
                <div className="flex items-center gap-2">
                    {lastUpdate && (
                        <span className="text-xs text-slate-400">
                            更新于 {new Date(lastUpdate).toLocaleTimeString('zh-CN')}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        disabled={loading}
                        className="h-9 px-3 flex items-center gap-1.5 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        title="手动刷新"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        刷新
                    </button>
                    <button
                        onClick={() => {
                            const nextPaused = !isPaused
                            setIsPaused(nextPaused)
                            if (!nextPaused && selectedSymbols.length > 0) {
                                fetchQuotes()
                            }
                        }}
                        className={`h-9 px-3 flex items-center gap-1.5 rounded-lg text-sm font-medium transition-colors ${
                            isPaused
                                ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                    >
                        {isPaused ? <Play size={16} /> : <Pause size={16} />}
                        {isPaused ? '继续' : '暂停'}
                    </button>
                    <div className="h-6 w-px bg-slate-200 mx-1" />
                    <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
                        <button
                            onClick={() => setViewMode('card')}
                            className={`h-8 w-8 flex items-center justify-center rounded-md text-sm transition-all ${
                                viewMode === 'card' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'
                            }`}
                            title="卡片视图"
                        >
                            <Grid3X3 size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`h-8 w-8 flex items-center justify-center rounded-md text-sm transition-all ${
                                viewMode === 'table' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'
                            }`}
                            title="表格视图"
                        >
                            <List size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative" ref={pickerRef}>
                    <button
                        onClick={() => setShowStockPicker(!showStockPicker)}
                        className="h-9 px-4 flex items-center gap-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm shadow-blue-500/20"
                    >
                        <Plus size={16} />
                        添加股票
                    </button>
                    {showStockPicker && (
                        <div className="absolute top-full left-0 mt-2 w-80 z-50 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-slate-50/50">
                                <Search size={16} className="text-slate-400" />
                                <input
                                    autoFocus
                                    value={searchKeyword}
                                    onChange={e => handleSearchStock(e.target.value)}
                                    placeholder="搜索股票代码或名称..."
                                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                                />
                                {pickerLoading && <Loader2 size={14} className="animate-spin text-slate-400" />}
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {stockSuggestions.length === 0 ? (
                                    <div className="py-8 text-center text-sm text-slate-400">
                                        {searchKeyword ? '未找到匹配股票' : '输入关键词搜索股票'}
                                    </div>
                                ) : (
                                    stockSuggestions.map(stock => {
                                        const isAdded = selectedSymbols.includes(stock.symbol)
                                        return (
                                            <div
                                                key={stock.symbol}
                                                onClick={() => !isAdded && addStock(stock.symbol, stock.name)}
                                                className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                                                    isAdded ? 'bg-primary/5 cursor-default' : 'hover:bg-slate-50 cursor-pointer'
                                                }`}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-slate-900">{stock.symbol}</span>
                                                        <span className="text-sm text-slate-600 truncate">{stock.name}</span>
                                                    </div>
                                                </div>
                                                {isAdded ? (
                                                    <Check size={16} className="text-primary" />
                                                ) : (
                                                    <Plus size={14} className="text-slate-400" />
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="relative" ref={watchlistRef}>
                    <button
                        onClick={() => setShowWatchlistDropdown(!showWatchlistDropdown)}
                        className="h-9 px-4 flex items-center gap-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <Star size={16} className="text-amber-500" />
                        从自选股导入
                        <ChevronDown size={14} className="text-slate-400" />
                    </button>
                    {showWatchlistDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-56 z-50 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            {watchGroups.length === 0 ? (
                                <div className="py-6 text-center text-sm text-slate-400">
                                    暂无自选股分组
                                </div>
                            ) : (
                                watchGroups.map(group => (
                                    <div
                                        key={group.id}
                                        onClick={() => handleImportWatchlist(group.id)}
                                        className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                                    >
                                        <Star size={14} className="text-amber-400" />
                                        <span className="text-sm text-slate-700 flex-1 truncate">{group.name}</span>
                                        <span className="text-xs text-slate-400">{group.item_count}只</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {selectedSymbols.length > 0 && (
                    <span className="text-sm text-slate-500">
                        已订阅 <span className="font-medium text-slate-700">{selectedSymbols.length}</span> 只股票
                    </span>
                )}
            </div>

            {selectedSymbols.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl bg-white border border-dashed border-slate-200">
                    <div className="h-16 w-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                        <Zap size={28} className="text-amber-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">暂无订阅股票</h3>
                    <p className="text-sm text-slate-500 mb-6">点击上方「添加股票」或「从自选股导入」开始看盘</p>
                    <button
                        onClick={() => setShowStockPicker(true)}
                        className="h-9 px-4 flex items-center gap-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Plus size={16} />
                        添加股票
                    </button>
                </div>
            ) : viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {selectedSymbols.map(symbol => {
                        const quote = quoteMap[symbol]
                        const hasData = hasQuoteData(quote)
                        const flashClass = hasData ? getFlashClass(symbol) : ''
                        const isUp = hasData && quote!.change >= 0

                        return (
                            <div
                                key={symbol}
                                onClick={() => navigate(`/visual?symbol=${symbol}`)}
                                className={`group relative rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5 cursor-pointer transition-all duration-300 hover:shadow-md hover:border-slate-300 ${flashClass}`}
                            >
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeStock(symbol) }}
                                    className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 z-10"
                                    title="移除"
                                >
                                    <X size={14} />
                                </button>

                                <div className="mb-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg font-bold text-slate-900">{symbol}</span>
                                        <StockNameLink symbol={symbol} name={quote?.name || '-'} className="text-sm" target="kline" />
                                    </div>
                                </div>

                                <div className="mb-3">
                                    <div className={`text-3xl font-bold tracking-tight ${hasData ? (isUp ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400'}`}>
                                        {hasData ? quote!.price.toFixed(2) : '--'}
                                    </div>
                                    <div className="mt-1">
                                        {hasData ? renderChangeBadge(quote!.change, quote!.change_percent) : (
                                            <span className="text-sm text-slate-400">{isPaused ? '已暂停' : '加载中...'}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">买一</span>
                                        <span className={`font-medium ${hasData ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {hasData ? quote!.bid1_price.toFixed(2) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">卖一</span>
                                        <span className={`font-medium ${hasData ? 'text-red-600' : 'text-slate-400'}`}>
                                            {hasData ? quote!.ask1_price.toFixed(2) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">成交量</span>
                                        <span className="font-medium text-slate-600">
                                            {hasData ? formatVolume(quote!.volume) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">成交额</span>
                                        <span className="font-medium text-slate-600">
                                            {hasData ? formatVolume(quote!.amount) : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">代码</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">名称</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">最新价</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">涨跌</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">涨跌幅</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">买一</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">卖一</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">成交量</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {selectedSymbols.map(symbol => {
                                const quote = quoteMap[symbol]
                                const hasData = hasQuoteData(quote)
                                const flashClass = hasData ? getFlashClass(symbol) : ''
                                const isUp = hasData && quote!.change >= 0

                                return (
                                    <tr
                                        key={symbol}
                                        onClick={() => navigate(`/visual?symbol=${symbol}`)}
                                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${flashClass}`}
                                    >
                                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{symbol}</td>
                                        <td className="px-4 py-3">
                                            <StockNameLink symbol={symbol} name={quote?.name || '-'} target="kline" />
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right font-bold ${hasData ? (isUp ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400'}`}>
                                            {hasData ? quote!.price.toFixed(2) : '--'}
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right font-medium ${hasData ? (isUp ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400'}`}>
                                            {hasData ? `${isUp ? '+' : ''}${quote!.change.toFixed(2)}` : '--'}
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right font-medium ${hasData ? (isUp ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400'}`}>
                                            {hasData ? `${isUp ? '+' : ''}${quote!.change_percent.toFixed(2)}%` : '--'}
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right font-medium ${hasData ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {hasData ? quote!.bid1_price.toFixed(2) : '-'}
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right font-medium ${hasData ? 'text-red-600' : 'text-slate-400'}`}>
                                            {hasData ? quote!.ask1_price.toFixed(2) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-slate-600">
                                            {hasData ? formatVolume(quote!.volume) : '-'}
                                        </td>
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => removeStock(symbol)}
                                                    className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                    title="移除"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
