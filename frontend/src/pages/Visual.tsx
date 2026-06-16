import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { AxiosResponse } from 'axios'
import DatePicker from '../components/DatePicker'
import StockSelector from '../components/StockSelector'
import Select from '../components/Select'

interface StockItem {
    symbol: string
    name: string
}

interface PriceItem {
    trade_date: string
    open: number
    close: number
    low: number
    high: number
    volume: number
}

interface DividendEventItem {
    id: number
    stock_id: number
    ex_date: string
    cash_dividend: number
    bonus_ratio: number
    rights_ratio: number
    rights_price: number
}

interface DateRange {
    start: string
    end: string
}

export default function Visual() {
    const [searchParams] = useSearchParams()
    const { pushToast } = useToast()
    const [stocks, setStocks] = useState<StockItem[]>([])
    const [loading, setLoading] = useState(false)
    const [symbol, setSymbol] = useState(() => searchParams.get('symbol') || '')
    const [range, setRange] = useState<DateRange>({ start: '', end: '' })
    const [prices, setPrices] = useState<PriceItem[]>([])
    const [dividendEvents, setDividendEvents] = useState<DividendEventItem[]>([])

    const [freq, setFreq] = useState('D')
    const [adjust, setAdjust] = useState('none')
    const [loadedAdjust, setLoadedAdjust] = useState('none')
    const [indicators, setIndicators] = useState({
        ma5: true,
        ma20: true,
        volume: true
    })

    const [showDividendSidebar, setShowDividendSidebar] = useState(false)
    const [showEntryPanel, setShowEntryPanel] = useState(false)
    const [entryForm, setEntryForm] = useState({
        ex_date: '',
        cash_dividend: '',
        bonus_ratio: '',
        rights_ratio: '',
        rights_price: '',
    })

    useEffect(() => {
        const initialSymbol = searchParams.get('symbol')
        api.get<{ items: StockItem[] }>('/stocks', { params: { limit: 10000 } }).then((res) => {
            setStocks(res.data.items)
            if (initialSymbol) {
                setSymbol(initialSymbol)
            } else if (res.data.items.length > 0) {
                setSymbol(res.data.items[0].symbol)
            }
        })
    }, [searchParams])

    const fetchKline = () => {
        if (!symbol || !range.start || !range.end) {
            pushToast('请选择股票与时间范围', 'error')
            return
        }
        setLoading(true)
        api.post('/data/price_range_adj', {
            symbol,
            start_date: range.start,
            end_date: range.end,
            frequency: freq,
            adjust,
        })
            .then((res: AxiosResponse<{ prices: PriceItem[]; dividend_events: DividendEventItem[] }>) => {
                setPrices(res.data.prices)
                setDividendEvents(res.data.dividend_events)
                setLoadedAdjust(adjust)
            })
            .catch(() => pushToast('K线数据加载失败', 'error'))
            .finally(() => setLoading(false))
    }

    const fetchDividendEvents = () => {
        if (!symbol) return
        api.get<{ items: DividendEventItem[] }>('/dividend_events', { params: { symbol } })
            .then((res) => setDividendEvents(res.data.items))
            .catch(() => pushToast('除权事件加载失败', 'error'))
    }

    useEffect(() => {
        if (symbol) fetchDividendEvents()
    }, [symbol])

    useEffect(() => {
        if (prices.length > 0 && !loading) {
            fetchKline()
        }
    }, [adjust, freq])

    const handleEntrySubmit = () => {
        if (!entryForm.ex_date) {
            pushToast('请填写除权日期', 'error')
            return
        }
        api.post('/dividend_events', {
            symbol,
            ex_date: entryForm.ex_date,
            cash_dividend: parseFloat(entryForm.cash_dividend) || 0,
            bonus_ratio: parseFloat(entryForm.bonus_ratio) || 0,
            rights_ratio: parseFloat(entryForm.rights_ratio) || 0,
            rights_price: parseFloat(entryForm.rights_price) || 0,
        })
            .then(() => {
                pushToast('除权事件录入成功', 'success')
                setEntryForm({ ex_date: '', cash_dividend: '', bonus_ratio: '', rights_ratio: '', rights_price: '' })
                setShowEntryPanel(false)
                fetchDividendEvents()
                if (prices.length > 0) {
                    fetchKline()
                }
            })
            .catch(() => pushToast('录入失败', 'error'))
    }

    const handleDeleteEvent = (id: number) => {
        api.delete(`/dividend_events/${id}`)
            .then(() => {
                pushToast('已删除', 'success')
                fetchDividendEvents()
                if (prices.length > 0) {
                    fetchKline()
                }
            })
            .catch(() => pushToast('删除失败', 'error'))
    }

    const calculateMA = (dayCount: number, data: PriceItem[]) => {
        const result = []
        for (let i = 0, len = data.length; i < len; i++) {
            if (i < dayCount) {
                result.push('-')
                continue
            }
            let sum = 0
            for (let j = 0; j < dayCount; j++) {
                sum += data[i - j].close
            }
            result.push((sum / dayCount).toFixed(2))
        }
        return result
    }

    const option = useMemo(() => {
        const categories = prices.map((item: PriceItem) => item.trade_date)
        const values = prices.map((item: PriceItem) => [item.open, item.close, item.low, item.high])
        const volumes = prices.map((item: PriceItem, index) => [index, item.volume, item.close > item.open ? 1 : -1])

        const eventDateSet = new Set(dividendEvents.map(e => e.ex_date))
        const markPoints: any[] = []
        prices.forEach((item, idx) => {
            if (eventDateSet.has(item.trade_date)) {
                markPoints.push({
                    coord: [idx, item.low],
                    symbol: 'triangle',
                    symbolSize: 10,
                    symbolRotate: 180,
                    symbolOffset: [0, '100%'],
                    itemStyle: { color: '#f59e0b' },
                    label: { show: false },
                })
            }
        })

        const series: any[] = [
            {
                name: 'K线',
                type: 'candlestick',
                data: values,
                itemStyle: {
                    color: '#ef4444',
                    color0: '#10b981',
                    borderColor: '#ef4444',
                    borderColor0: '#10b981',
                },
                markPoint: markPoints.length > 0 ? { data: markPoints, animation: false } : undefined,
            }
        ]

        if (indicators.ma5) {
            series.push({
                name: 'MA5',
                type: 'line',
                data: calculateMA(5, prices),
                smooth: true,
                lineStyle: { opacity: 0.5 }
            })
        }
        if (indicators.ma20) {
            series.push({
                name: 'MA20',
                type: 'line',
                data: calculateMA(20, prices),
                smooth: true,
                lineStyle: { opacity: 0.5 }
            })
        }
        if (indicators.volume) {
            series.push({
                name: '成交量',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: volumes,
                itemStyle: {
                    color: (params: any) => {
                        return params.data[2] > 0 ? '#ef4444' : '#10b981'
                    }
                }
            })
        }

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                formatter: (params: any) => {
                    const item = params.find((p: any) => p.seriesName === 'K线')
                    if (!item) return ''
                    const data = item.data
                    return `
                        <div class="font-medium">${item.name}</div>
                        <div class="text-xs mt-1">
                            开盘: ${data[1]}<br/>
                            收盘: ${data[2]}<br/>
                            最低: ${data[3]}<br/>
                            最高: ${data[4]}
                        </div>
                    `
                }
            },
            axisPointer: { link: { xAxisIndex: 'all' } },
            grid: [
                { left: '10%', right: '8%', height: '50%' },
                { left: '10%', right: '8%', top: '65%', height: '20%' }
            ],
            xAxis: [
                { type: 'category', data: categories, boundaryGap: false },
                { type: 'category', gridIndex: 1, data: categories, boundaryGap: false, axisLabel: { show: false } }
            ],
            yAxis: [
                { scale: true, splitArea: { show: true } },
                { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } }
            ],
            dataZoom: [
                { type: 'inside', xAxisIndex: [0, 1], start: 50, end: 100 },
                { show: true, xAxisIndex: [0, 1], type: 'slider', top: '90%' }
            ],
            series,
        }
    }, [prices, indicators, dividendEvents])

    const formatDividendDesc = (e: DividendEventItem) => {
        const parts: string[] = []
        if (e.cash_dividend > 0) parts.push(`派息${e.cash_dividend}元`)
        if (e.bonus_ratio > 0) parts.push(`送股${e.bonus_ratio}`)
        if (e.rights_ratio > 0) parts.push(`配股${e.rights_ratio}股(价${e.rights_price})`)
        return parts.join('，') || '无分配'
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">可视化分析</h2>
                    <p className="text-sm text-muted-foreground">专业K线展示与指标叠加</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        className="rounded-xl bg-amber-500 px-4 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        onClick={() => setShowDividendSidebar(!showDividendSidebar)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>
                        除权事件
                    </button>
                    <button
                        className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        onClick={fetchKline}
                        disabled={loading}
                    >
                        {loading && (
                            <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        刷新图表
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="w-64">
                    <label className="text-xs text-muted-foreground">股票 (搜索)</label>
                    <div className="mt-2">
                        <StockSelector
                            value={symbol}
                            stocks={stocks}
                            onChange={(val) => setSymbol(val)}
                        />
                    </div>
                </div>
                <div className="w-40">
                    <label className="text-xs text-muted-foreground">周期</label>
                    <div className="mt-2">
                        <Select
                            value={freq}
                            onChange={setFreq}
                            options={[
                                { value: 'D', label: '日线' },
                                { value: 'W', label: '周线' },
                                { value: 'M', label: '月线' },
                            ]}
                        />
                    </div>
                </div>
                <div className="w-40">
                    <label className="text-xs text-muted-foreground">复权方式</label>
                    <div className="mt-2">
                        <Select
                            value={adjust}
                            onChange={setAdjust}
                            options={[
                                { value: 'none', label: '不复权' },
                                { value: 'qfq', label: '前复权' },
                                { value: 'hfq', label: '后复权' },
                            ]}
                        />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-muted-foreground">起始日期</label>
                    <div className="mt-2 w-40">
                        <DatePicker value={range.start} onChange={(date) => setRange((prev: DateRange) => ({ ...prev, start: date }))} placeholder="开始日期" />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-muted-foreground">结束日期</label>
                    <div className="mt-2 w-40">
                        <DatePicker value={range.end} onChange={(date) => setRange((prev: DateRange) => ({ ...prev, end: date }))} placeholder="结束日期" />
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm flex gap-6 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={indicators.ma5} onChange={(e) => setIndicators(p => ({ ...p, ma5: e.target.checked }))} className="rounded border-border text-primary" />
                    <span>MA5</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={indicators.ma20} onChange={(e) => setIndicators(p => ({ ...p, ma20: e.target.checked }))} className="rounded border-border text-primary" />
                    <span>MA20</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={indicators.volume} onChange={(e) => setIndicators(p => ({ ...p, volume: e.target.checked }))} className="rounded border-border text-primary" />
                    <span>成交量</span>
                </label>
                {loadedAdjust !== 'none' && (
                    <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                        {loadedAdjust === 'qfq' ? '前复权' : '后复权'}模式：所有价格已调整
                    </span>
                )}
            </div>

            <div className="flex gap-4">
                <div className={`rounded-2xl border border-border bg-card p-6 shadow-sm transition-all ${showDividendSidebar ? 'flex-1' : 'w-full'}`}>
                    {loading ? <Loading /> : <ReactECharts option={option} style={{ height: 500 }} notMerge={true} />}
                </div>

                {showDividendSidebar && (
                    <div className="w-80 shrink-0 rounded-2xl border border-border bg-card shadow-sm flex flex-col">
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <h3 className="text-sm font-semibold">除权除息事件</h3>
                            <button
                                className="text-xs bg-amber-500 text-white px-2 py-1 rounded-lg hover:bg-amber-600"
                                onClick={() => setShowEntryPanel(!showEntryPanel)}
                            >
                                {showEntryPanel ? '取消' : '+ 录入'}
                            </button>
                        </div>

                        {showEntryPanel && (
                            <div className="px-4 py-3 border-b border-border bg-amber-50/50 space-y-2">
                                <div>
                                    <label className="text-xs text-muted-foreground">除权日期</label>
                                    <input
                                        type="date"
                                        className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                                        value={entryForm.ex_date}
                                        onChange={(e) => setEntryForm(p => ({ ...p, ex_date: e.target.value }))}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-muted-foreground">每股现金分红(元)</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                                            value={entryForm.cash_dividend}
                                            onChange={(e) => setEntryForm(p => ({ ...p, cash_dividend: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground">送股比例(股/股)</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                                            value={entryForm.bonus_ratio}
                                            onChange={(e) => setEntryForm(p => ({ ...p, bonus_ratio: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground">配股比例(股/股)</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                                            value={entryForm.rights_ratio}
                                            onChange={(e) => setEntryForm(p => ({ ...p, rights_ratio: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground">配股价(元)</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
                                            value={entryForm.rights_price}
                                            onChange={(e) => setEntryForm(p => ({ ...p, rights_price: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <button
                                    className="w-full bg-amber-500 text-white text-sm py-1.5 rounded-lg hover:bg-amber-600"
                                    onClick={handleEntrySubmit}
                                >
                                    提交录入
                                </button>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto max-h-[460px]">
                            {dividendEvents.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                    暂无除权除息事件
                                </div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {dividendEvents.map((e) => (
                                        <div key={e.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-slate-900">{e.ex_date}</span>
                                                <button
                                                    className="text-xs text-red-400 hover:text-red-600"
                                                    onClick={() => handleDeleteEvent(e.id)}
                                                >
                                                    删除
                                                </button>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDividendDesc(e)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z" /></svg>
                            三角标记 = K线上的除权日
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
