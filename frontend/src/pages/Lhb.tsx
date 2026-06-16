import { useEffect, useState, useCallback } from 'react'
import {
    Calendar, Search, Building2, PieChart, ChevronDown, ChevronUp,
    RefreshCw, Download, TrendingUp, ArrowLeft,
} from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import DatePicker from '../components/DatePicker'
import Loading from '../components/Loading'
import StockNameLink from '../components/StockNameLink'
import StockSelector from '../components/StockSelector'
import { AxiosResponse } from 'axios'

interface BrokerageSeat {
    name: string
    amount?: number
}

interface LhbRecord {
    id: number
    symbol: string
    name: string
    trade_date: string
    reason: string
    buy_brokerages: BrokerageSeat[]
    sell_brokerages: BrokerageSeat[]
    net_buy_amount: number | null
    total_amount: number | null
    matched_buy?: BrokerageSeat[]
    matched_sell?: BrokerageSeat[]
}

interface SyncProgress {
    status: 'idle' | 'running' | 'finished' | 'error'
    current: number
    total: number
    message: string
}

interface BrokerageRankingItem {
    name: string
    count: number
    net_buy: number
}

interface ReasonAggItem {
    reason: string
    count: number
    total_net_buy: number
    total_amount: number
}

const formatAmount = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-'
    if (Math.abs(value) >= 100000000) return (value / 100000000).toFixed(2) + ' 亿'
    if (Math.abs(value) >= 10000) return (value / 10000).toFixed(2) + ' 万'
    return value.toFixed(2)
}

const getNetBuyColor = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'text-slate-400'
    if (value > 0) return 'text-red-600'
    if (value < 0) return 'text-emerald-600'
    return 'text-slate-500'
}

export default function Lhb() {
    const { pushToast } = useToast()
    const [activeTab, setActiveTab] = useState<'today' | 'stock' | 'brokerage' | 'reason'>('today')

    const [todayDate, setTodayDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [todayRecords, setTodayRecords] = useState<LhbRecord[]>([])
    const [todayLoading, setTodayLoading] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})

    const [stockList, setStockList] = useState<{ symbol: string; name: string }[]>([])
    const [selectedSymbol, setSelectedSymbol] = useState('')
    const [stockRecords, setStockRecords] = useState<LhbRecord[]>([])
    const [stockLoading, setStockLoading] = useState(false)

    const [brokerageRanking, setBrokerageRanking] = useState<BrokerageRankingItem[]>([])
    const [brokerageRankingLoading, setBrokerageRankingLoading] = useState(false)
    const [brokerageDateRange, setBrokerageDateRange] = useState<{ start: string; end: string }>({
        start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
    })
    const [selectedBrokerage, setSelectedBrokerage] = useState('')
    const [brokerageDetail, setBrokerageDetail] = useState<LhbRecord[]>([])
    const [brokerageDetailLoading, setBrokerageDetailLoading] = useState(false)

    const [reasonAgg, setReasonAgg] = useState<ReasonAggItem[]>([])
    const [reasonLoading, setReasonLoading] = useState(false)
    const [reasonDateRange, setReasonDateRange] = useState<{ start: string; end: string }>({
        start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
    })

    const [syncProgress, setSyncProgress] = useState<SyncProgress>({ status: 'idle', current: 0, total: 0, message: '' })
    const [syncDateRange, setSyncDateRange] = useState<{ start: string; end: string }>({
        start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
    })
    const [syncing, setSyncing] = useState(false)

    useEffect(() => {
        loadStockList()
    }, [])

    useEffect(() => {
        if (activeTab === 'today') loadTodayRecords()
        if (activeTab === 'brokerage') loadBrokerageRanking()
        if (activeTab === 'reason') loadReasonAgg()
    }, [activeTab])

    useEffect(() => {
        if (syncProgress.status === 'running') {
            const interval = setInterval(() => {
                api.get('/lhb/sync/progress')
                    .then((res: AxiosResponse<SyncProgress>) => {
                        setSyncProgress(res.data)
                        if (res.data.status === 'finished') {
                            pushToast(res.data.message || '同步完成', 'success')
                            loadTodayRecords()
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

    const loadTodayRecords = useCallback(async () => {
        if (!todayDate) return
        setTodayLoading(true)
        try {
            const res = await api.get(`/lhb/date/${todayDate}`)
            setTodayRecords(res.data.items || [])
        } catch {
            pushToast('加载龙虎榜数据失败', 'error')
        } finally {
            setTodayLoading(false)
        }
    }, [todayDate])

    useEffect(() => {
        if (activeTab === 'today') loadTodayRecords()
    }, [todayDate, activeTab])

    const loadStockRecords = async () => {
        if (!selectedSymbol) {
            pushToast('请选择股票', 'error')
            return
        }
        setStockLoading(true)
        try {
            const res = await api.get(`/lhb/stock/${selectedSymbol}`)
            setStockRecords(res.data.items || [])
        } catch {
            pushToast('加载个股龙虎榜历史失败', 'error')
        } finally {
            setStockLoading(false)
        }
    }

    const loadBrokerageRanking = useCallback(async () => {
        if (!brokerageDateRange.start || !brokerageDateRange.end) return
        setBrokerageRankingLoading(true)
        try {
            const res = await api.post('/lhb/brokerage/ranking', {
                start_date: brokerageDateRange.start,
                end_date: brokerageDateRange.end,
            })
            setBrokerageRanking(res.data.items || [])
        } catch {
            pushToast('加载营业部排行失败', 'error')
        } finally {
            setBrokerageRankingLoading(false)
        }
    }, [brokerageDateRange])

    const loadBrokerageDetail = async (name: string) => {
        setSelectedBrokerage(name)
        setBrokerageDetailLoading(true)
        try {
            const res = await api.post('/lhb/brokerage', {
                brokerage_name: name,
                start_date: brokerageDateRange.start,
                end_date: brokerageDateRange.end,
            })
            setBrokerageDetail(res.data.items || [])
        } catch {
            pushToast('加载营业部明细失败', 'error')
        } finally {
            setBrokerageDetailLoading(false)
        }
    }

    const loadReasonAgg = useCallback(async () => {
        if (!reasonDateRange.start || !reasonDateRange.end) return
        setReasonLoading(true)
        try {
            const res = await api.post('/lhb/reason/aggregation', {
                start_date: reasonDateRange.start,
                end_date: reasonDateRange.end,
            })
            setReasonAgg(res.data.items || [])
        } catch {
            pushToast('加载原因聚合数据失败', 'error')
        } finally {
            setReasonLoading(false)
        }
    }, [reasonDateRange])

    const startSync = () => {
        if (!syncDateRange.start || !syncDateRange.end) {
            pushToast('请选择同步日期范围', 'error')
            return
        }
        setSyncing(true)
        api.post('/lhb/sync', {
            start_date: syncDateRange.start,
            end_date: syncDateRange.end,
        })
            .then(() => {
                setSyncProgress({ status: 'running', current: 0, total: 0, message: '正在启动...' })
                pushToast('龙虎榜数据同步已启动', 'info')
            })
            .catch(() => pushToast('启动同步失败', 'error'))
            .finally(() => setSyncing(false))
    }

    const toggleRow = (id: number) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const renderBrokerageTable = (title: string, brokerages: BrokerageSeat[], type: 'buy' | 'sell') => {
        if (!brokerages.length) return null
        return (
            <div className="mt-2">
                <h5 className={`text-xs font-bold mb-1 ${type === 'buy' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {title}
                </h5>
                <div className="space-y-1">
                    {brokerages.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1">
                            <span className="text-slate-700">{b.name}</span>
                            {b.amount !== undefined && (
                                <span className={type === 'buy' ? 'text-red-500 font-medium' : 'text-emerald-500 font-medium'}>
                                    {formatAmount(b.amount)}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const renderRecordRow = (record: LhbRecord) => {
        const isExpanded = expandedRows[record.id]
        return (
            <div key={record.id} className="border-b border-slate-100 last:border-0">
                <div
                    className="grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50/50 items-center"
                    onClick={() => toggleRow(record.id)}
                >
                    <div className="col-span-2">
                        <StockNameLink symbol={record.symbol} name={record.name} />
                    </div>
                    <div className="col-span-2 text-sm text-slate-600 font-mono">{record.trade_date}</div>
                    <div className="col-span-3 text-xs text-slate-600 truncate" title={record.reason}>{record.reason}</div>
                    <div className={`col-span-2 text-sm font-bold ${getNetBuyColor(record.net_buy_amount)}`}>
                        {record.net_buy_amount !== null ? (record.net_buy_amount >= 0 ? '+' : '') + formatAmount(record.net_buy_amount) : '-'}
                    </div>
                    <div className="col-span-2 text-sm text-slate-600">{formatAmount(record.total_amount)}</div>
                    <div className="col-span-1 text-right">
                        {isExpanded ? <ChevronUp size={16} className="text-slate-400 inline" /> : <ChevronDown size={16} className="text-slate-400 inline" />}
                    </div>
                </div>
                {isExpanded && (
                    <div className="px-4 pb-4 grid grid-cols-2 gap-4">
                        {renderBrokerageTable('买入席位', record.buy_brokerages, 'buy')}
                        {renderBrokerageTable('卖出席位', record.sell_brokerages, 'sell')}
                    </div>
                )}
            </div>
        )
    }

    const reasonPieOption = {
        tooltip: {
            trigger: 'item',
            formatter: (params: any) => `${params.name}<br/>上榜次数: ${params.value}<br/>占比: ${params.percent}%`,
        },
        legend: {
            orient: 'vertical',
            right: '5%',
            top: 'center',
            textStyle: { fontSize: 12 },
        },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['35%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: {
                borderRadius: 8,
                borderColor: '#fff',
                borderWidth: 2,
            },
            label: { show: false },
            emphasis: {
                label: { show: true, fontSize: 14, fontWeight: 'bold' },
            },
            data: reasonAgg.map(item => ({
                name: item.reason.length > 10 ? item.reason.slice(0, 10) + '...' : item.reason,
                value: item.count,
            })),
        }],
    }

    const tabs = [
        { id: 'today' as const, label: '今日龙虎榜', icon: Calendar },
        { id: 'stock' as const, label: '按个股查询', icon: Search },
        { id: 'brokerage' as const, label: '营业部排行', icon: Building2 },
        { id: 'reason' as const, label: '原因聚合', icon: PieChart },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">龙虎榜</h2>
                    <p className="text-sm text-muted-foreground">A 股每日龙虎榜数据，短线交易重要信号</p>
                </div>
            </div>

            <div className="flex gap-2 border-b border-slate-200">
                {tabs.map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                                activeTab === tab.id
                                    ? 'text-primary border-primary'
                                    : 'text-slate-500 border-transparent hover:text-slate-700'
                            }`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {activeTab === 'today' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-slate-400" />
                                <DatePicker
                                    value={todayDate}
                                    onChange={setTodayDate}
                                    placeholder="选择日期"
                                />
                            </div>
                            <div className="flex items-center gap-2 ml-auto text-sm text-slate-500">
                                {syncProgress.status === 'running' && (
                                    <span className="flex items-center gap-2">
                                        <RefreshCw size={14} className="animate-spin text-primary" />
                                        {syncProgress.message}
                                    </span>
                                )}
                                {syncProgress.status === 'finished' && (
                                    <span className="text-emerald-600">{syncProgress.message}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-700">数据同步</h3>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                            <DatePicker
                                value={syncDateRange.start}
                                onChange={(d) => setSyncDateRange(prev => ({ ...prev, start: d }))}
                                placeholder="起始日期"
                            />
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
                                    <Download size={14} />
                                )}
                                {syncProgress.status === 'running' ? '同步中...' : '同步数据'}
                            </button>
                        </div>
                    </div>

                    {todayLoading ? (
                        <Loading />
                    ) : todayRecords.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-card p-12 text-center">
                            <Calendar size={40} className="mx-auto mb-3 text-slate-300" />
                            <p className="text-slate-500">{todayDate} 无龙虎榜数据</p>
                            <p className="text-xs text-slate-400 mt-1">非交易日或尚未同步数据</p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-border bg-card overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                <span className="text-sm font-semibold text-slate-700">
                                    {todayDate} 共 {todayRecords.length} 条记录
                                </span>
                            </div>
                            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50/50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                                <div className="col-span-2">股票</div>
                                <div className="col-span-2">日期</div>
                                <div className="col-span-3">上榜原因</div>
                                <div className="col-span-2">净买入额</div>
                                <div className="col-span-2">合计成交额</div>
                                <div className="col-span-1 text-right">明细</div>
                            </div>
                            {todayRecords.map(record => renderRecordRow(record))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'stock' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
                        <h3 className="text-sm font-semibold text-slate-700">查询个股上榜历史</h3>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 max-w-sm">
                                <StockSelector
                                    value={selectedSymbol}
                                    stocks={stockList}
                                    onChange={setSelectedSymbol}
                                />
                            </div>
                            <button
                                onClick={loadStockRecords}
                                disabled={stockLoading}
                                className="rounded-xl bg-primary px-4 py-2.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary/20"
                            >
                                <Search size={14} />
                                查询
                            </button>
                        </div>
                    </div>

                    {stockLoading ? (
                        <Loading />
                    ) : stockRecords.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-card p-12 text-center">
                            <Search size={40} className="mx-auto mb-3 text-slate-300" />
                            <p className="text-slate-500">请选择股票查询上榜历史</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <TrendingUp size={16} className="text-primary" />
                                <span className="font-medium">{stockRecords[0]?.name} ({selectedSymbol})</span>
                                <span className="text-slate-400">共上榜 {stockRecords.length} 次</span>
                            </div>
                            <div className="relative">
                                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />
                                <div className="space-y-4">
                                    {stockRecords.map((record) => (
                                        <div key={record.id} className="relative pl-12">
                                            <div className="absolute left-3 top-4 w-5 h-5 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                                                <div className="w-2 h-2 rounded-full bg-primary" />
                                            </div>
                                            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm font-mono font-bold text-slate-700">{record.trade_date}</span>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{record.reason}</span>
                                                    </div>
                                                    <div className={`text-sm font-bold ${getNetBuyColor(record.net_buy_amount)}`}>
                                                        净买入: {record.net_buy_amount !== null ? (record.net_buy_amount >= 0 ? '+' : '') + formatAmount(record.net_buy_amount) : '-'}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {record.buy_brokerages.length > 0 && (
                                                        <div>
                                                            <p className="text-xs font-bold text-red-500 mb-1">买入营业部</p>
                                                            {record.buy_brokerages.slice(0, 3).map((b, i) => (
                                                                <div key={i} className="flex justify-between text-xs text-slate-600 py-0.5">
                                                                    <span>{b.name}</span>
                                                                    {b.amount !== undefined && <span className="text-red-500">{formatAmount(b.amount)}</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {record.sell_brokerages.length > 0 && (
                                                        <div>
                                                            <p className="text-xs font-bold text-emerald-500 mb-1">卖出营业部</p>
                                                            {record.sell_brokerages.slice(0, 3).map((b, i) => (
                                                                <div key={i} className="flex justify-between text-xs text-slate-600 py-0.5">
                                                                    <span>{b.name}</span>
                                                                    {b.amount !== undefined && <span className="text-emerald-500">{formatAmount(b.amount)}</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'brokerage' && (
                <div className="space-y-6">
                    {selectedBrokerage ? (
                        <div className="space-y-6">
                            <button
                                onClick={() => { setSelectedBrokerage(''); setBrokerageDetail([]) }}
                                className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                            >
                                <ArrowLeft size={16} />
                                返回营业部排行
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Building2 size={20} className="text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{selectedBrokerage}</h3>
                                    <p className="text-xs text-slate-500">
                                        {brokerageDateRange.start} ~ {brokerageDateRange.end} 关联上榜股票
                                    </p>
                                </div>
                            </div>
                            {brokerageDetailLoading ? (
                                <Loading />
                            ) : brokerageDetail.length === 0 ? (
                                <div className="rounded-2xl border border-border bg-card p-12 text-center">
                                    <p className="text-slate-500">该营业部暂无关联股票</p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">日期</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">股票</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">上榜原因</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">买入</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">卖出</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {brokerageDetail.map(record => (
                                                    <tr key={record.id} className="hover:bg-slate-50/50">
                                                        <td className="px-4 py-3 text-sm font-mono text-slate-600">{record.trade_date}</td>
                                                        <td className="px-4 py-3"><StockNameLink symbol={record.symbol} name={record.name} /></td>
                                                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{record.reason}</td>
                                                        <td className="px-4 py-3">
                                                            {record.matched_buy?.map((b, i) => (
                                                                <div key={i} className="text-xs text-red-500">
                                                                    {b.amount !== undefined ? formatAmount(b.amount) : b.name}
                                                                </div>
                                                            ))}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {record.matched_sell?.map((b, i) => (
                                                                <div key={i} className="text-xs text-emerald-500">
                                                                    {b.amount !== undefined ? formatAmount(b.amount) : b.name}
                                                                </div>
                                                            ))}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                                <div className="flex items-center gap-4 flex-wrap">
                                    <DatePicker
                                        value={brokerageDateRange.start}
                                        onChange={(d) => setBrokerageDateRange(prev => ({ ...prev, start: d }))}
                                        placeholder="起始日期"
                                    />
                                    <DatePicker
                                        value={brokerageDateRange.end}
                                        onChange={(d) => setBrokerageDateRange(prev => ({ ...prev, end: d }))}
                                        placeholder="结束日期"
                                    />
                                    <button
                                        onClick={loadBrokerageRanking}
                                        disabled={brokerageRankingLoading}
                                        className="rounded-xl bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary/20"
                                    >
                                        <Search size={14} />
                                        查询排行
                                    </button>
                                </div>
                            </div>

                            {brokerageRankingLoading ? (
                                <Loading />
                            ) : brokerageRanking.length === 0 ? (
                                <div className="rounded-2xl border border-border bg-card p-12 text-center">
                                    <Building2 size={40} className="mx-auto mb-3 text-slate-300" />
                                    <p className="text-slate-500">暂无营业部排行数据</p>
                                    <p className="text-xs text-slate-400 mt-1">请选择日期范围后查询</p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">排名</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">营业部</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">上榜次数</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">累计净买入</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {brokerageRanking.slice(0, 50).map((item, idx) => (
                                                    <tr key={item.name} className="hover:bg-slate-50/50">
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                                                idx === 0 ? 'bg-amber-100 text-amber-700' :
                                                                idx === 1 ? 'bg-slate-200 text-slate-600' :
                                                                idx === 2 ? 'bg-orange-100 text-orange-700' :
                                                                'bg-slate-100 text-slate-500'
                                                            }`}>
                                                                {idx + 1}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <Building2 size={14} className="text-slate-400" />
                                                                <span className="text-sm font-medium text-slate-700 max-w-[300px] truncate" title={item.name}>{item.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="text-sm font-bold text-primary">{item.count}</span>
                                                        </td>
                                                        <td className={`px-4 py-3 text-right text-sm font-bold ${getNetBuyColor(item.net_buy)}`}>
                                                            {item.net_buy >= 0 ? '+' : ''}{formatAmount(item.net_buy)}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <button
                                                                onClick={() => loadBrokerageDetail(item.name)}
                                                                className="text-xs text-primary hover:text-primary/80 font-medium"
                                                            >
                                                                查看明细
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {brokerageRanking.length > 50 && (
                                        <div className="px-4 py-3 bg-slate-50 text-center text-sm text-slate-500">
                                            仅显示前 50 名
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {activeTab === 'reason' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-4 flex-wrap">
                            <DatePicker
                                value={reasonDateRange.start}
                                onChange={(d) => setReasonDateRange(prev => ({ ...prev, start: d }))}
                                placeholder="起始日期"
                            />
                            <DatePicker
                                value={reasonDateRange.end}
                                onChange={(d) => setReasonDateRange(prev => ({ ...prev, end: d }))}
                                placeholder="结束日期"
                            />
                            <button
                                onClick={loadReasonAgg}
                                disabled={reasonLoading}
                                className="rounded-xl bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary/20"
                            >
                                <Search size={14} />
                                查询统计
                            </button>
                        </div>
                    </div>

                    {reasonLoading ? (
                        <Loading />
                    ) : reasonAgg.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-card p-12 text-center">
                            <PieChart size={40} className="mx-auto mb-3 text-slate-300" />
                            <p className="text-slate-500">暂无原因聚合数据</p>
                            <p className="text-xs text-slate-400 mt-1">请选择日期范围后查询</p>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <PieChart size={18} className="text-primary" />
                                    上榜原因分布
                                </h3>
                                <ReactECharts option={reasonPieOption} style={{ height: '350px' }} />
                            </div>

                            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                    <span className="text-sm font-semibold text-slate-700">按原因统计明细</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50/50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">排名</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">上榜原因</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">上榜次数</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">累计净买入</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">合计成交额</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {reasonAgg.map((item, idx) => {
                                                const total = reasonAgg.reduce((s, r) => s + r.count, 0)
                                                return (
                                                    <tr key={item.reason} className="hover:bg-slate-50/50">
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                                                idx === 0 ? 'bg-amber-100 text-amber-700' :
                                                                idx === 1 ? 'bg-slate-200 text-slate-600' :
                                                                idx === 2 ? 'bg-orange-100 text-orange-700' :
                                                                'bg-slate-100 text-slate-500'
                                                            }`}>
                                                                {idx + 1}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-medium text-slate-700 max-w-[300px] truncate" title={item.reason}>{item.reason}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${(item.count / total) * 100}%` }} />
                                                                </div>
                                                                <span className="text-sm font-bold text-primary">{item.count}</span>
                                                            </div>
                                                        </td>
                                                        <td className={`px-4 py-3 text-right text-sm font-bold ${getNetBuyColor(item.total_net_buy)}`}>
                                                            {item.total_net_buy >= 0 ? '+' : ''}{formatAmount(item.total_net_buy)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-sm text-slate-600">{formatAmount(item.total_amount)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
