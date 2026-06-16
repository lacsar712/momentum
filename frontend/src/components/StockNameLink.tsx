import { Link } from 'react-router-dom'

type StockNameLinkTarget = 'detail' | 'kline'

interface StockNameLinkProps {
    symbol: string
    name: string
    showSymbol?: boolean
    className?: string
    target?: StockNameLinkTarget
}

export default function StockNameLink({ symbol, name, showSymbol = false, className = '', target = 'detail' }: StockNameLinkProps) {
    const to = target === 'kline' ? `/visual?symbol=${symbol}` : `/stock/${symbol}`

    return (
        <Link
            to={to}
            className={`font-medium text-slate-800 hover:text-primary transition-colors ${className}`}
            onClick={e => e.stopPropagation()}
        >
            {name}
            {showSymbol && (
                <span className="text-xs text-slate-400 ml-1.5 font-normal">{symbol}</span>
            )}
        </Link>
    )
}
