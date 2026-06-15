import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, Database, Layers, LineChart, ScrollText, Settings, Sparkles, Timer, TrendingUp, LogOut, User } from 'lucide-react'
import { useAuth } from '../lib/auth'

const items = [
    { to: '/', label: '总览看板', icon: BarChart3 },
    { to: '/data', label: '数据中心', icon: Database },
    { to: '/screening', label: '综合选股', icon: Sparkles },
    { to: '/patterns', label: '形态扫描', icon: Layers },
    { to: '/strategies', label: '策略实验室', icon: TrendingUp },
    { to: '/backtest', label: '历史回测', icon: Timer },
    { to: '/visual', label: '高级可视化', icon: LineChart },
    { to: '/settings', label: '系统设置', icon: Settings },
    { to: '/logs', label: '运行日志', icon: ScrollText },
]

export default function Sidebar() {
    const navigate = useNavigate()
    const { user, isAdmin } = useAuth()

    const handleLogout = () => {
        localStorage.removeItem('momentum_token')
        localStorage.removeItem('momentum_role')
        window.dispatchEvent(new Event('momentum-auth'))
        navigate('/login')
    }

    // 根据角色确定显示名称
    const displayName = user?.username === 'admin' ? '管理员' : user?.username === 'analyst' ? '分析师' : user?.username || '用户'
    const roleLabel = isAdmin ? '超级管理员' : '数据分析师'

    return (
        <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-100 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
            {/* Header */}
            <div className="h-16 flex items-center px-6 border-b border-slate-50 shrink-0 bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-blue-500/20">
                        <TrendingUp size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold tracking-tight text-slate-900 leading-none">Momentum</h1>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 tracking-wider">量化沙箱</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto hover:overflow-y-auto scrollbar-thin scrollbar-thumb-slate-100 scrollbar-track-transparent">
                {items.map((item) => {
                    const Icon = item.icon
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-200 rounded-lg group ${isActive
                                    ? 'text-primary bg-primary/5 shadow-sm shadow-blue-100/50'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <Icon size={18} className={`transition-colors ${isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} strokeWidth={isActive ? 2.5 : 2} />
                                    <span>{item.label}</span>
                                    {isActive && (
                                        <div className="ml-auto w-1 h-1 rounded-full bg-primary" />
                                    )}
                                </>
                            )}
                        </NavLink>
                    )
                })}
            </nav>

            {/* Merged Footer */}
            <div className="p-4 border-t border-slate-50 shrink-0 bg-slate-50/30">
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg transition-colors hover:bg-slate-100/50 group cursor-default">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center ring-1 shadow-sm ${isAdmin ? 'bg-primary/10 ring-primary/30 text-primary' : 'bg-emerald-50 ring-emerald-200 text-emerald-600'}`}>
                            <User size={16} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                            <p className="text-[10px] text-slate-500 truncate">{roleLabel}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="退出登录"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    )
}

