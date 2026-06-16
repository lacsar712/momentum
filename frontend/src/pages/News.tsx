import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Search, Calendar, Filter, Newspaper, TrendingUp, RefreshCw,
    ChevronDown, ChevronUp, ExternalLink, Clock, Building2,
    FileText, BarChart3, X, Check, Download, Flame, Layers,
} from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import DatePicker from '../components/DatePicker'
import Loading from '../components/Loading'
import StockNameLink from '../components/StockNameLink'
import { AxiosResponse } from 'axios'

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
    raw_html?: string
}

interface NewsListResponse {
    total: number
    page: number
    page_size: number
    items: NewsItem[]
}

interface HotStockItem {
    symbol: string
    name: string
    news_count: number
}

interface HotStocksResponse {
    date: string
    top_n: number
    items: HotStockItem[]
}

interface SectorItem {
    sector: string
    news_count: number
}

interface SectorsResponse {
    sectors: SectorItem[]
}

interface SyncProgress {
    status: 'idle' | 'running' | 'finished' | 'error'
    current: number
    total: number
    message: string
}

interface StockItem {
    symbol: string
    name: string
}

const NEWS_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    '公告': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    '新闻': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    '研报': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
}

const STOCK_COLORS = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
]

const getStockColor = (symbol: string): string => {
    let hash = 0
    for (let i = 0; i < symbol.length; i++) {
        hash = symbol.charCodeAt(i) + ((hash << 5) - hash)
    }
    return STOCK_COLORS[Math.abs(hash) % STOCK_COLORS.length]
}

const formatPublishTime = (iso: string): string => {
    if (!iso) return ''
    const date = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function News() {
    const navigate = useNavigate()
    const { pushToast } = useToast()

    const [keyword, setKeyword] = useState('')
    const [selectedType, setSelectedType] = useState<string | null>(null)
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [stockList, setStockList] = useState<StockItem[]>([])
    const [selectedStocks, setSelectedStocks] = useState<string[]>([])
    const [stockSelectorOpen, setStockSelectorOpen] = useState(false)
    const [stockSearch, setStockSearch] = useState('')

    const [sectorList, setSectorList] = useState<SectorItem[]>([])
    const [selectedSectors, setSelectedSectors] = useState<string[]>([])
    const [sectorSelectorOpen, setSectorSelectorOpen] = useState(false)
    const [sectorSearch, setSectorSearch] = useState('')

    const [newsList, setNewsList] = useState<NewsItem[]>([])
    const [newsLoading, setNewsLoading] = useState(false)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const pageSize = 20

    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [expandedNews, setExpandedNews] = useState<NewsItem | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    const [hotStocks, setHotStocks] = useState<HotStockItem[]>([])
    const [hotStocksLoading, setHotStocksLoading] = useState(false)

    const [syncProgress, setSyncProgress] = useState<SyncProgress>({ status: 'idle', current: 0, total: 0, message: '' })
    const [syncDateRange, setSyncDateRange] = useState<{ start: string; end: string }>({
        start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
    })
    const [syncing, setSyncing] = useState(false)

    const [newsTypes, setNewsTypes] = useState<string[]>([])

    useEffect(() => {
        loadStockList()
        loadNewsTypes()
        loadSectorList()
    }, [])

    useEffect(() => {
        loadNews()
        loadHotStocks()
    }, [page, selectedType, startDate, endDate, selectedStocks, selectedSectors])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (page === 1) loadNews()
            else setPage(1)
        }, 500)
        return () => clearTimeout(timer)
    }, [keyword])

    useEffect(() => {
        if (syncProgress.status === 'running') {
            const interval = setInterval(() => {
                api.get('/news/sync/progress')
                    .then((res: AxiosResponse<SyncProgress>) => {
                        setSyncProgress(res.data)
                        if (res.data.status === 'finished') {
                            pushToast(res.data.message || '同步完成', 'success')
                            loadNews()
                            loadHotStocks()
                            loadSectorList()
                        } else if (res.data.status === 'error') {
                            pushToast(res.data.message || '同步失败', 'error')
                        }
                    })
                    .catch(() => {})
            }, 1500)
            return () => clearInterval(interval)
        }
    }, [syncProgress.status])

    const loadStockList = async () => {
        try {
            const res = await api.get('/stocks', { params: { limit: 5000 } })
            setStockList(res.data.items?.map((s: any) => ({ symbol: s.symbol, name: s.name })) || [])
        } catch {}
    }

    const loadNewsTypes = async () => {
        try {
            const res = await api.get('/news/types')
            setNewsTypes(res.data.types || [])
        } catch {}
    }

    const loadSectorList = async () => {
        try {
            const res: AxiosResponse<SectorsResponse> = await api.get('/news/sectors')
            setSectorList(res.data.sectors || [])
        } catch {}
    }

    const loadNews = useCallback(async () => {
        setNewsLoading(true)
        try {
            const payload: any = {
                page,
                page_size: pageSize,
            }
            if (keyword) payload.keyword = keyword
            if (selectedType) payload.news_type = selectedType
            if (startDate) payload.start_date = startDate
            if (endDate) payload.end_date = endDate
            if (selectedStocks.length > 0) payload.symbol = selectedStocks
            if (selectedSectors.length > 0) payload.sector = selectedSectors

            const res: AxiosResponse<NewsListResponse> = await api.post('/news/query', payload)
            setNewsList(res.data.items || [])
            setTotal(res.data.total || 0)
        } catch {
            pushToast('加载资讯列表失败', 'error')
        } finally {
            setNewsLoading(false)
        }
    }, [page, keyword, selectedType, startDate, endDate, selectedStocks, selectedSectors])

    const loadHotStocks = async () => {
        setHotStocksLoading(true)
        try {
            const res: AxiosResponse<HotStocksResponse> = await api.get('/news/hot/stocks', { params: { top_n: 20 } })
            setHotStocks(res.data.items || [])
        } catch {
        } finally {
            setHotStocksLoading(false)
        }
    }

    const toggleStock = (symbol: string) => {
        setSelectedStocks(prev =>
            prev.includes(symbol)
                ? prev.filter(s => s !== symbol)
                : [...prev, symbol]
        )
    }

    const clearStockSelection = () => {
        setSelectedStocks([])
    }

    const toggleSector = (sector: string) => {
        setSelectedSectors(prev =>
            prev.includes(sector)
                ? prev.filter(s => s !== sector)
                : [...prev, sector]
        )
    }

    const clearSectorSelection = () => {
        setSelectedSectors([])
    }

    const handleCardClick = async (item: NewsItem) => {
        if (expandedId === item.id) {
            setExpandedId(null)
            setExpandedNews(null)
            return
        }
        setExpandedId(item.id)
        if (!item.raw_html) {
            setDetailLoading(true)
            try {
                const res = await api.get(`/news/${item.id}`)
                setExpandedNews({ ...item, ...res.data })
            } catch {
                setExpandedNews(item)
            } finally {
                setDetailLoading(false)
            }
        } else {
            setExpandedNews(item)
        }
    }

    const startSync = () => {
        if (!syncDateRange.start || !syncDateRange.end) {
            pushToast('请选择同步日期范围', 'error')
            return
        }
        setSyncing(true)
        api.post('/news/sync', {
            start_date: syncDateRange.start,
            end_date: syncDateRange.end,
        })
            .then(() => {
                setSyncProgress({ status: 'running', current: 0, total: 0, message: '正在启动...' })
                pushToast('资讯数据同步已启动', 'info')
            })
            .catch(() => pushToast('启动同步失败', 'error'))
            .finally(() => setSyncing(false))
    }

    const totalPages = Math.ceil(total / pageSize)

    const filteredStockList = useMemo(() => {
        if (!stockSearch) return stockList
        const search = stockSearch.toLowerCase()
        return stockList.filter(s =>
            s.symbol.includes(stockSearch) ||
            s.name.toLowerCase().includes(search)
        )
    }, [stockList, stockSearch])

    const filteredSectorList = useMemo(() => {
        if (!sectorSearch) return sectorList
        return sectorList.filter(s =>
            s.sector.toLowerCase().includes(sectorSearch.toLowerCase())
    }, [sectorList, sectorSearch])

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                        <Newspaper size={24} className="text-primary" />
                        资讯聚合
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        全量公告、新闻与研报，为量化分析补齐信息面维度
                    </p>
                </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Download size={16} className="text-primary" />
                        数据同步
                    </h3>
                    {syncProgress.status === 'running' && (
                        <span className="flex items-center gap-2 text-sm text-primary">
                            <RefreshCw size={14} className="animate-spin" />
                            {syncProgress.message}
                        </span>
                    )}
                    {syncProgress.status === 'finished' && (
                        <span className="text-sm text-emerald-600">{syncProgress.message}</span>
                    )}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-xs text-slate-500">日期范围:</div>
                    <DatePicker
                        value={syncDateRange.start}
                        onChange={(d) => setSyncDateRange(prev => ({ ...prev, start: d }))}
                        placeholder="起始日期"
                    />
                    <div className="text-slate-300">至</div>
                    <DatePicker
                        value={syncDateRange.end}
                        onChange={(d) => setSyncDateRange(prev => ({ ...prev, end: d }))}
                        placeholder="结束日期"
                    />
                    <button
                        onClick={startSync}
                        disabled={syncing || syncProgress.status === 'running'}
                        className="rounded-xl bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                        {syncing || syncProgress.status === 'running' ? (
                            <RefreshCw size={14} className="animate-spin" />
                        ) : (
                            <RefreshCw size={14} />
                        )}
                        {syncProgress.status === 'running' ? '同步中...' : '开始同步'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* 左侧筛选器 */}
                <div className="col-span-12 lg:col-span-3 space-y-4">
                    <div className="rounded-2xl border border-border bg-card shadow-sm sticky top-4">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Filter size={16} className="text-primary" />
                            <span className="font-semibold text-slate-800">筛选条件</span>
                        </div>

                        <div className="p-4 space-y-5">
                            <div>
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                                    <Search size={12} />
                                    关键字搜索
                                </label>
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        placeholder="标题、摘要..."
                                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border-2 border-slate-200 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                                    <FileText size={12} />
                                    资讯类型
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => setSelectedType(null)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            selectedType === null
                                                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        全部
                                    </button>
                                    {newsTypes.map(type => {
                                        const colors = NEWS_TYPE_COLORS[type] || NEWS_TYPE_COLORS['新闻']
                                        return (
                                            <button
                                                key={type}
                                                onClick={() => setSelectedType(selectedType === type ? null : type)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                                    selectedType === type
                                                        ? `${colors.bg} ${colors.text} ${colors.border} shadow-sm`
                                                        : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100'
                                                }`}
                                            >
                                                {type}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                                    <Calendar size={12} />
                                    时间范围
                                </label>
                                <div className="space-y-2">
                                    <DatePicker
                                        value={startDate}
                                        onChange={setStartDate}
                                        placeholder="开始日期"
                                    />
                                    <DatePicker
                                        value={endDate}
                                        onChange={setEndDate}
                                        placeholder="结束日期"
                                    />
                                </div>
                                {(startDate || endDate) && (
                                    <button
                                        onClick={() => { setStartDate(''); setEndDate('') }}
                                        className="mt-2 text-xs text-primary hover:text-primary/80"
                                    >
                                        清除日期
                                    </button>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-2">
                                    <span className="flex items-center gap-2">
                                        <Layers size={12} />
                                        关联板块
                                    </span>
                                    {selectedSectors.length > 0 && (
                                        <button
                                            onClick={clearSectorSelection}
                                            className="text-slate-400 hover:text-red-500 flex items-center gap-0.5"
                                        >
                                            <X size={10} />清除
                                        </button>
                                    )}
                                </label>

                                {selectedSectors.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2 max-h-20 overflow-y-auto">
                                        {selectedSectors.map(sec => (
                                            <span
                                                key={sec}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200"
                                            >
                                                {sec}
                                                <button
                                                    onClick={() => toggleSector(sec)}
                                                    className="hover:bg-amber-100 rounded-full"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="relative">
                                    <button
                                        onClick={() => setSectorSelectorOpen(!sectorSelectorOpen)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 border-2 border-slate-200 text-sm hover:border-primary/30 transition-all"
                                    >
                                        <span className="text-slate-500">选择板块（多选）</span>
                                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${sectorSelectorOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {sectorSelectorOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl bg-white border-2 border-slate-200 shadow-xl overflow-hidden">
                                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
                                                <Search size={14} className="text-slate-400" />
                                                <input
                                                    autoFocus
                                                    value={sectorSearch}
                                                    onChange={(e) => setSectorSearch(e.target.value)}
                                                    placeholder="搜索板块名称"
                                                    className="flex-1 bg-transparent text-sm outline-none"
                                                />
                                            </div>
                                            <div className="max-h-60 overflow-y-auto">
                                                {filteredSectorList.slice(0, 100).map(sec => (
                                                    <button
                                                        key={sec.sector}
                                                        onClick={() => toggleSector(sec.sector)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                                                            selectedSectors.includes(sec.sector) ? 'bg-amber-50' : ''
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                                                            <span className="text-slate-700">{sec.sector}</span>
                                                            <span className="text-xs text-slate-400">
                                                                {sec.news_count > 0 ? `${sec.news_count}条` : ''}
                                                            </span>
                                                        </span>
                                                        {selectedSectors.includes(sec.sector) && (
                                                            <Check size={14} className="text-amber-500" />
                                                        )}
                                                    </button>
                                                ))}
                                                {filteredSectorList.length === 0 && (
                                                    <div className="px-3 py-6 text-center text-sm text-slate-400">
                                                        暂无板块数据
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-2">
                                    <span className="flex items-center gap-2">
                                        <Building2 size={12} />
                                        关联股票
                                    </span>
                                    {selectedStocks.length > 0 && (
                                        <button
                                            onClick={clearStockSelection}
                                            className="text-slate-400 hover:text-red-500 flex items-center gap-0.5"
                                        >
                                            <X size={10} />清除
                                        </button>
                                    )}
                                </label>

                                {selectedStocks.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2 max-h-20 overflow-y-auto">
                                        {selectedStocks.map(sym => {
                                            const stock = stockList.find(s => s.symbol === sym)
                                            return (
                                                <span
                                                    key={sym}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
                                                >
                                                    {stock?.name || sym}
                                                    <button
                                                        onClick={() => toggleStock(sym)}
                                                        className="hover:bg-primary/20 rounded-full"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </span>
                                            )
                                        })}
                                    </div>
                                )}

                                <div className="relative">
                                    <button
                                        onClick={() => setStockSelectorOpen(!stockSelectorOpen)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 border-2 border-slate-200 text-sm hover:border-primary/30 transition-all"
                                    >
                                        <span className="text-slate-500">选择股票（多选）</span>
                                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${stockSelectorOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {stockSelectorOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl bg-white border-2 border-slate-200 shadow-xl overflow-hidden">
                                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
                                                <Search size={14} className="text-slate-400" />
                                                <input
                                                    autoFocus
                                                    value={stockSearch}
                                                    onChange={(e) => setStockSearch(e.target.value)}
                                                    placeholder="搜索代码或名称"
                                                    className="flex-1 bg-transparent text-sm outline-none"
                                                />
                                            </div>
                                            <div className="max-h-60 overflow-y-auto">
                                                {filteredStockList.slice(0, 100).map(stock => (
                                                    <button
                                                        key={stock.symbol}
                                                        onClick={() => toggleStock(stock.symbol)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                                                            selectedStocks.includes(stock.symbol) ? 'bg-primary/5' : ''
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <span className={`w-2 h-2 rounded-full ${getStockColor(stock.symbol)}`} />
                                                            <span className="text-slate-700">{stock.name}</span>
                                                            <span className="text-xs text-slate-400">{stock.symbol}</span>
                                                        </span>
                                                        {selectedStocks.includes(stock.symbol) && (
                                                            <Check size={14} className="text-primary" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 中部资讯流 */}
                <div className="col-span-12 lg:col-span-6 space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <div className="text-sm text-slate-600">
                            共找到 <span className="font-bold text-primary">{total}</span> 条资讯
                        </div>
                    </div>

                    {newsLoading ? (
                        <div className="rounded-2xl border border-border bg-card p-12">
                            <Loading />
                        </div>
                    ) : newsList.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-card p-12 text-center">
                            <Newspaper size={48} className="mx-auto mb-4 text-slate-300" />
                            <p className="text-slate-500">暂无匹配的资讯</p>
                            <p className="text-xs text-slate-400 mt-1">调整筛选条件或同步最新数据</p>
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/30 via-slate-200 to-transparent" />

                            <div className="space-y-4">
                                {newsList.map((item) => {
                                    const isExpanded = expandedId === item.id
                                    const typeColors = NEWS_TYPE_COLORS[item.news_type] || NEWS_TYPE_COLORS['新闻']
                                    return (
                                        <div key={item.id} className="relative pl-12">
                                            <div className={`absolute left-3 top-5 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10 ${
                                                item.news_type === '公告' ? 'bg-blue-500' :
                                                item.news_type === '研报' ? 'bg-purple-500' : 'bg-emerald-500'
                                            }`} />

                                            <div
                                                className={`rounded-2xl border bg-white shadow-sm transition-all duration-300 cursor-pointer hover:shadow-md ${
                                                    isExpanded
                                                        ? `border-l-4 ${item.news_type === '公告' ? 'border-l-blue-500' : item.news_type === '研报' ? 'border-l-purple-500' : 'border-l-emerald-500'} border-t border-r border-b border-slate-200`
                                                        : 'border-slate-200/60 hover:border-slate-200'
                                                }`}
                                                onClick={() => handleCardClick(item)}
                                            >
                                                <div className="p-5">
                                                    <div className="flex items-start justify-between gap-3 mb-3">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
                                                                {item.news_type}
                                                            </span>
                                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                                <Building2 size={12} />
                                                                {item.source}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                                                            <Clock size={12} />
                                                            {formatPublishTime(item.publish_time)}
                                                        </span>
                                                    </div>

                                                    <h3 className="text-base font-bold text-slate-900 leading-snug mb-2 line-clamp-2 hover:text-primary transition-colors">
                                                        {item.title}
                                                    </h3>

                                                    {item.summary && (
                                                        <p className={`text-sm text-slate-600 leading-relaxed ${
                                                            isExpanded ? '' : 'line-clamp-2'
                                                        }`}>
                                                            {item.summary}
                                                        </p>
                                                    )}

                                                    <div className="mt-3 flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {item.symbol && (
                                                                <span
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        navigate(`/stock/${item.symbol}`)
                                                                    }}
                                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-90 transition-opacity shadow-sm ${getStockColor(item.symbol)}`}
                                                                >
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                                                    {item.stock_name || item.symbol}
                                                                    {item.stock_name && (
                                                                        <span className="opacity-70 font-normal">{item.symbol}</span>
                                                                    )}
                                                                </span>
                                                            )}
                                                            {item.sector && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
                                                                    {item.sector}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {isExpanded && item.url && (
                                                                <a
                                                                    href={item.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                                                                >
                                                                    <ExternalLink size={12} />
                                                                    原文链接
                                                                </a>
                                                            )}
                                                            {isExpanded ? (
                                                                <ChevronUp size={16} className="text-slate-400" />
                                                            ) : (
                                                                <ChevronDown size={16} className="text-slate-400" />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                                            {detailLoading ? (
                                                                <div className="py-6 text-center">
                                                                    <Loading />
                                                                </div>
                                                            ) : expandedNews?.raw_html ? (
                                                                <div
                                                                    className="prose prose-sm max-w-none text-slate-700 [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline"
                                                                    dangerouslySetInnerHTML={{ __html: expandedNews.raw_html }}
                                                                />
                                                            ) : expandedNews?.summary ? (
                                                                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                                                                    {expandedNews.summary}
                                                                </p>
                                                            ) : (
                                                                <p className="text-sm text-slate-400 text-center py-4">
                                                                    暂无全文内容，请点击原文链接查看
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                上一页
                            </button>
                            <div className="flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-50 text-sm">
                                <span className="text-slate-500">第</span>
                                <span className="font-bold text-primary mx-1">{page}</span>
                                <span className="text-slate-500">/ {totalPages} 页</span>
                            </div>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                下一页
                            </button>
                        </div>
                    )}
                </div>

                {/* 右侧热门股票侧栏 */}
                <div className="col-span-12 lg:col-span-3 space-y-4">
                    <div className="rounded-2xl border border-border bg-card shadow-sm sticky top-4">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-gradient-to-r from-orange-50/50 to-red-50/50 rounded-t-2xl">
                            <Flame size={16} className="text-orange-500" />
                            <span className="font-semibold text-slate-800">今日热门股票</span>
                            <span className="ml-auto text-xs text-slate-400">按资讯数排序</span>
                        </div>

                        <div className="p-2">
                            {hotStocksLoading ? (
                                <div className="py-8">
                                    <Loading />
                                </div>
                            ) : hotStocks.length === 0 ? (
                                <div className="py-12 text-center">
                                    <BarChart3 size={32} className="mx-auto mb-3 text-slate-300" />
                                    <p className="text-sm text-slate-400">今日暂无热门股票</p>
                                    <p className="text-xs text-slate-300 mt-1">同步数据后可见</p>
                                </div>
                            ) : (
                                <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
                                    {hotStocks.map((stock, idx) => (
                                        <button
                                            key={stock.symbol}
                                            onClick={() => navigate(`/stock/${stock.symbol}`)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                                        >
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold ${
                                                idx === 0 ? 'bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-sm shadow-red-200' :
                                                idx === 1 ? 'bg-gradient-to-br from-orange-400 to-amber-400 text-white shadow-sm shadow-orange-200' :
                                                idx === 2 ? 'bg-gradient-to-br from-amber-400 to-yellow-400 text-white shadow-sm shadow-amber-200' :
                                                'bg-slate-100 text-slate-500'
                                            }`}>
                                                {idx + 1}
                                            </span>

                                            <div className={`w-2 h-2 rounded-full shrink-0 ${getStockColor(stock.symbol)}`} />

                                            <div className="flex-1 min-w-0 text-left">
                                                <div className="text-sm font-medium text-slate-800 truncate group-hover:text-primary transition-colors">
                                                    {stock.name}
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                    {stock.symbol}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <TrendingUp size={12} className="text-orange-500" />
                                                <span className="text-xs font-bold text-orange-600">
                                                    {stock.news_count}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {hotStocks.length > 0 && (
                            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                                <button
                                    onClick={loadHotStocks}
                                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary transition-colors"
                                >
                                    <RefreshCw size={12} />
                                    刷新
                                </button>
                                <span className="text-xs text-slate-400">
                                    Top {Math.min(20, hotStocks.length)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="text-xs text-slate-500 mb-3">快速筛选</div>
                        <div className="space-y-2">
                            {[
                                { label: '今日最新', action: () => { setStartDate(new Date().toISOString().slice(0, 10)); setEndDate(new Date().toISOString().slice(0, 10)); setPage(1) } },
                                { label: '近7天', action: () => { setStartDate(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)); setEndDate(''); setPage(1) } },
                                { label: '近30天', action: () => { setStartDate(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)); setEndDate(''); setPage(1) } },
                            ].map(item => (
                                <button
                                    key={item.label}
                                    onClick={item.action}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-primary transition-all flex items-center justify-between group"
                                >
                                    {item.label}
                                    <ChevronDown size={14} className="text-slate-300 group-hover:text-primary -rotate-90 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
