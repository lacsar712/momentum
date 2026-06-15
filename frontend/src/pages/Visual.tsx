import { useEffect, useMemo, useState } from 'react'
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

interface DateRange {
    start: string
    end: string
}

export default function Visual() {
    const { pushToast } = useToast()
    const [stocks, setStocks] = useState<StockItem[]>([])
    const [loading, setLoading] = useState(false)
    const [symbol, setSymbol] = useState('')
    const [range, setRange] = useState<DateRange>({ start: '', end: '' })
    const [prices, setPrices] = useState<PriceItem[]>([])

    // New controls
    const [freq, setFreq] = useState('D')
    const [indicators, setIndicators] = useState({
        ma5: true,
        ma20: true,
        volume: true
    })

    useEffect(() => {
        api.get<{ items: StockItem[] }>('/stocks', { params: { limit: 10000 } }).then((res) => {
            setStocks(res.data.items)
            if (res.data.items.length > 0) {
                setSymbol(res.data.items[0].symbol)
            }
        })
    }, [])

    const fetchKline = () => {
        if (!symbol || !range.start || !range.end) {
            pushToast('请选择股票与时间范围', 'error')
            return
        }
        setLoading(true)
        api.post('/data/price_range', {
            symbol,
            start_date: range.start,
            end_date: range.end,
            frequency: freq
        })
            .then((res: AxiosResponse<PriceItem[]>) => setPrices(res.data))
            .catch(() => pushToast('K线数据加载失败', 'error'))
            .finally(() => setLoading(false))
    }

    // MA Calculation Helper
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
    }, [prices, indicators])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">可视化分析</h2>
                    <p className="text-sm text-muted-foreground">专业K线展示与指标叠加</p>
                </div>
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
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                {loading ? <Loading /> : <ReactECharts option={option} style={{ height: 500 }} notMerge={true} />}
            </div>
        </div>
    )
}
