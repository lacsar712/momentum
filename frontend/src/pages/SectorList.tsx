import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, TrendingUp, TrendingDown, ArrowUpDown, BarChart2, Building2 } from 'lucide-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'

interface SectorItem {
    industry: string
    stock_count: number
    avg_pe: number | null
    avg_pb: number | null
    total_market_cap: number
    daily_change_pct: number | null
}

type SortKey = 'stock_count' | 'avg_pe' | 'avg_pb' | 'total_market_cap' | 'daily_change_pct'
type SortOrder = 'asc' | 'desc'

export default function SectorList() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [sectors, setSectors] = useState<SectorItem[]>([])
    const [searchKeyword, setSearchKeyword] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('total_market_cap')
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

    useEffect(() => {
        setLoading(true)
        setError(null)
        api.get('/sectors')
            .then((res) => {
                setSectors(res.data.items || [])
            })
            .catch((err) => {
                setError(err.response?.data?.detail || '加载失败，请稍后重试')
            })
            .finally(() => setLoading(false))
    }, [])

    const filteredAndSortedSectors = useMemo(() => {
        let result = [...sectors]

        if (searchKeyword.trim()) {
            const keyword = searchKeyword.toLowerCase()
            result = result.filter((s) =>
                s.industry.toLowerCase().includes(keyword)
            )
        }

        result.sort((a, b) => {
            const aVal = a[sortKey] ?? 0
            const bVal = b[sortKey] ?? 0
            return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
        })

        return result
    }, [sectors, searchKeyword, sortKey, sortOrder])

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortOrder('desc')
        }
    }

    const formatMarketCap = (value: number) => {
        if (value > 100000000) {
            return (value / 100000000).toFixed(2) + ' 亿'
        }
        if (value > 10000) {
            return (value / 10000).toFixed(2) + ' 万'
        }
        return value.toFixed(2)
    }

    const SortHeader = ({ label, sortKey: key }: { label: string; sortKey: SortKey }) => (
        <th
            className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors select-none"
            onClick={() => handleSort(key)}
        >
            <div className="flex items-center gap-1">
                {label}
                <ArrowUpDown
                    size={14}
                    className={`transition-colors ${sortKey === key ? 'text-primary' : 'text-slate-300'}`}
                />
            </div>
        </th>
    )

    if (error) {
        return (
            <div className="space-y-8 animate-fade-in-up">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">行业板块</h2>
                    <p className="text-sm text-slate-500 mt-1">全市场行业聚合分析视图</p>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/60 p-12 shadow-sm">
                    <div className="flex flex-col items-center text-center">
                        <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                            <TrendingDown size={32} className="text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">加载失败</h3>
                        <p className="text-sm text-slate-500 mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            重新加载
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">行业板块</h2>
                    <p className="text-sm text-slate-500 mt-1">全市场行业聚合分析视图</p>
                </div>
                <button
                    onClick={() => navigate('/sector/fund-flow')}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary text-sm font-medium rounded-lg hover:bg-primary/20 transition-colors"
                >
                    <BarChart2 size={16} />
                    资金流总览
                </button>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜索行业名称..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                </div>
                <div className="text-sm text-slate-500">
                    共 <span className="font-semibold text-slate-900">{filteredAndSortedSectors.length}</span> 个行业
                </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                {loading ? (
                    <Loading />
                ) : filteredAndSortedSectors.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                            <Building2 size={32} className="text-slate-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">暂无行业数据</h3>
                        <p className="text-sm text-slate-500">
                            {searchKeyword ? '未找到匹配的行业，请尝试其他关键词' : '请先同步股票数据'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50/50 border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        行业名称
                                    </th>
                                    <SortHeader label="成分股数" sortKey="stock_count" />
                                    <SortHeader label="平均 PE" sortKey="avg_pe" />
                                    <SortHeader label="平均 PB" sortKey="avg_pb" />
                                    <SortHeader label="总市值" sortKey="total_market_cap" />
                                    <SortHeader label="日涨跌幅" sortKey="daily_change_pct" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredAndSortedSectors.map((sector) => (
                                    <tr
                                        key={sector.industry}
                                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                        onClick={() => navigate(`/sector/${encodeURIComponent(sector.industry)}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <Building2 size={18} className="text-primary" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{sector.industry}</p>
                                                    <p className="text-xs text-slate-400">点击查看详情</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 font-medium">
                                            {sector.stock_count} 只
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {sector.avg_pe !== null ? sector.avg_pe.toFixed(2) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {sector.avg_pb !== null ? sector.avg_pb.toFixed(2) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                            {formatMarketCap(sector.total_market_cap)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {sector.daily_change_pct !== null ? (
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                                                        sector.daily_change_pct >= 0
                                                            ? 'bg-red-50 text-red-600'
                                                            : 'bg-emerald-50 text-emerald-600'
                                                    }`}
                                                >
                                                    {sector.daily_change_pct >= 0 ? (
                                                        <TrendingUp size={12} />
                                                    ) : (
                                                        <TrendingDown size={12} />
                                                    )}
                                                    {sector.daily_change_pct >= 0 ? '+' : ''}
                                                    {sector.daily_change_pct.toFixed(2)}%
                                                </span>
                                            ) : (
                                                <span className="text-sm text-slate-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
