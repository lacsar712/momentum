import { useEffect, useState } from 'react'
import { Camera, Database, List, TrendingUp, ArrowRight, AlertCircle } from 'lucide-react'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/auth'
import { AxiosResponse } from 'axios'
import DatePicker from '../components/DatePicker'

interface StockItem {
    symbol: string
    name: string
    market: string
}

interface StockResponse {
    total: number
    items: StockItem[]
}

export default function DataCenter() {
    const { pushToast } = useToast()
    const { isAdmin } = useAuth()
    const [stocks, setStocks] = useState<StockItem[]>([])
    const [loading, setLoading] = useState(false)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [search, setSearch] = useState('')
    const [syncOpen, setSyncOpen] = useState(false)
    const [dateRange, setDateRange] = useState({ start: '', end: '' })
    const [stats, setStats] = useState({ stock_count: 0, daily_coverage: 0 })

    // 进度相关状态
    const [taskRunning, setTaskRunning] = useState(false)
    const [progress, setProgress] = useState<{ status: string, type: string, message: string, current: number, total: number }>({ status: 'idle', type: '', message: '', current: 0, total: 0 })

    const pageSize = 18
    const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

    // 状态轮询逻辑
    useEffect(() => {
        let isRunning = false

        const checkStatus = () => {
            api.get('/data/sync/progress').then(res => {
                const data = res.data
                setProgress(data)

                if (data.status === 'running') {
                    setTaskRunning(true)
                    isRunning = true
                } else {
                    if (isRunning) {
                        setTaskRunning(false)
                        isRunning = false
                        if (data.status === 'finished') {
                            pushToast(`任务完成: ${data.message}`, 'success')
                            fetchStocks()
                            fetchStats() // 任务完成后刷新统计
                        } else if (data.status === 'error') {
                            pushToast(`任务出错: ${data.message}`, 'error')
                        }
                    } else {
                        setTaskRunning(false)
                    }
                }
            }).catch(() => { })
        }

        checkStatus()
        const interval = setInterval(checkStatus, 3000)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        fetchStocks()
        fetchStats()
    }, [page, search])

    const fetchStats = () => {
        api.get('/dashboard/stats').then(res => setStats(res.data))
    }

    const fetchStocks = () => {
        setLoading(true)
        api.get('/stocks', { params: { keyword: search, limit: pageSize, offset: (page - 1) * pageSize } })
            .then((res: AxiosResponse<StockResponse>) => {
                setStocks(res.data.items)
                setTotal(res.data.total)
                setTotalPages(Math.ceil(res.data.total / pageSize))
            })
            .catch(() => {
                pushToast('获取股票列表失败', 'error')
            })
            .finally(() => setLoading(false))
    }

    const syncStockList = () => {
        if (!isAdmin) return
        pushToast('正在启动股票清单同步任务...', 'info')
        api.post('/data/sync/stocks')
            .then(() => {
                pushToast('股票清单同步任务已启动', 'success')
                setTaskRunning(true)
                setProgress(prev => ({ ...prev, status: 'running', type: 'stock_list', message: '正在启动任务...', current: 0, total: 100 }))
            })
            .catch((error) => {
                const msg = error.response?.data?.detail || '股票清单同步失败'
                pushToast(msg, 'error')
            })
    }

    const syncDaily = () => {
        if (!isAdmin || total === 0) {
            if (total === 0) pushToast('股票列表为空，请先同步股票清单', 'error')
            return
        }
        if (!dateRange.start || !dateRange.end) {
            pushToast('请选择起始和结束日期', 'error')
            return
        }
        setSyncOpen(false)
        pushToast('正在启动行情同步任务...', 'info')

        api.post('/data/sync/daily', { start_date: dateRange.start, end_date: dateRange.end })
            .then(() => {
                pushToast('行情同步任务已启动', 'success')
                setTaskRunning(true)
                setProgress(prev => ({ ...prev, status: 'running', type: 'daily', message: '正在启动任务...', current: 0, total: 100 }))
            })
            .catch((error) => {
                const msg = error.response?.data?.detail || '行情同步失败'
                pushToast(msg, 'error')
            })
    }

    const updateSnapshots = () => {
        if (!isAdmin) return
        api.post('/data/snapshot/update')
            .then(() => {
                pushToast('快照更新任务已启动', 'success')
                setTaskRunning(true)
                setProgress(prev => ({ ...prev, status: 'running', type: 'snapshot', message: '正在启动任务...', current: 0, total: 100 }))
            })
            .catch((error) => {
                const msg = error.response?.data?.detail || '快照更新失败'
                pushToast(msg, 'error')
            })
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">数据中心</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    按照以下步骤初始化数据库。只有完成日线同步，筛选和回测功能才能正常使用。
                </p>
            </div>

            {/* 步骤引导区 */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Step 1 */}
                <div className="relative group overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-md hover:border-blue-200">
                    <span className="text-6xl font-black text-slate-100 absolute right-4 top-4 select-none">01</span>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-blue-100/50 text-blue-600 rounded-xl border border-blue-100">
                                <List size={20} />
                            </div>
                            <h3 className="font-semibold text-lg">股票清单</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6 min-h-[48px]">
                            获取全市场基础信息（代码、名称）。
                            <br />
                            当前状态：<span className="font-semibold text-foreground">{stats.stock_count}</span> 只股票
                        </p>
                        <button
                            onClick={syncStockList}
                            disabled={taskRunning || !isAdmin}
                            className="w-full rounded-xl bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-200"
                        >
                            同步股票清单
                        </button>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="relative group overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-md hover:border-emerald-200">
                    <span className="text-6xl font-black text-slate-100 absolute right-4 top-4 select-none">02</span>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-emerald-100/50 text-emerald-600 rounded-xl border border-emerald-100">
                                <Database size={20} />
                            </div>
                            <h3 className="font-semibold text-lg">日线行情</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6 min-h-[48px]">
                            获取历史K线数据，用于计算指标。
                            <br />
                            覆盖率：<span className={`${stats.daily_coverage < stats.stock_count * 0.8 ? 'text-amber-500' : 'text-emerald-600'} font-semibold`}>
                                {stats.daily_coverage || 0}
                            </span> / {stats.stock_count}
                        </p>
                        <button
                            onClick={() => setSyncOpen(true)}
                            disabled={taskRunning || !isAdmin || total === 0}
                            className="w-full rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-emerald-200"
                        >
                            同步日线数据
                        </button>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="relative group overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-md hover:border-purple-200">
                    <span className="text-6xl font-black text-slate-100 absolute right-4 top-4 select-none">03</span>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-purple-100/50 text-purple-600 rounded-xl border border-purple-100">
                                <Camera size={20} />
                            </div>
                            <h3 className="font-semibold text-lg">技术快照</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6 min-h-[48px]">
                            基于日线计算RSI/MACD等指标。
                            <br />
                            <span className="text-xs text-muted-foreground/80">通常在步骤2完成后自动触发</span>
                        </p>
                        <button
                            onClick={updateSnapshots}
                            disabled={taskRunning || !isAdmin}
                            className="w-full rounded-xl border border-purple-200 bg-purple-50 text-purple-700 px-4 py-2.5 text-sm font-medium hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            手动更新快照
                        </button>
                    </div>
                </div>
            </div>

            {/* 进度提示 */}
            {taskRunning && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 ring-4 ring-blue-50">
                                <TrendingUp className="animate-pulse" size={20} />
                            </div>
                            <div>
                                <h4 className="font-semibold text-blue-900">
                                    {progress.type === 'stock_list' ? '正在同步股票清单...' :
                                        (progress.type === 'daily' ? '正在同步行情数据...' :
                                            (progress.type === 'snapshot' ? '正在更新技术快照...' : '后台任务执行中...'))}
                                </h4>
                                <p className="text-sm text-blue-700 mt-1">{progress.message}</p>
                            </div>
                        </div>
                        <span className="text-3xl font-bold text-blue-600 tabular-nums">{percent}%</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-blue-200">
                        <div
                            className="h-full bg-blue-600 transition-all duration-500 ease-out relative overflow-hidden"
                            style={{ width: `${percent}%` }}
                        >
                            <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite] skew-x-[-20deg]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}></div>
                        </div>
                    </div>
                </div>
            )}

            {/* 列表区域 */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">股票清单预览</h3>
                    <div className="flex gap-4 items-center">
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                <List size={14} />
                            </div>
                            <input
                                placeholder="搜索代码或名称..."
                                className="w-64 rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <Loading />
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {stocks.map((item) => (
                                <div key={item.symbol} className="group flex items-center justify-between rounded-xl border border-border px-4 py-3 bg-white/50 hover:bg-white hover:shadow-sm hover:border-primary/20 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${item.market === 'SH' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {item.market}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm group-hover:text-primary transition-colors">{item.name}</div>
                                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.symbol}</div>
                                        </div>
                                    </div>
                                    <ArrowRight size={14} className="text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                </div>
                            ))}
                        </div>

                        {stocks.length === 0 && (
                            <div className="py-20 text-center text-muted-foreground">
                                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                                    <AlertCircle size={24} />
                                </div>
                                <p>暂无股票数据，请点击上方「步骤01」进行同步</p>
                            </div>
                        )}

                        <div className="flex items-center justify-between border-t border-border mt-6 pt-4">
                            <div className="text-xs text-muted-foreground">
                                显示第 {(page - 1) * pageSize + 1} 到 {Math.min(page * pageSize, total)} 条，共 {total} 条
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-muted transition-colors"
                                >
                                    上一页
                                </button>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-muted transition-colors"
                                >
                                    下一页
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <Modal
                open={syncOpen}
                title="同步日线行情"
                onClose={() => setSyncOpen(false)}
                footer={(
                    <div className="flex justify-end gap-3">
                        <button className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-slate-50 transition-colors" onClick={() => setSyncOpen(false)}>取消</button>
                        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200" onClick={syncDaily}>开始同步</button>
                    </div>
                )}
            >
                <div className="space-y-5">
                    <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-100 flex gap-3">
                        <AlertCircle className="shrink-0 text-emerald-600" size={18} />
                        <div>
                            <p className="font-medium mb-1">耗时操作警告</p>
                            <p className="text-xs opacity-90 leading-relaxed">
                                全市场5000+只股票的日线同步需要消耗大量时间。
                                <br />• 建议初次同步选择最近 <strong>3-6个月</strong> 的数据。
                                <br />• 同步完成后，系统会自动更新技术指标快照。
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-2 block">起始日期</label>
                            <DatePicker value={dateRange.start} onChange={(date) => setDateRange((prev) => ({ ...prev, start: date }))} placeholder="选择起始日期" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-2 block">结束日期</label>
                            <DatePicker value={dateRange.end} onChange={(date) => setDateRange((prev) => ({ ...prev, end: date }))} placeholder="选择结束日期" />
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
