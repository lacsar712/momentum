import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

interface StockItem {
    symbol: string
    name: string
}

interface StockSelectorProps {
    value: string
    stocks: StockItem[]
    onChange: (symbol: string) => void
    disabled?: boolean
}

export default function StockSelector({ value, stocks, onChange, disabled }: StockSelectorProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const list = Array.isArray(stocks) ? stocks : []
    const filtered = list.filter(s =>
        s.symbol.includes(search) ||
        s.name.toLowerCase().includes(search.toLowerCase())
    )

    const selectedStock = list.find(s => s.symbol === value)

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(!open)}
                className={`
                    w-full flex items-center justify-between gap-2
                    px-4 py-2.5 rounded-xl
                    bg-white border-2 border-slate-200
                    text-sm font-medium
                    transition-all duration-200
                    hover:border-primary/50 hover:shadow-sm
                    focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                    ${open ? 'border-primary ring-2 ring-primary/20 shadow-sm' : ''}
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}
                `}
            >
                <span className={selectedStock ? 'text-slate-900' : 'text-slate-400'}>
                    {selectedStock ? `${selectedStock.name} (${selectedStock.symbol})` : '选择股票...'}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-xl bg-white border-2 border-slate-200 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                        <Search size={16} className="text-slate-400" />
                        <input
                            autoFocus
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                            placeholder="搜索代码或名称..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="max-h-[280px] overflow-y-auto p-1.5">
                        {filtered.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-400">
                                未找到匹配的股票
                            </div>
                        ) : (
                            filtered.slice(0, 50).map(stock => (
                                <button
                                    key={stock.symbol}
                                    onClick={() => {
                                        onChange(stock.symbol)
                                        setOpen(false)
                                        setSearch('')
                                    }}
                                    className={`
                                        w-full flex items-center justify-between gap-2
                                        px-3 py-2.5 rounded-lg text-sm
                                        transition-all duration-150
                                        ${stock.symbol === value
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'text-slate-700 hover:bg-slate-100'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{stock.name}</span>
                                        <span className="text-xs text-slate-400">({stock.symbol})</span>
                                    </div>
                                    {stock.symbol === value && <Check size={16} className="text-primary" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
