import { Link } from 'react-router-dom'

interface StockNameLinkProps {
    symbol: string
    name: string
    showSymbol?: boolean
    className?: string
}

export default function StockNameLink({ symbol, name, showSymbol = false, className = '' }: StockNameLinkProps) {
    return (
        <Link
            to={`/stock/${symbol}`}
            className={`font-medium text-slate-800 hover:text-primary transition-colors ${className}`}
        >
            {name}
            {showSymbol && (
                <span className="text-xs text-slate-400 ml-1.5 font-normal">{symbol}</span>
            )}
        </Link>
    )
}
