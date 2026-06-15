import ReactECharts from 'echarts-for-react'
import { FileDown, LayoutGrid, List as ListIcon, HelpCircle, TrendingUp, Activity, BarChart3, BookOpen, Zap, Waves } from 'lucide-react'

import { ChangeEvent, useEffect, useState } from 'react'
import { z } from 'zod'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { AxiosResponse } from 'axios'

interface ScreeningItem {
    symbol: string
    name: string
    market: string
    industry?: string
    market_cap?: number
    pe_ratio?: number
    pb_ratio?: number
    momentum?: number
    rsi?: number
}

interface Preset {
    id?: number
    name: string
    payload: { filters: any }
}

const presetSchema = z.object({
    name: z.string().min(1, "请输入名称"),
})

// 字段配置：包含标签、描述、提示、示例等信息
const FIELD_CONFIGS = {
    basic: {
        title: '基本面指标',
        description: '基于公司财务状况和估值的筛选条件',
        icon: BookOpen,
        fields: [
            {
                key: 'market_cap',
                label: '总市值',
                unit: '亿元',
                description: '公司股票总价值，反映公司规模大小',
                tooltip: '大市值(>500亿)通常是行业龙头，稳定性好；中小市值股票成长性可能更强，但风险也更高',
                minPlaceholder: '如：100（表示100亿以上）',
                maxPlaceholder: '如：1000（表示1000亿以下）',
                examples: ['大盘股：>500亿', '中盘股：100-500亿', '小盘股：<100亿'],
                multiplier: 100000000, // 用户输入亿，转换为元
            },
            {
                key: 'pe',
                label: '市盈率 (PE)',
                unit: '倍',
                description: '股价与每股收益的比值，衡量估值高低',
                tooltip: 'PE越低说明股票越便宜。一般15-25倍为合理区间，不同行业差异较大',
                minPlaceholder: '如：0（不限制最低）',
                maxPlaceholder: '如：30（排除过高估值）',
                examples: ['低估值：<15倍', '合理估值：15-25倍', '成长股：25-50倍'],
                multiplier: 1,
            },
            {
                key: 'pb',
                label: '市净率 (PB)',
                unit: '倍',
                description: '股价与每股净资产的比值，衡量资产价值',
                tooltip: 'PB<1说明股价低于净资产（可能被低估）。银行股通常PB低，科技股PB高',
                minPlaceholder: '如：0.5（避免资产减值风险）',
                maxPlaceholder: '如：5（排除泡沫股）',
                examples: ['破净股：<1倍', '价值股：1-3倍', '成长股：>3倍'],
                multiplier: 1,
            },
        ]
    },
    technical: {
        title: '技术面指标',
        description: '基于价格走势和交易信号的筛选条件',
        icon: Activity,
        fields: [
            {
                key: 'rsi',
                label: 'RSI 相对强弱指数',
                unit: '',
                description: '衡量股票超买或超卖程度（0-100）',
                tooltip: 'RSI<30可能超卖（买入机会），RSI>70可能超买（卖出信号）。50为中性',
                minPlaceholder: '如：30（寻找超卖股）',
                maxPlaceholder: '如：70（排除超买股）',
                examples: ['超卖区：<30', '中性区：30-70', '超买区：>70'],
                multiplier: 1,
            }
        ],
        checkboxes: [
            {
                key: 'macd_positive',
                label: 'MACD 金叉信号',
                description: '短期均线上穿长期均线，是买入信号',
                tooltip: '当MACD快线（DIF）上穿慢线（DEA）时触发，表示短期趋势转强',
            },
            {
                key: 'kdj_positive',
                label: 'KDJ 金叉信号',
                description: 'K线上穿D线，是买入信号',
                tooltip: '当KDJ的K线上穿D线时触发，结合J线判断更准确',
            }
        ]
    },
    factor: {
        title: '量化因子',
        description: '基于量化模型计算的专业选股因子',
        icon: Zap,
        fields: [
            {
                key: 'momentum',
                label: '动量因子',
                unit: '%',
                description: '近20个交易日的涨跌幅度',
                tooltip: '正值表示上涨趋势，负值表示下跌趋势。动量投资策略认为强者恒强',
                minPlaceholder: '如：5（表示涨幅>5%）',
                maxPlaceholder: '如：30（表示涨幅<30%）',
                examples: ['弱势股：<0%', '平稳股：0-10%', '强势股：>10%'],
                multiplier: 0.01, // 用户输入百分比，转换为小数
            },
            {
                key: 'volatility',
                label: '波动率因子',
                unit: '%',
                description: '价格波动的剧烈程度（日收益率标准差）',
                tooltip: '高波动意味着高风险高收益，低波动意味着走势稳定。一般1-3%为正常',
                minPlaceholder: '如：1（最低波动1%）',
                maxPlaceholder: '如：5（最高波动5%）',
                examples: ['低波动：<1%', '中等波动：1-3%', '高波动：>3%'],
                multiplier: 0.01,
            },
            {
                key: 'liquidity',
                label: '流动性因子',
                unit: '万手',
                description: '近20日平均日成交量',
                tooltip: '高流动性股票买卖容易，滑点小。机构投资偏好高流动性股票',
                minPlaceholder: '如：100（日成交>100万手）',
                maxPlaceholder: '如：10000（排除超大资金股）',
                examples: ['低流动：<50万手', '中等流动：50-500万手', '高流动：>500万手'],
                multiplier: 10000, // 用户输入万手，转换为手
            },
        ]
    }
}

// 提示气泡组件
function Tooltip({ text }: { text: string }) {
    const [show, setShow] = useState(false)
    return (
        <div className="relative inline-block ml-1.5">
            <HelpCircle
                size={14}
                className="text-slate-400 hover:text-primary cursor-help transition-colors"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />
            {show && (
                <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg shadow-lg">
                    {text}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
                </div>
            )}
        </div>
    )
}

// 字段输入组件
function FieldInput({
    config,
    minValue,
    maxValue,
    onMinChange,
    onMaxChange
}: {
    config: typeof FIELD_CONFIGS.basic.fields[0]
    minValue: string
    maxValue: string
    onMinChange: (v: string) => void
    onMaxChange: (v: string) => void
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                    <span className="font-medium text-slate-800">{config.label}</span>
                    {config.unit && <span className="text-xs text-slate-400 ml-1">({config.unit})</span>}
                    <Tooltip text={config.tooltip} />
                </div>
            </div>

            {/* 描述 */}
            <p className="text-xs text-slate-500 mb-3">{config.description}</p>

            {/* 输入区域 */}
            <div className="flex items-center gap-2">
                <div className="flex-1">
                    <label className="text-xs text-slate-400 mb-1 block">最小值</label>
                    <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                        placeholder={config.minPlaceholder}
                        value={minValue}
                        onChange={(e) => onMinChange(e.target.value)}
                    />
                </div>
                <span className="text-slate-300 pt-5">—</span>
                <div className="flex-1">
                    <label className="text-xs text-slate-400 mb-1 block">最大值</label>
                    <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                        placeholder={config.maxPlaceholder}
                        value={maxValue}
                        onChange={(e) => onMaxChange(e.target.value)}
                    />
                </div>
            </div>

            {/* 示例参考 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
                {config.examples.map((ex, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                        {ex}
                    </span>
                ))}
            </div>
        </div>
    )
}

export default function Screening() {
    const { pushToast } = useToast()
    const [loading, setLoading] = useState(false)
    const [items, setItems] = useState<ScreeningItem[]>([])
    const [presets, setPresets] = useState<Preset[]>([])
    const [presetOpen, setPresetOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null)

    const [presetName, setPresetName] = useState('')

    // View Mode
    const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')
    const [activeTab, setActiveTab] = useState<'basic' | 'technical' | 'factor'>('basic')

    const [filters, setFilters] = useState({
        // Basic (用户输入的是亿元)
        market_cap_min: '',
        market_cap_max: '',
        pe_min: '',
        pe_max: '',
        pb_min: '',
        pb_max: '',
        // Factor (用户输入的是百分比或万手)
        momentum_min: '',
        momentum_max: '',
        volatility_min: '',
        volatility_max: '',
        liquidity_min: '',
        liquidity_max: '',
        // Technical
        rsi_min: '',
        rsi_max: '',
        macd_positive: false,
        kdj_positive: false,
    })

    const loadPresets = () => {
        api.get('/screening/preset')
            .then((res: AxiosResponse<Preset[]>) => setPresets(res.data))
            .catch(() => pushToast('筛选方案加载失败', 'error'))
    }

    useEffect(() => {
        loadPresets()
    }, [])

    const onDeleteClick = (e: React.MouseEvent, preset: Preset) => {
        e.stopPropagation()
        setPresetToDelete(preset)
        setDeleteModalOpen(true)
    }

    const confirmDelete = () => {
        if (!presetToDelete) return
        api.delete(`/screening/preset?name=${encodeURIComponent(presetToDelete.name)}`)
            .then(() => {
                pushToast('方案已删除', 'success')
                setDeleteModalOpen(false)
                setPresetToDelete(null)
                loadPresets()
            })
            .catch(() => pushToast('删除失败', 'error'))
    }

    const runScreening = (filtersOverride?: typeof filters) => {
        setLoading(true)
        pushToast('正在筛选股票，请稍候...', 'info')
        const currentFilters = filtersOverride || filters
        // 转换用户友好的输入为API需要的格式
        api.post('/screening/run', {
            basic_filters: {
                market_cap_min: currentFilters.market_cap_min ? Number(currentFilters.market_cap_min) * 100000000 : undefined,
                market_cap_max: currentFilters.market_cap_max ? Number(currentFilters.market_cap_max) * 100000000 : undefined,
                pe_min: currentFilters.pe_min ? Number(currentFilters.pe_min) : undefined,
                pe_max: currentFilters.pe_max ? Number(currentFilters.pe_max) : undefined,
                pb_min: currentFilters.pb_min ? Number(currentFilters.pb_min) : undefined,
                pb_max: currentFilters.pb_max ? Number(currentFilters.pb_max) : undefined,
            },
            factor_filters: {
                momentum_min: currentFilters.momentum_min ? Number(currentFilters.momentum_min) / 100 : undefined,
                momentum_max: currentFilters.momentum_max ? Number(currentFilters.momentum_max) / 100 : undefined,
                volatility_min: currentFilters.volatility_min ? Number(currentFilters.volatility_min) / 100 : undefined,
                volatility_max: currentFilters.volatility_max ? Number(currentFilters.volatility_max) / 100 : undefined,
                liquidity_min: currentFilters.liquidity_min ? Number(currentFilters.liquidity_min) * 10000 : undefined,
                liquidity_max: currentFilters.liquidity_max ? Number(currentFilters.liquidity_max) * 10000 : undefined,
            },
            technical_filters: {
                rsi_min: currentFilters.rsi_min ? Number(currentFilters.rsi_min) : undefined,
                rsi_max: currentFilters.rsi_max ? Number(currentFilters.rsi_max) : undefined,
                macd_positive: currentFilters.macd_positive,
                kdj_positive: currentFilters.kdj_positive,
            }
        })
            .then((res: AxiosResponse<{ items: ScreeningItem[] }>) => {
                setItems(res.data.items)
                pushToast(`筛选完成，共 ${res.data.items.length} 只股票`, 'success')
            })
            .catch(() => pushToast('选股筛选失败', 'error'))
            .finally(() => setLoading(false))
    }

    const exportResults = (type: 'csv' | 'xlsx') => {
        api.post('/screening/export', {
            file_type: type,
            basic_filters: {
                market_cap_min: filters.market_cap_min ? Number(filters.market_cap_min) * 100000000 : undefined,
                market_cap_max: filters.market_cap_max ? Number(filters.market_cap_max) * 100000000 : undefined,
                pe_min: filters.pe_min ? Number(filters.pe_min) : undefined,
                pe_max: filters.pe_max ? Number(filters.pe_max) : undefined,
                pb_min: filters.pb_min ? Number(filters.pb_min) : undefined,
                pb_max: filters.pb_max ? Number(filters.pb_max) : undefined,
            },
            factor_filters: {
                momentum_min: filters.momentum_min ? Number(filters.momentum_min) / 100 : undefined,
                momentum_max: filters.momentum_max ? Number(filters.momentum_max) / 100 : undefined,
                volatility_min: filters.volatility_min ? Number(filters.volatility_min) / 100 : undefined,
                volatility_max: filters.volatility_max ? Number(filters.volatility_max) / 100 : undefined,
                liquidity_min: filters.liquidity_min ? Number(filters.liquidity_min) * 10000 : undefined,
                liquidity_max: filters.liquidity_max ? Number(filters.liquidity_max) * 10000 : undefined,
            },
            technical_filters: {
                rsi_min: filters.rsi_min ? Number(filters.rsi_min) : undefined,
                rsi_max: filters.rsi_max ? Number(filters.rsi_max) : undefined,
                macd_positive: filters.macd_positive,
                kdj_positive: filters.kdj_positive,
            }
        }, { responseType: 'blob' })
            .then((res) => {
                const url = window.URL.createObjectURL(new Blob([res.data]))
                const link = document.createElement('a')
                link.href = url
                link.setAttribute('download', `screening_result.${type}`)
                document.body.appendChild(link)
                link.click()
            })
            .catch((err) => {
                console.error(err)
                pushToast('导出失败，请稍后重试', 'error')
            })
            .catch(() => pushToast('导出失败', 'error'))
    }

    const savePreset = () => {
        const parsed = presetSchema.safeParse({ name: presetName })
        if (!parsed.success) {
            pushToast('请输入有效方案名称', 'error')
            return
        }
        if (presets.length >= 6) {
            pushToast('最多只能保存6条方案，请先删除旧方案', 'error')
            return
        }
        api.post('/screening/preset', { name: presetName, payload: { filters } })
            .then(() => {
                pushToast('筛选方案已保存', 'success')
                setPresetOpen(false)
                setPresetName('')
                loadPresets()
            })
            .catch(() => pushToast('保存方案失败', 'error'))
    }

    const applyPreset = (preset: Preset) => {
        const next = preset.payload
        if (next && next.filters) {
            setFilters(prev => ({ ...prev, ...next.filters }))
            runScreening(next.filters)
            pushToast(`已加载方案并筛选：${preset.name}`, 'success')

            // Auto-switch tab based on active filters
            const f = next.filters
            const check = (keys: string[]) => keys.some(k => f[k] && f[k] !== '' && f[k] !== false)

            if (check(['market_cap_min', 'market_cap_max', 'pe_min', 'pe_max', 'pb_min', 'pb_max'])) {
                setActiveTab('basic')
            } else if (check(['momentum_min', 'momentum_max', 'volatility_min', 'volatility_max', 'liquidity_min', 'liquidity_max'])) {
                setActiveTab('factor')
            } else if (check(['rsi_min', 'rsi_max', 'macd_positive', 'kdj_positive'])) {
                setActiveTab('technical')
            }
        }
    }



    const chartOption = {
        tooltip: {
            formatter: (params: any) => {
                const data = params.data
                return `<div class="font-medium">${data[2]}</div>
                        PE: ${data[0]}<br/>
                        动量: ${(data[1] * 100).toFixed(1)}%<br/>
                        市值: ${(data[3] / 100000000).toFixed(2)}亿`
            }
        },
        xAxis: { type: 'value', name: '市盈率 (PE)', scale: true },
        yAxis: { type: 'value', name: '动量 (%)', scale: true },
        series: [{
            type: 'scatter',
            symbolSize: (data: any) => Math.max(5, Math.min(30, Math.sqrt(data[3]) / 5000)),
            data: items.map(i => [i.pe_ratio || 0, i.momentum || 0, i.name, i.market_cap || 0]),
            itemStyle: { color: '#0ea5e9', opacity: 0.7 }
        }]
    }

    const tabConfig = FIELD_CONFIGS[activeTab]
    const TabIcon = tabConfig.icon

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">综合选股</h2>
                    <p className="text-sm text-slate-500 mt-1">通过多维度指标筛选符合条件的股票</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition ${viewMode === 'table' ? 'bg-white shadow' : 'text-slate-400'}`}><ListIcon size={16} /></button>
                        <button onClick={() => setViewMode('chart')} className={`p-1.5 rounded-md transition ${viewMode === 'chart' ? 'bg-white shadow' : 'text-slate-400'}`}><LayoutGrid size={16} /></button>
                    </div>
                    <div className="h-8 w-px bg-slate-200 mx-2"></div>
                    <button
                        className={`rounded-xl border border-slate-200 px-4 py-2 text-sm transition flex items-center ${items.length === 0 || loading ? 'text-slate-300 cursor-not-allowed bg-slate-50' : 'text-slate-700 hover:bg-slate-50 cursor-pointer'}`}
                        onClick={() => items.length > 0 && !loading && exportResults('csv')}
                        disabled={items.length === 0 || loading}
                    >
                        <FileDown className="mr-2 inline h-4 w-4" />导出CSV
                    </button>
                    <button
                        className={`rounded-xl border border-slate-200 px-4 py-2 text-sm transition ${items.length === 0 || loading ? 'text-slate-300 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50'}`}
                        onClick={() => items.length > 0 && !loading && setPresetOpen(true)}
                        disabled={items.length === 0 || loading}
                    >
                        保存方案
                    </button>
                    <button
                        className="rounded-xl bg-primary px-5 py-2 text-sm text-white font-medium hover:bg-primary/90 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        onClick={() => runScreening()}
                        disabled={loading}
                    >
                        {loading && (
                            <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        开始筛选
                    </button>
                </div>
            </div>

            {/* 分类标签 */}
            <div className="flex border-b border-slate-200">
                {(['basic', 'technical', 'factor'] as const).map((tab) => {
                    const cfg = FIELD_CONFIGS[tab]
                    const Icon = cfg.icon
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition ${activeTab === tab
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                        >
                            <Icon size={16} />
                            {cfg.title}
                        </button>
                    )
                })}
            </div>

            {/* 分类说明 */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary/5 to-transparent rounded-xl">
                <TabIcon size={20} className="text-primary" />
                <div>
                    <span className="font-medium text-slate-800">{tabConfig.title}</span>
                    <span className="text-slate-500 ml-2 text-sm">{tabConfig.description}</span>
                </div>
            </div>

            {/* 筛选条件 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeTab === 'basic' && FIELD_CONFIGS.basic.fields.map((field) => (
                    <FieldInput
                        key={field.key}
                        config={field}
                        minValue={filters[`${field.key}_min` as keyof typeof filters] as string}
                        maxValue={filters[`${field.key}_max` as keyof typeof filters] as string}
                        onMinChange={(v) => setFilters(p => ({ ...p, [`${field.key}_min`]: v }))}
                        onMaxChange={(v) => setFilters(p => ({ ...p, [`${field.key}_max`]: v }))}
                    />
                ))}

                {activeTab === 'factor' && FIELD_CONFIGS.factor.fields.map((field) => (
                    <FieldInput
                        key={field.key}
                        config={field}
                        minValue={filters[`${field.key}_min` as keyof typeof filters] as string}
                        maxValue={filters[`${field.key}_max` as keyof typeof filters] as string}
                        onMinChange={(v) => setFilters(p => ({ ...p, [`${field.key}_min`]: v }))}
                        onMaxChange={(v) => setFilters(p => ({ ...p, [`${field.key}_max`]: v }))}
                    />
                ))}

                {activeTab === 'technical' && (
                    <>
                        {/* RSI 输入 */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
                            <div className="flex items-center mb-2">
                                <span className="font-medium text-slate-800">RSI 相对强弱指数</span>
                                <span className="text-xs text-slate-400 ml-1">(0-100)</span>
                                <Tooltip text="RSI<30可能超卖（买入机会），RSI>70可能超买（卖出信号）。50为中性" />
                            </div>
                            <p className="text-xs text-slate-500 mb-3">衡量股票超买或超卖程度，帮助判断买卖时机</p>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label className="text-xs text-slate-400 mb-1 block">最小值</label>
                                    <input
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-primary transition-all"
                                        placeholder="如：30（寻找超卖股票）"
                                        value={filters.rsi_min}
                                        onChange={(e) => setFilters(p => ({ ...p, rsi_min: e.target.value }))}
                                    />
                                </div>
                                <span className="text-slate-300 pt-5">—</span>
                                <div className="flex-1">
                                    <label className="text-xs text-slate-400 mb-1 block">最大值</label>
                                    <input
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-primary transition-all"
                                        placeholder="如：70（排除超买股票）"
                                        value={filters.rsi_max}
                                        onChange={(e) => setFilters(p => ({ ...p, rsi_max: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full">超卖区：&lt;30</span>
                                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">中性区：30-70</span>
                                <span className="text-xs px-2 py-0.5 bg-red-50 text-red-500 rounded-full">超买区：&gt;70</span>
                            </div>
                        </div>

                        {/* MACD 金叉 */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                    checked={filters.macd_positive}
                                    onChange={(e) => setFilters(p => ({ ...p, macd_positive: e.target.checked }))}
                                />
                                <div className="flex-1">
                                    <div className="flex items-center">
                                        <span className="font-medium text-slate-800">MACD 金叉信号</span>
                                        <Tooltip text="当MACD快线（DIF）上穿慢线（DEA）时触发，表示短期趋势转强" />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">短期均线上穿长期均线，通常是买入信号</p>
                                    <div className="mt-2 flex items-center gap-1">
                                        <TrendingUp size={12} className="text-green-500" />
                                        <span className="text-xs text-green-600">趋势转强信号</span>
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* KDJ 金叉 */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                    checked={filters.kdj_positive}
                                    onChange={(e) => setFilters(p => ({ ...p, kdj_positive: e.target.checked }))}
                                />
                                <div className="flex-1">
                                    <div className="flex items-center">
                                        <span className="font-medium text-slate-800">KDJ 金叉信号</span>
                                        <Tooltip text="当KDJ的K线上穿D线时触发，结合J线判断更准确" />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">K线上穿D线，适合捕捉短期反弹机会</p>
                                    <div className="mt-2 flex items-center gap-1">
                                        <Waves size={12} className="text-blue-500" />
                                        <span className="text-xs text-blue-600">短期反弹信号</span>
                                    </div>
                                </div>
                            </label>
                        </div>
                    </>
                )}
            </div>

            {/* 结果区域 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">筛选结果</h3>
                        <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-sm rounded-full font-medium">{items.length} 只股票</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {presets.slice(0, 8).map((preset: Preset) => (
                            <div key={preset.name} className="group flex items-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm transition cursor-pointer" onClick={() => applyPreset(preset)}>
                                <span className="px-3 py-1 text-xs text-slate-700">{preset.name}</span>
                                <button
                                    className="pr-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => onDeleteClick(e, preset)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                {loading ? (
                    <Loading />
                ) : (
                    viewMode === 'table' ? (
                        <div className="overflow-x-auto text-sm">
                            {items.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <BarChart3 size={48} className="mx-auto mb-3 opacity-50" />
                                    <p>暂无筛选结果</p>
                                    <p className="text-xs mt-1">请设置筛选条件后点击"开始筛选"</p>
                                </div>
                            ) : (
                                <table className="min-w-full">
                                    <thead className="text-left text-xs text-slate-500 border-b border-slate-100">
                                        <tr>
                                            <th className="pb-3 font-medium">股票</th>
                                            <th className="pb-3 font-medium">行业</th>
                                            <th className="pb-3 font-medium">市值</th>
                                            <th className="pb-3 font-medium">市盈率</th>
                                            <th className="pb-3 font-medium">市净率</th>
                                            <th className="pb-3 font-medium">动量</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {items.map((item: ScreeningItem) => (
                                            <tr key={item.symbol} className="hover:bg-slate-50/50 transition">
                                                <td className="py-3">
                                                    <span className="font-medium text-slate-800">{item.name}</span>
                                                    <span className="text-xs text-slate-400 ml-1.5">{item.symbol}</span>
                                                </td>
                                                <td className="text-slate-600">{item.industry || '-'}</td>
                                                <td className="text-slate-600">{item.market_cap ? (item.market_cap / 100000000).toFixed(2) + ' 亿' : '-'}</td>
                                                <td className="text-slate-600">{item.pe_ratio?.toFixed(2) || '-'}</td>
                                                <td className="text-slate-600">{item.pb_ratio?.toFixed(2) || '-'}</td>
                                                <td>
                                                    {item.momentum ? (
                                                        <span className={`${item.momentum > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {item.momentum > 0 ? '+' : ''}{(item.momentum * 100).toFixed(2)}%
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    ) : (
                        <div className="w-full">
                            <ReactECharts option={chartOption} style={{ height: 400 }} />
                            <p className="text-center text-xs text-slate-400 mt-2">X轴: 市盈率 | Y轴: 动量指标 | 气泡大小: 市值规模</p>
                        </div>
                    )
                )}
            </div>
            <Modal
                open={presetOpen}
                title="保存筛选方案"
                onClose={() => setPresetOpen(false)}
                maxWidth="max-w-md"
                footer={(
                    <div className="flex justify-end gap-3">
                        <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 transition" onClick={() => setPresetOpen(false)}>取消</button>
                        <button className="rounded-lg bg-primary px-4 py-2 text-sm text-white font-medium" onClick={savePreset}>保存</button>
                    </div>
                )}
            >
                <div className="space-y-3">
                    <div>
                        <label className="text-sm text-slate-600 font-medium">方案名称</label>
                        <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 transition" placeholder="如：低估值蓝筹股" value={presetName} onChange={(e: ChangeEvent<HTMLInputElement>) => setPresetName(e.target.value)} />
                    </div>
                    <p className={`text-xs ${presets.length >= 6 ? 'text-red-500' : 'text-slate-400'}`}>
                        已保存 {presets.length}/6 条方案{presets.length >= 6 && '（已达上限，请先删除旧方案）'}
                    </p>
                </div>
            </Modal>

            <Modal open={deleteModalOpen} title="删除筛选方案" onClose={() => setDeleteModalOpen(false)} maxWidth="max-w-sm">
                <div className="space-y-4">
                    <p className="text-slate-600">确定要删除该筛选方案吗？此操作无法撤销。</p>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <span className="text-sm font-medium text-slate-800">{presetToDelete?.name}</span>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setDeleteModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">取消</button>
                        <button onClick={confirmDelete} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">删除</button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
