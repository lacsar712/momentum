import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Plus, X, GripVertical, Pencil, Trash2, Search,
    TrendingUp, TrendingDown, Minus, ExternalLink,
    FolderOpen, ChevronRight, Loader2,
} from 'lucide-react'
import Loading from '../components/Loading'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'

interface WatchGroupType {
    id: number
    name: string
    sort_weight: number
    created_at: string | null
    item_count: number
}

interface WatchItemType {
    item_id: number
    stock_id: number
    symbol: string
    name: string
    market: string
    latest_close: number | null
    daily_change: number | null
    five_day_change: number | null
    note: string | null
    added_at: string | null
}

interface StockSuggestion {
    id: number
    symbol: string
    name: string
    market: string
}

export default function Watchlist() {
    const navigate = useNavigate()
    const { pushToast } = useToast()

    const [groups, setGroups] = useState<WatchGroupType[]>([])
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
    const [items, setItems] = useState<WatchItemType[]>([])
    const [loading, setLoading] = useState(true)
    const [itemsLoading, setItemsLoading] = useState(false)

    const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
    const [editingName, setEditingName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')

    const [searchKeyword, setSearchKeyword] = useState('')
    const [suggestions, setSuggestions] = useState<StockSuggestion[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
    const [editingNoteValue, setEditingNoteValue] = useState('')

    const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null)
    const [dragItemInfo, setDragItemInfo] = useState<{ itemId: number; fromGroupId: number } | null>(null)
    const [groupDragIdx, setGroupDragIdx] = useState<number | null>(null)
    const [groupDragOverIdx, setGroupDragOverIdx] = useState<number | null>(null)

    const fetchGroups = useCallback(() => {
        api.get('/watchlist/groups').then((res) => {
            const list = res.data.items || []
            setGroups(list)
            if (list.length > 0 && !selectedGroupId) {
                setSelectedGroupId(list[0].id)
            }
        }).catch(() => {
            pushToast('加载分组失败', 'error')
        }).finally(() => setLoading(false))
    }, [selectedGroupId, pushToast])

    const fetchItems = useCallback(() => {
        if (!selectedGroupId) {
            setItems([])
            return
        }
        setItemsLoading(true)
        api.get(`/watchlist/groups/${selectedGroupId}/items`).then((res) => {
            setItems(res.data.items || [])
        }).catch(() => {
            pushToast('加载股票列表失败', 'error')
        }).finally(() => setItemsLoading(false))
    }, [selectedGroupId, pushToast])

    useEffect(() => {
        fetchGroups()
    }, [fetchGroups])

    useEffect(() => {
        fetchItems()
    }, [fetchItems])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return
        try {
            await api.post('/watchlist/groups', { name: newGroupName.trim() })
            setNewGroupName('')
            setIsCreating(false)
            fetchGroups()
            pushToast('分组创建成功', 'success')
        } catch {
            pushToast('创建分组失败', 'error')
        }
    }

    const handleRenameGroup = async (groupId: number) => {
        if (!editingName.trim()) {
            setEditingGroupId(null)
            return
        }
        try {
            await api.put(`/watchlist/groups/${groupId}`, { name: editingName.trim() })
            setEditingGroupId(null)
            fetchGroups()
            pushToast('重命名成功', 'success')
        } catch {
            pushToast('重命名失败', 'error')
        }
    }

    const handleDeleteGroup = async (groupId: number) => {
        if (!confirm('确认删除该分组及其下所有关注项？')) return
        try {
            await api.delete(`/watchlist/groups/${groupId}`)
            if (selectedGroupId === groupId) {
                setSelectedGroupId(null)
            }
            fetchGroups()
            pushToast('分组已删除', 'success')
        } catch {
            pushToast('删除失败', 'error')
        }
    }

    const handleGroupDragStart = (idx: number) => {
        setGroupDragIdx(idx)
    }

    const handleGroupDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setGroupDragOverIdx(idx)
    }

    const handleGroupDragEnd = async () => {
        if (groupDragIdx !== null && groupDragOverIdx !== null && groupDragIdx !== groupDragOverIdx) {
            const newGroups = [...groups]
            const [moved] = newGroups.splice(groupDragIdx, 1)
            newGroups.splice(groupDragOverIdx, 0, moved)
            setGroups(newGroups)
            const orderedIds = newGroups.map((g) => g.id)
            try {
                await api.put('/watchlist/groups/reorder', { ordered_ids: orderedIds })
            } catch {
                pushToast('排序保存失败', 'error')
                fetchGroups()
            }
        }
        setGroupDragIdx(null)
        setGroupDragOverIdx(null)
    }

    const handleSearchStock = (keyword: string) => {
        setSearchKeyword(keyword)
        if (!keyword.trim()) {
            setSuggestions([])
            setShowSuggestions(false)
            return
        }
        api.get('/stocks/query', { params: { keyword, limit: 8 } }).then((res) => {
            setSuggestions(res.data.items || [])
            setShowSuggestions(true)
        }).catch(() => {
            setSuggestions([])
        })
    }

    const handleAddStock = async (stock: StockSuggestion) => {
        if (!selectedGroupId) {
            pushToast('请先选择分组', 'error')
            return
        }
        try {
            await api.post('/watchlist/items', {
                stock_id: stock.id,
                group_id: selectedGroupId,
            })
            setSearchKeyword('')
            setSuggestions([])
            setShowSuggestions(false)
            fetchItems()
            fetchGroups()
            pushToast(`已添加 ${stock.name}`, 'success')
        } catch {
            pushToast('添加失败', 'error')
        }
    }

    const handleRemoveItem = async (itemId: number) => {
        try {
            await api.delete(`/watchlist/items/${itemId}`)
            fetchItems()
            fetchGroups()
            pushToast('已移除', 'success')
        } catch {
            pushToast('移除失败', 'error')
        }
    }

    const handleMoveItem = async (itemId: number, targetGroupId: number) => {
        try {
            await api.put(`/watchlist/items/${itemId}/move`, { target_group_id: targetGroupId })
            fetchItems()
            fetchGroups()
            pushToast('移动成功', 'success')
        } catch {
            pushToast('移动失败', 'error')
        }
        setDragOverGroupId(null)
        setDragItemInfo(null)
    }

    const handleUpdateNote = async (itemId: number) => {
        try {
            await api.put(`/watchlist/items/${itemId}/note`, { note: editingNoteValue })
            setEditingNoteId(null)
            fetchItems()
            pushToast('备注已更新', 'success')
        } catch {
            pushToast('更新备注失败', 'error')
        }
    }

    const handleItemDragStart = (itemId: number, fromGroupId: number) => {
        setDragItemInfo({ itemId, fromGroupId })
    }

    const handleGroupDrop = (e: React.DragEvent, targetGroupId: number) => {
        e.preventDefault()
        e.currentTarget.classList.remove('bg-primary/10')
        if (dragItemInfo && dragItemInfo.fromGroupId !== targetGroupId) {
            handleMoveItem(dragItemInfo.itemId, targetGroupId)
        }
        setDragOverGroupId(null)
        setDragItemInfo(null)
    }

    const renderChangeBadge = (value: number | null, suffix: string = '%') => {
        if (value === null) return <span className="text-slate-400">-</span>
        const isUp = value >= 0
        return (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isUp ? '+' : ''}{value.toFixed(2)}{suffix}
            </span>
        )
    }

    if (loading) return <Loading />

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">自选股</h2>
                <p className="text-sm text-slate-500 mt-1">管理您关注的股票分组，实时追踪行情变化</p>
            </div>

            <div className="flex gap-6 h-[calc(100vh-180px)]">
                {/* Left: Group Panel */}
                <div className="w-64 shrink-0 flex flex-col rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <span className="text-sm font-semibold text-slate-700">分组</span>
                        <button
                            onClick={() => { setIsCreating(true); setNewGroupName('') }}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="新建分组"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {isCreating && (
                            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                                <input
                                    autoFocus
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateGroup()
                                        if (e.key === 'Escape') setIsCreating(false)
                                    }}
                                    placeholder="分组名称"
                                    className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-slate-400"
                                />
                                <button onClick={handleCreateGroup} className="text-primary text-xs font-medium">确认</button>
                                <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                            </div>
                        )}
                        {groups.map((group, idx) => (
                            <div
                                key={group.id}
                                draggable
                                onDragStart={() => handleGroupDragStart(idx)}
                                onDragOver={(e) => handleGroupDragOver(e, idx)}
                                onDragEnd={handleGroupDragEnd}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (dragItemInfo) {
                                        handleGroupDrop(e, group.id)
                                    }
                                }}
                                onDragEnter={() => {
                                    if (dragItemInfo && dragItemInfo.fromGroupId !== group.id) {
                                        setDragOverGroupId(group.id)
                                    }
                                }}
                                onDragLeave={() => setDragOverGroupId(null)}
                                onClick={() => {
                                    if (editingGroupId !== group.id) setSelectedGroupId(group.id)
                                }}
                                className={`
                                    group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-sm
                                    ${selectedGroupId === group.id
                                        ? 'bg-primary/10 text-primary font-medium shadow-sm shadow-blue-100/50'
                                        : dragOverGroupId === group.id && dragItemInfo
                                            ? 'bg-primary/5 ring-1 ring-primary/30'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }
                                    ${groupDragOverIdx === idx && groupDragIdx !== null && groupDragIdx !== idx ? 'border-t-2 border-primary/40' : ''}
                                `}
                            >
                                <span
                                    className="cursor-grab text-slate-300 hover:text-slate-500"
                                    onPointerDown={(e) => e.stopPropagation()}
                                >
                                    <GripVertical size={14} />
                                </span>
                                {editingGroupId === group.id ? (
                                    <input
                                        autoFocus
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameGroup(group.id)
                                            if (e.key === 'Escape') setEditingGroupId(null)
                                        }}
                                        onBlur={() => handleRenameGroup(group.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex-1 min-w-0 text-sm bg-white border border-primary/30 rounded px-1.5 py-0.5 outline-none"
                                    />
                                ) : (
                                    <>
                                        <FolderOpen size={15} className={selectedGroupId === group.id ? 'text-primary' : 'text-slate-400'} />
                                        <span className="flex-1 truncate">{group.name}</span>
                                        <span className="text-xs text-slate-400">{group.item_count}</span>
                                    </>
                                )}
                                <div className="hidden group-hover:flex items-center gap-0.5 ml-auto shrink-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setEditingGroupId(group.id)
                                            setEditingName(group.name)
                                        }}
                                        className="h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:text-primary"
                                        title="重命名"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteGroup(group.id)
                                        }}
                                        className="h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500"
                                        title="删除"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {groups.length === 0 && !isCreating && (
                            <div className="py-8 text-center text-sm text-slate-400">
                                暂无分组，点击上方 + 创建
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Stock Table */}
                <div className="flex-1 flex flex-col min-w-0 rounded-2xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    {/* Quick Add Search */}
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3" ref={searchRef}>
                        <div className="relative flex-1 max-w-md">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchKeyword}
                                onChange={(e) => handleSearchStock(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && suggestions.length > 0) {
                                        handleAddStock(suggestions[0])
                                    }
                                }}
                                placeholder="搜索股票代码或名称，回车快速加入当前分组..."
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                disabled={!selectedGroupId}
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                                    {suggestions.map((s) => (
                                        <div
                                            key={s.id}
                                            onClick={() => handleAddStock(s)}
                                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 cursor-pointer transition-colors text-sm"
                                        >
                                            <span className="font-medium text-slate-900">{s.symbol}</span>
                                            <span className="text-slate-500">{s.name}</span>
                                            <span className="text-xs text-slate-400 ml-auto">{s.market}</span>
                                            <Plus size={14} className="text-primary" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {selectedGroupId && (
                            <span className="text-sm text-slate-500">
                                添加至：<span className="font-medium text-primary">{groups.find((g) => g.id === selectedGroupId)?.name}</span>
                            </span>
                        )}
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto">
                        {itemsLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 size={24} className="animate-spin text-primary" />
                            </div>
                        ) : !selectedGroupId ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-16">
                                <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                    <ChevronRight size={32} className="text-slate-300" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">请选择分组</h3>
                                <p className="text-sm text-slate-500">从左侧面板选择或创建一个分组</p>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-16">
                                <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                    <Plus size={32} className="text-slate-300" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">暂无关注股票</h3>
                                <p className="text-sm text-slate-500">使用顶部搜索框添加您关注的股票</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-8"></th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">代码</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">名称</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">最新价</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">当日涨跌</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">5日涨跌</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">市场</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">备注</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {items.map((item) => (
                                        <tr
                                            key={item.item_id}
                                            onClick={() => navigate(`/visual?symbol=${item.symbol}`)}
                                            className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                        >
                                            <td
                                                className="px-4 py-3 text-slate-300 cursor-grab"
                                                draggable
                                                onDragStart={() => handleItemDragStart(item.item_id, selectedGroupId!)}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <GripVertical size={14} />
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.symbol}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700">{item.name}</td>
                                            <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                                                {item.latest_close !== null ? item.latest_close.toFixed(2) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {renderChangeBadge(item.daily_change)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {renderChangeBadge(item.five_day_change)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-500">{item.market}</td>
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                {editingNoteId === item.item_id ? (
                                                    <input
                                                        autoFocus
                                                        value={editingNoteValue}
                                                        onChange={(e) => setEditingNoteValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleUpdateNote(item.item_id)
                                                            if (e.key === 'Escape') setEditingNoteId(null)
                                                        }}
                                                        onBlur={() => handleUpdateNote(item.item_id)}
                                                        className="w-full text-sm bg-white border border-primary/30 rounded px-2 py-1 outline-none"
                                                    />
                                                ) : (
                                                    <span
                                                        onClick={() => {
                                                            setEditingNoteId(item.item_id)
                                                            setEditingNoteValue(item.note || '')
                                                        }}
                                                        className="text-sm text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                                                    >
                                                        {item.note || <Plus size={14} className="inline" />}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => navigate(`/visual?symbol=${item.symbol}`)}
                                                        className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                                        title="查看K线"
                                                    >
                                                        <ExternalLink size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveItem(item.item_id)}
                                                        className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                        title="移除"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer with drag hint */}
                    {selectedGroupId && items.length > 0 && (
                        <div className="px-5 py-2 border-t border-slate-100 bg-slate-50/30 text-xs text-slate-400 flex items-center gap-2">
                            <GripVertical size={12} />
                            <span>拖拽左侧把手到分组可跨组移动 · 点击行跳转K线页 · 点击备注可编辑</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
