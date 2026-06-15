import { AlertTriangle } from 'lucide-react'

export default function RiskBanner() {
    return (
        <div className="mb-8 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 text-orange-900 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
                <p className="font-semibold text-sm">风险提示</p>
                <p className="text-xs text-orange-700/80 leading-relaxed">
                    本系统仅用于量化策略研究与回测分析，不构成任何投资建议。回测结果基于历史数据，不代表未来表现。股市有风险，入市需谨慎。
                </p>
            </div>
        </div>
    )
}
