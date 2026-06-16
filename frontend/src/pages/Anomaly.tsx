import { useEffect, useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, Play, RefreshCw, BarChart3, AlertTriangle, Activity, Filter, Download, Settings, TrendingUp, Zap } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { AxiosResponse } from 'axios'
import DatePicker from '../components/DatePicker'
import Select from '../components/Select'
import Loading from '../components/Loading'
import StockNameLink from '../components/StockNameLink'

interface AnomalyRuleParam {
    key: string
    label: string
    type: 'slider' | 'select' | 'number'
    default: number | string
    min?: number
    max?: number
    step?: number
    unit?: string
    options?: { value: string; label: string }[]
}

interface AnomalyRuleDef {
    id: string
    name: string
    description: string
    params: AnomalyRuleParam[]
    default_enabled: boolean
}

interface RuleConfig {
    enabled: boolean
    params: Record<string, number | string>
}

interface AnomalyEvent {
    id?: number
    symbol: string
    name: string
    rule_id: string
    rule_name: string
    trigger_date: string
    strength_score: number
    metrics: Record<string, any>
    created_at?: string
}

interface ScanProgress {
    status: 'idle' | 'running' | 'finished' | 'error'
    current: number
    total: number
    message: string
    results: AnomalyEvent[]
}

interface DateRange {
    start: string
    end: string
}

const RULE_ICONS: Record<string, any> = {
    price_change_threshold: TrendingUp,
    volume_surge: Activity,
    consecutive_trend: TrendingUp,
    long_shadow: AlertTriangle,
    amplitude_breakout: Zap,
    price_volume_divergence: BarChart3,
    gap_open: Zap,
    new_high_low: TrendingUp,
}

const getStrengthColor = (score: number): string => {
    if (score >= 0.8) return 'text-red-600 bg-red-50'
    if (score >= 0.6) return 'text-orange-600 bg-orange-50'
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-50'
    return 'text-slate-600 bg-slate-50'
}

const getStrengthLabel = (score: number): string => {
    if (score >= 0.8) return '极强'
    if (score >= 0.6) return '强'
    if (score >= 0.4) return '中等'
    return '弱'
}

const formatMetrics = (metrics: Record<string, any>): string => {
    const parts: string[] = []
    for (const [key, value] of Object.entries(metrics)) {
        if (value === null || value === undefined) continue
        const label = key.replace(/_/g, ' ')
        if (typeof value === 'number') {
            parts.push(`${label}: ${value.toFixed(2)}`)
        } else {
            parts.push(`${label}: ${value}`)
        }
    }
    return parts.join(' | ')
}

export default function Anomaly() {
    const { pushToast } = useToast()

    const [rules, setRules] = useState<AnomalyRuleDef[]>([])
    const [ruleConfigs, setRuleConfigs] = useState<Record<string, RuleConfig>>({})
    const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({})
    const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' })
    const [scanProgress, setScanProgress] = useState<ScanProgress>({
        status: 'idle',
        current: 0,
        total: 0,
        message: '',
        results: [],
    })
    const [scanResults, setScanResults] = useState<AnomalyEvent[]>([])
    const [historicalEvents, setHistoricalEvents] = useState<AnomalyEvent[]>([])
    const [historicalTotal, setHistoricalTotal] = useState(0)
    const [stats, setStats] = useState<{ rule_id: string; rule_name: string; count: number }[]>([])
    const [loading, setLoading] = useState(false)
    const [historicalLoading, setHistoricalLoading] = useState(false)

    const [filterRule, setFilterRule] = useState('')
    const [filterSymbol, setFilterSymbol] = useState('')
    const [filterMinStrength, setFilterMinStrength] = useState(0)
    const [filterDateRange, setFilterDateRange] = useState<DateRange>({ start: '', end: '' })
    const [currentPage, setCurrentPage] = useState(1)
    const pageSize = 20

    const [activeTab, setActiveTab] = useState<'scan' | 'history' | 'stats'>('scan')

    useEffect(() => {
        loadRules()
        loadStats()
    }, [])

    useEffect(() => {
        if (scanProgress.status === 'running') {
            const interval = setInterval(() => {
                api.get('/anomaly/scan/progress')
                    .then((res: AxiosResponse<ScanProgress>) => {
                        setScanProgress(res.data)
                        if (res.data.results && res.data.results.length > 0) {
                            setScanResults(res.data.results)
                        }
                        if (res.data.status === 'finished') {
                            pushToast(`扫描完成，共发现 ${res.data.results.length} 个异动事件`, 'success')
                            loadStats()
                            loadHistoricalEvents()
                        } else if (res.data.status === 'error') {
                            pushToast(res.data.message || '扫描失败', 'error')
                        }
                    })
                    .catch(() => {})
            }, 1000)
            return () => clearInterval(interval)
        }
    }, [scanProgress.status])

    const loadRules = async () => {
        try {
            const res = await api.get<AnomalyRuleDef[]>('/anomaly/rules')
            setRules(res.data)

            const initialConfigs: Record<string, RuleConfig> = {}
            const initialExpanded: Record<string, boolean> = {}
            res.data.forEach(rule => {
                const params: Record<string, number | string> = {}
                rule.params.forEach(p => {
                    params[p.key] = p.default
                })
                initialConfigs[rule.id] = {
                    enabled: rule.default_enabled,
                    params,
                }
                initialExpanded[rule.id] = false
            })
            setRuleConfigs(initialConfigs)
            setExpandedRules(initialExpanded)
        } catch {
            pushToast('加载规则列表失败', 'error')
        }
    }

    const loadStats = async () => {
        try {
            const res = await api.get<{ rule_id: string; rule_name: string; count: number }[]>('/anomaly/stats')
            setStats(res.data)
        } catch {
            pushToast('加载统计数据失败', 'error')
        }
    }

    const loadHistoricalEvents = useCallback(async () => {
        setHistoricalLoading(true)
        try {
            const payload: any = {
                page: currentPage,
                page_size: pageSize,
                min_strength: filterMinStrength > 0 ? filterMinStrength : undefined,
            }
            if (filterRule) payload.rule_id = filterRule
            if (filterSymbol) payload.symbol = filterSymbol
            if (filterDateRange.start) payload.start_date = filterDateRange.start
            if (filterDateRange.end) payload.end_date = filterDateRange.end

            const res = await api.post<{ total: number; items: AnomalyEvent[] }>('/anomaly/events', payload)
            setHistoricalEvents(res.data.items)
            setHistoricalTotal(res.data.total)
        } catch {
            pushToast('加载历史事件失败', 'error')
        } finally {
            setHistoricalLoading(false)
        }
    }, [currentPage, filterRule, filterSymbol, filterMinStrength, filterDateRange])

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistoricalEvents()
        }
    }, [activeTab, currentPage, filterRule, filterSymbol, filterMinStrength, filterDateRange, loadHistoricalEvents])

    const toggleRule = (ruleId: string) => {
        setRuleConfigs(prev => ({
            ...prev,
            [ruleId]: {
                ...prev[ruleId],
                enabled: !prev[ruleId]?.enabled,
            },
        }))
    }

    const toggleExpand = (ruleId: string) => {
        setExpandedRules(prev => ({
            ...prev,
            [ruleId]: !prev[ruleId],
        }))
    }

    const updateParam = (ruleId: string, paramKey: string, value: number | string) => {
        setRuleConfigs(prev => ({
            ...prev,
            [ruleId]: {
                ...prev[ruleId],
                params: {
                    ...prev[ruleId]?.params,
                    [paramKey]: value,
                },
            },
        }))
    }

    const runScan = () => {
        if (!dateRange.start || !dateRange.end) {
            pushToast('请选择扫描日期范围', 'error')
            return
        }

        const enabledRules = Object.entries(ruleConfigs).filter(([, config]) => config.enabled)
        if (enabledRules.length === 0) {
            pushToast('请至少启用一个规则', 'error')
            return
        }

        setLoading(true)
        setScanResults([])
        pushToast('开始扫描异动事件...', 'info')

        api.post('/anomaly/scan', {
            start_date: dateRange.start,
            end_date: dateRange.end,
            rule_configs: ruleConfigs,
        })
            .then(() => {
                setScanProgress({
                    status: 'running',
                    current: 0,
                    total: 0,
                    message: '正在启动扫描...',
                    results: [],
                })
            })
            .catch(() => pushToast('启动扫描失败', 'error'))
            .finally(() => setLoading(false))
    }

    const renderParamInput = (rule: AnomalyRuleDef, param: AnomalyRuleParam) => {
        const config = ruleConfigs[rule.id]
        const value = config?.params?.[param.key] ?? param.default

        if (param.type === 'slider' && typeof value === 'number') {
            return (
                <div key={param.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-600">{param.label}</label>
                        <span className="text-xs font-bold text-primary">
                            {value}{param.unit || ''}
                        </span>
                    </div>
                    <input
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step || 1}
                        value={value}
                        onChange={(e) => updateParam(rule.id, param.key, parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                        <span>{param.min}{param.unit || ''}</span>
                        <span>{param.max}{param.unit || ''}</span>
                    </div>
                </div>
            )
        }

        if (param.type === 'select' && param.options) {
            return (
                <div key={param.key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{param.label}</label>
                    <Select
                        value={String(value)}
                        options={param.options}
                        onChange={(v) => updateParam(rule.id, param.key, v)}
                    />
                </div>
            )
        }

        if (param.type === 'number') {
            return (
                <div key={param.key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{param.label}</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={param.min}
                            max={param.max}
                            step={param.step || 1}
                            value={value as number}
                            onChange={(e) => updateParam(rule.id, param.key, parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-primary"
                        />
                        {param.unit && <span className="text-xs text-slate-500">{param.unit}</span>}
                    </div>
                </div>
            )
        }

        return null
    }

    const statsChartOption = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'category',
            data: stats.map(s => s.rule_name.length > 8 ? s.rule_name.slice(0, 8) + '...' : s.rule_name),
            axisLabel: {
                rotate: 30,
                fontSize: 11,
            },
        },
        yAxis: {
            type: 'value',
            name: '触发次数',
        },
        series: [{
            data: stats.map(s => s.count),
            type: 'bar',
            itemStyle: {
                color: {
                    type: 'linear',
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: '#3b82f6' },
                        { offset: 1, color: '#60a5fa' },
                    ],
                },
                borderRadius: [8, 8, 0, 0],
            },
            barWidth: '60%',
        }],
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">异动监控</h2>
                    <p className="text-sm text-muted-foreground">自动捕捉不正常的价量行为，发现市场异动信号</p>
                </div>
            </div>

            <div className="flex gap-2 border-b border-slate-200">
                {[
                    { id: 'scan', label: '实时扫描', icon: Activity },
                    { id: 'history', label: '历史事件', icon: BarChart3 },
                    { id: 'stats', label: '规则统计', icon: Zap },
                ].map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
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

            {activeTab === 'scan' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                        <p className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-500" />
                            <span>系统将对全市场股票在指定日期范围内，按照启用的规则扫描异动事件。扫描结果将自动保存到历史记录中。</span>
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <label className="text-xs text-muted-foreground">起始日期</label>
                            <div className="mt-2">
                                <DatePicker
                                    value={dateRange.start}
                                    onChange={(date) => setDateRange(prev => ({ ...prev, start: date }))}
                                    placeholder="选择起始日期"
                                />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <label className="text-xs text-muted-foreground">结束日期</label>
                            <div className="mt-2">
                                <DatePicker
                                    value={dateRange.end}
                                    onChange={(date) => setDateRange(prev => ({ ...prev, end: date }))}
                                    placeholder="选择结束日期"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Settings size={20} className="text-primary" />
                                规则配置
                            </h3>
                            <div className="text-sm text-slate-500">
                                已启用 {Object.values(ruleConfigs).filter(c => c.enabled).length} / {rules.length} 个规则
                            </div>
                        </div>

                        {rules.map(rule => {
                            const Icon = RULE_ICONS[rule.id] || Settings
                            const config = ruleConfigs[rule.id]
                            const isExpanded = expandedRules[rule.id]
                            const isEnabled = config?.enabled ?? false

                            return (
                                <div
                                    key={rule.id}
                                    className={`rounded-2xl border-2 transition-all overflow-hidden ${
                                        isEnabled
                                            ? 'border-primary/30 bg-white'
                                            : 'border-slate-100 bg-slate-50'
                                    }`}
                                >
                                    <div
                                        className="flex items-center justify-between p-4 cursor-pointer"
                                        onClick={() => toggleExpand(rule.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                                                isEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-400'
                                            }`}>
                                                <Icon size={20} />
                                            </div>
                                            <div>
                                                <h4 className={`font-semibold ${isEnabled ? 'text-slate-900' : 'text-slate-400'}`}>
                                                    {rule.name}
                                                </h4>
                                                <p className="text-xs text-slate-500">{rule.description}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleRule(rule.id)
                                                }}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                    isEnabled ? 'bg-primary' : 'bg-slate-300'
                                                }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                        isEnabled ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                                />
                                            </button>
                                            {isExpanded ? (
                                                <ChevronUp size={20} className="text-slate-400" />
                                            ) : (
                                                <ChevronDown size={20} className="text-slate-400" />
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                                            <div className="grid grid-cols-2 gap-4 pt-4">
                                                {rule.params.map(param => renderParamInput(rule, param))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-500">
                            {scanProgress.status === 'running' && (
                                <span className="flex items-center gap-2">
                                    <RefreshCw size={16} className="animate-spin text-primary" />
                                    扫描进度：{scanProgress.current} / {scanProgress.total || '?'} - {scanProgress.message}
                                </span>
                            )}
                            {scanProgress.status === 'finished' && (
                                <span className="text-emerald-600 font-medium">
                                    {scanProgress.message}
                                </span>
                            )}
                            {scanProgress.status === 'error' && (
                                <span className="text-red-600 font-medium">
                                    {scanProgress.message}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={runScan}
                            disabled={loading || scanProgress.status === 'running'}
                            className="rounded-xl bg-primary px-6 py-2.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-primary/20"
                        >
                            {loading || scanProgress.status === 'running' ? (
                                <RefreshCw size={16} className="animate-spin" />
                            ) : (
                                <Play size={16} />
                            )}
                            {scanProgress.status === 'running' ? '扫描中...' : '开始扫描'}
                        </button>
                    </div>

                    {(scanProgress.status === 'running' || scanResults.length > 0) && (
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <AlertTriangle size={20} className="text-amber-500" />
                                {scanProgress.status === 'running' ? '实时扫描结果' : '扫描结果'}
                                <span className="text-sm font-normal text-slate-500">
                                    （已发现 {scanResults.length} 个事件
                                    {scanProgress.status === 'running' && scanProgress.total > 0 && `，扫描进度 ${scanProgress.current}/${scanProgress.total}`}
                                    ）
                                </span>
                            </h3>
                            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">触发日期</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">股票</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">规则</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">强度</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">关键指标</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {scanResults.length === 0 && scanProgress.status === 'running' ? (
                                                <tr>
                                                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                                        <RefreshCw size={32} className="mx-auto mb-3 animate-spin text-primary opacity-70" />
                                                        <p className="text-sm">正在扫描中，暂未发现异动事件...</p>
                                                        <p className="text-xs mt-1 text-slate-400">每发现新的异动会实时更新在此处</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                scanResults.slice(0, 50).map((event, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50">
                                                        <td className="px-4 py-3 text-sm font-mono text-slate-600">
                                                            {event.trigger_date}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <StockNameLink symbol={event.symbol} name={event.name} />
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-slate-700">{event.rule_name}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getStrengthColor(event.strength_score)}`}>
                                                                {getStrengthLabel(event.strength_score)} ({(event.strength_score * 100).toFixed(0)}%)
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-xs text-slate-500 max-w-md truncate" title={formatMetrics(event.metrics)}>
                                                            {formatMetrics(event.metrics)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                {scanResults.length > 50 && (
                                    <div className="px-4 py-3 bg-slate-50 text-center text-sm text-slate-500">
                                        仅显示前 50 条结果，完整记录请查看历史事件页面
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <label className="text-xs text-muted-foreground">规则类型</label>
                            <div className="mt-2">
                                <Select
                                    value={filterRule}
                                    options={[
                                        { value: '', label: '全部规则' },
                                        ...rules.map(r => ({ value: r.id, label: r.name })),
                                    ]}
                                    onChange={setFilterRule}
                                />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <label className="text-xs text-muted-foreground">股票代码/名称</label>
                            <div className="mt-2">
                                <input
                                    type="text"
                                    value={filterSymbol}
                                    onChange={(e) => setFilterSymbol(e.target.value)}
                                    placeholder="输入代码或名称"
                                    className="w-full px-4 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-primary"
                                />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <label className="text-xs text-muted-foreground">起始日期</label>
                            <div className="mt-2">
                                <DatePicker
                                    value={filterDateRange.start}
                                    onChange={(date) => setFilterDateRange(prev => ({ ...prev, start: date }))}
                                    placeholder="选择起始日期"
                                />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <label className="text-xs text-muted-foreground">结束日期</label>
                            <div className="mt-2">
                                <DatePicker
                                    value={filterDateRange.end}
                                    onChange={(date) => setFilterDateRange(prev => ({ ...prev, end: date }))}
                                    placeholder="选择结束日期"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-slate-400" />
                            <label className="text-sm text-slate-600">最小强度：</label>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={filterMinStrength * 100}
                                onChange={(e) => setFilterMinStrength(parseFloat(e.target.value) / 100)}
                                className="w-40 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <span className="text-sm font-bold text-primary">
                                {filterMinStrength > 0 ? `${(filterMinStrength * 100).toFixed(0)}%` : '不限'}
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setFilterRule('')
                                setFilterSymbol('')
                                setFilterMinStrength(0)
                                setFilterDateRange({ start: '', end: '' })
                                setCurrentPage(1)
                            }}
                            className="ml-auto text-sm text-slate-500 hover:text-primary transition-colors"
                        >
                            重置筛选
                        </button>
                    </div>

                    {historicalLoading ? (
                        <Loading />
                    ) : (
                        <div className="rounded-2xl border border-border bg-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">触发日期</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">股票</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">规则</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">强度</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">关键指标</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">记录时间</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {historicalEvents.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                                                    <Download size={40} className="mx-auto mb-3 opacity-50" />
                                                    <p>暂无历史异动事件</p>
                                                    <p className="text-xs mt-1">请先运行扫描以发现异动事件</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            historicalEvents.map((event) => (
                                                <tr key={event.id} className="hover:bg-slate-50/50">
                                                    <td className="px-4 py-3 text-sm font-mono text-slate-600">
                                                        {event.trigger_date}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <StockNameLink symbol={event.symbol} name={event.name} />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-700">{event.rule_name}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getStrengthColor(event.strength_score)}`}>
                                                            {getStrengthLabel(event.strength_score)} ({(event.strength_score * 100).toFixed(0)}%)
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate" title={formatMetrics(event.metrics)}>
                                                        {formatMetrics(event.metrics)}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                                                        {event.created_at?.slice(0, 19)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {historicalTotal > pageSize && (
                                <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
                                    <div className="text-sm text-slate-500">
                                        共 {historicalTotal} 条记录，第 {currentPage} / {Math.ceil(historicalTotal / pageSize)} 页
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            上一页
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(p => p + 1)}
                                            disabled={currentPage >= Math.ceil(historicalTotal / pageSize)}
                                            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            下一页
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'stats' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <BarChart3 size={20} className="text-primary" />
                            规则触发次数统计
                        </h3>
                        {stats.length === 0 ? (
                            <div className="py-12 text-center text-slate-400">
                                <BarChart3 size={40} className="mx-auto mb-3 opacity-50" />
                                <p>暂无统计数据</p>
                                <p className="text-xs mt-1">请先运行扫描以生成统计数据</p>
                            </div>
                        ) : (
                            <ReactECharts option={statsChartOption} style={{ height: '400px' }} />
                        )}
                    </div>

                    {stats.length > 0 && (
                        <div className="rounded-2xl border border-border bg-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">排名</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">规则名称</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">触发次数</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">占比</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(() => {
                                            const total = stats.reduce((sum, s) => sum + s.count, 0)
                                            return stats.map((stat, idx) => (
                                                <tr key={stat.rule_id} className="hover:bg-slate-50/50">
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
                                                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{stat.rule_name}</td>
                                                    <td className="px-4 py-3 text-sm font-bold text-primary">{stat.count}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-primary rounded-full"
                                                                    style={{ width: `${(stat.count / total) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs text-slate-500">
                                                                {((stat.count / total) * 100).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
