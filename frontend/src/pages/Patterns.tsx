import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import Loading from '../components/Loading'
import { useToast } from '../components/Toast'
import { AxiosResponse } from 'axios'
import DatePicker from '../components/DatePicker'

interface PatternResult {
    symbol: string
    name: string
    patterns: { pattern_name: string; detected_date: string; success_rate: number }[]
}

interface DateRange {
    start: string
    end: string
}

export default function Patterns() {
    const { pushToast } = useToast()
    const [patterns, setPatterns] = useState<string[]>([])
    const [selected, setSelected] = useState<string[]>([])
    const [results, setResults] = useState<PatternResult[]>([])
    const [loading, setLoading] = useState(false)
    const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' })
    const [windowSize, setWindowSize] = useState(5)

    useEffect(() => {
        api.get<string[]>('/patterns/library')
            .then((res: AxiosResponse<string[]>) => setPatterns(res.data))
            .catch(() => pushToast('形态库加载失败', 'error'))
    }, [])

    const togglePattern = (name: string) => {
        setSelected((prev: string[]) => prev.includes(name) ? prev.filter((p: string) => p !== name) : [...prev, name])
    }

    const runScan = () => {
        if (!dateRange.start || !dateRange.end || selected.length === 0) {
            pushToast('请选择形态并设置日期范围', 'error')
            return
        }
        setLoading(true)
        pushToast('正在识别形态，请稍候...', 'info')
        api.post('/patterns/scan', {
            patterns: selected,
            start_date: dateRange.start,
            end_date: dateRange.end,
            params: { window: windowSize },
        })
            .then((res: AxiosResponse<PatternResult[]>) => {
                setResults(res.data)
                pushToast(`识别完成，共 ${res.data.length} 只股票匹配`, 'success')
            })
            .catch(() => pushToast('形态识别失败，请检查登录状态', 'error'))
            .finally(() => setLoading(false))
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">形态选股</h2>
                    <p className="text-sm text-muted-foreground">识别经典K线形态并统计成功率</p>
                </div>
                <button
                    className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    onClick={runScan}
                    disabled={loading}
                >
                    {loading && (
                        <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    )}
                    开始识别
                </button>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                <p>提示：系统会在所选区间内，使用“识别窗口”长度判断近期是否形成指定形态。</p>
                <p className="mt-2">结果按股票展示，胜率为基于形态得分的估计值，用于对比排序，并非收益承诺。</p>
            </div>
            <div className="grid grid-cols-4 gap-4">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <label className="text-xs text-muted-foreground">起始日期</label>
                    <div className="mt-2">
                        <DatePicker value={dateRange.start} onChange={(date) => setDateRange((prev) => ({ ...prev, start: date }))} placeholder="选择起始日期" />
                    </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <label className="text-xs text-muted-foreground">结束日期</label>
                    <div className="mt-2">
                        <DatePicker value={dateRange.end} onChange={(date) => setDateRange((prev) => ({ ...prev, end: date }))} placeholder="选择结束日期" />
                    </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <label className="text-xs text-muted-foreground">识别窗口长度</label>
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            type="range" min="3" max="20" step="1"
                            value={windowSize}
                            onChange={(e) => setWindowSize(parseInt(e.target.value))}
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-secondary"
                        />
                        <span className="text-sm font-medium w-6 text-center">{windowSize}</span>
                    </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground">已选形态</p>
                    <p className="mt-2 text-sm">{selected.length} 个</p>
                </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-lg font-semibold">形态库</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                    {patterns.map((name) => (
                        <button
                            key={name}
                            onClick={() => togglePattern(name)}
                            className={`rounded-full border px-4 py-2 text-xs ${selected.includes(name) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                                }`}
                        >
                            {name}
                        </button>
                    ))}
                </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-lg font-semibold">识别结果</h3>
                {loading ? (
                    <Loading />
                ) : (
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        {results.map((item) => (
                            <div key={item.symbol} className="rounded-xl border border-border px-4 py-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-lg">{item.name} <span className="text-sm text-muted-foreground ml-1">{item.symbol}</span></span>
                                </div>
                                <div className="mt-3 flex flex-col gap-2">
                                    {item.patterns.map((p) => (
                                        <div key={p.pattern_name} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-primary">{p.pattern_name}</span>
                                                <span className="text-muted-foreground">{p.detected_date} 触发</span>
                                            </div>
                                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white shadow-sm dark:bg-emerald-500">
                                                胜率 {Math.round(p.success_rate * 100)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {results.length === 0 && <p className="text-muted-foreground text-sm col-span-2 text-center py-8">暂无匹配结果</p>}
                    </div>
                )}
            </div>
        </div>
    )
}
