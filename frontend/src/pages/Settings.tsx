import { ChangeEvent, useState } from 'react'
import Modal from '../components/Modal'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { AxiosResponse } from 'axios'
import DatePicker from '../components/DatePicker'

export default function Settings() {
    const { pushToast } = useToast()
    const [exportOpen, setExportOpen] = useState(false)
    const [exportType, setExportType] = useState('csv')
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
    const [loading, setLoading] = useState(false)

    const triggerExport = () => {
        setLoading(true)
        api.post('/export', {
            start_date: dateRange.start || undefined,
            end_date: dateRange.end || undefined,
            file_type: exportType,
        }, { responseType: 'blob' })
            .then((res: AxiosResponse<Blob>) => {
                const url = window.URL.createObjectURL(new Blob([res.data]))
                const link = document.createElement('a')
                link.href = url
                link.setAttribute('download', `export.${exportType}`)
                document.body.appendChild(link)
                link.click()
                link.remove()
                pushToast('导出已开始', 'success')
                setExportOpen(false)
            })
            .catch(() => pushToast('导出失败，请确认已登录', 'error'))
            .finally(() => setLoading(false))
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold">系统设置</h2>
                <p className="text-sm text-muted-foreground">账户权限、导出与系统参数</p>
            </div>
            <div className="grid grid-cols-2 gap-6">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h3 className="text-lg font-semibold">数据导出</h3>
                    <p className="mt-2 text-sm text-muted-foreground">支持Excel与CSV格式导出筛选结果</p>
                    <button className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={() => setExportOpen(true)}>导出数据</button>
                </div>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h3 className="text-lg font-semibold">权限说明</h3>
                    <p className="mt-2 text-sm text-muted-foreground">管理员可执行数据同步与系统配置，分析师可使用回测与筛选功能。</p>
                </div>
            </div>
            <Modal
                open={exportOpen}
                title="导出数据"
                onClose={() => setExportOpen(false)}
                footer={(
                    <div className="flex justify-end gap-3">
                        <button className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => setExportOpen(false)}>取消</button>
                        <button
                            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={triggerExport}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    导出中...
                                </>
                            ) : '导出'}
                        </button>
                    </div>
                )}
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground">导出格式</label>
                        <select className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm" value={exportType} onChange={(e: ChangeEvent<HTMLSelectElement>) => setExportType(e.target.value)}>
                            <option value="csv">CSV</option>
                            <option value="xlsx">Excel</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground">起始日期</label>
                        <div className="mt-2">
                            <DatePicker value={dateRange.start} onChange={(date) => setDateRange((prev) => ({ ...prev, start: date }))} placeholder="选择起始日期" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground">结束日期</label>
                        <div className="mt-2">
                            <DatePicker value={dateRange.end} onChange={(date) => setDateRange((prev) => ({ ...prev, end: date }))} placeholder="选择结束日期" />
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
