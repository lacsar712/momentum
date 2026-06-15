import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import Loading from '../components/Loading'
import { AxiosResponse } from 'axios'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/auth'
import Modal from '../components/Modal'
import DatePicker from '../components/DatePicker'

interface LogItem {
    id: number
    data_source: string
    sync_type: string
    start_date: string
    end_date: string
    status: string
    message: string
    created_at: string
}

interface LogResponse {
    total: number
    items: LogItem[]
}

const DataSourceMap: Record<string, string> = {
    'akshare': 'AkShare (东方财富)',
    'eastmoney': '东方财富 (直连)',
    'sina': '新浪财经',
    'tencent': '腾讯财经 (实时)',
}

const SyncTypeMap: Record<string, string> = {
    stock_list: '股票清单',
    daily: '日线数据',
    incremental: '增量同步',
    full: '全量同步',
    scheduled: '定时同步',
}

export default function SystemLogs() {
    const { pushToast } = useToast()
    const { isAdmin } = useAuth()
    const [logs, setLogs] = useState<LogItem[]>([])
    const [loading, setLoading] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const pageSize = 20

    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteRange, setDeleteRange] = useState({ start: '', end: '' })
    const [deleteAll, setDeleteAll] = useState(false)

    const fetchLogs = (showToast = false) => {
        if (showToast) {
            setRefreshing(true)
            pushToast('正在刷新日志...', 'info')
        } else {
            setLoading(true)
        }
        api.get('/system/logs', { params: { limit: pageSize, offset: (page - 1) * pageSize } })
            .then((res: AxiosResponse<LogResponse>) => {
                setLogs(res.data.items)
                setTotal(res.data.total)
                if (showToast) pushToast('日志已刷新', 'success')
            })
            .catch(() => pushToast('日志加载失败', 'error'))
            .finally(() => {
                setLoading(false)
                setRefreshing(false)
            })
    }

    useEffect(() => {
        fetchLogs()
    }, [page])

    const handleDelete = () => {
        if (!isAdmin) {
            pushToast('权限不足：仅管理员可清理日志', 'error')
            return
        }
        if (!deleteAll && (!deleteRange.start || !deleteRange.end)) {
            pushToast('请选择清理的时间范围', 'error')
            return
        }
        api.delete('/system/logs', {
            data: {
                start_date: deleteAll ? null : deleteRange.start,
                end_date: deleteAll ? null : deleteRange.end,
                delete_all: deleteAll
            }
        })
            .then(() => {
                pushToast('日志已清理', 'success')
                setDeleteOpen(false)
                setPage(1)
                fetchLogs()
            })
            .catch(() => pushToast('清理失败，请检查权限', 'error'))
    }

    const totalPages = Math.ceil(total / pageSize)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">系统日志</h2>
                    <p className="text-sm text-muted-foreground">数据同步与系统运行状态监控</p>
                </div>
                <div className="flex gap-3">
                    <button
                        className={`rounded-xl border border-destructive/20 text-destructive px-4 py-2 text-sm ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:bg-destructive/10'}`}
                        onClick={() => isAdmin && setDeleteOpen(true)}
                        disabled={!isAdmin}
                        title={!isAdmin ? '仅管理员可清理日志' : ''}
                    >
                        清理日志
                    </button>
                    <button
                        className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        onClick={() => fetchLogs(true)}
                        disabled={refreshing}
                    >
                        {refreshing && (
                            <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        刷新日志
                    </button>
                </div>
            </div>
            <div className="glass-card rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="p-8"><Loading /></div>
                ) : (
                    <>
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-muted text-muted-foreground">
                                <tr>
                                    <th className="px-6 py-3 font-medium">时间</th>
                                    <th className="px-6 py-3 font-medium">数据源</th>
                                    <th className="px-6 py-3 font-medium">类型</th>
                                    <th className="px-6 py-3 font-medium">状态</th>
                                    <th className="px-6 py-3 font-medium">详情</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-muted/50">
                                        <td className="px-6 py-3 whitespace-nowrap text-muted-foreground">
                                            {new Date(log.created_at).toLocaleString('zh-CN')}
                                        </td>
                                        <td className="px-6 py-3">
                                            {DataSourceMap[log.data_source] || log.data_source}
                                        </td>
                                        <td className="px-6 py-3">{SyncTypeMap[log.sync_type] || log.sync_type}</td>
                                        <td className="px-6 py-3">
                                            <span className={`inline-flex px-2 py-1 rounded-full text-xs ${log.status === 'success'
                                                ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                                                : 'bg-rose-600 text-white dark:bg-rose-500'
                                                }`}>
                                                {log.status === 'success' ? '成功' : '失败'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 max-w-md truncate text-muted-foreground" title={log.message || ''}>
                                            {log.message || '-'}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">暂无日志记录</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        <div className="flex items-center justify-between border-t border-border px-6 py-4">
                            <div className="text-xs text-muted-foreground">
                                共 {total} 条记录，第 {page} / {totalPages || 1} 页
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-50"
                                >
                                    上一页
                                </button>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-50"
                                >
                                    下一页
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <Modal
                open={deleteOpen}
                title="清理系统日志"
                onClose={() => setDeleteOpen(false)}
                maxWidth="max-w-lg"
                footer={(
                    <div className="flex justify-end gap-3">
                        <button className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => setDeleteOpen(false)}>取消</button>
                        <button className="rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>确认清理</button>
                    </div>
                )}
            >
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="deleteAll" checked={deleteAll} onChange={(e) => setDeleteAll(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                        <label htmlFor="deleteAll" className="text-sm">清理所有日志</label>
                    </div>
                    {!deleteAll && (
                        <>
                            <div>
                                <label className="text-xs text-muted-foreground">起始日期</label>
                                <div className="mt-2">
                                    <DatePicker value={deleteRange.start} onChange={(date) => setDeleteRange((prev) => ({ ...prev, start: date }))} placeholder="选择起始日期" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground">结束日期</label>
                                <div className="mt-2">
                                    <DatePicker value={deleteRange.end} onChange={(date) => setDeleteRange((prev) => ({ ...prev, end: date }))} placeholder="选择结束日期" />
                                </div>
                            </div>
                        </>
                    )}
                    <p className="text-xs text-muted-foreground text-destructive">
                        注意：清理日志操作不可恢复。
                    </p>
                </div>
            </Modal>
        </div>
    )
}
