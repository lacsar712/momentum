import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import DataCenter from './pages/DataCenter'
import Screening from './pages/Screening'
import Patterns from './pages/Patterns'
import Strategies from './pages/Strategies'
import Backtest from './pages/Backtest'
import Visual from './pages/Visual'
import Settings from './pages/Settings'
import SystemLogs from './pages/SystemLogs'
import Login from './pages/Login'

function App() {
    const [token, setToken] = useState(() => localStorage.getItem('momentum_token'))

    useEffect(() => {
        const syncToken = () => {
            setToken(localStorage.getItem('momentum_token'))
        }

        // Listen for standard storage events (cross-tab)
        window.addEventListener('storage', syncToken)
        // Listen for custom auth events (same-tab)
        window.addEventListener('momentum-auth', syncToken)

        return () => {
            window.removeEventListener('storage', syncToken)
            window.removeEventListener('momentum-auth', syncToken)
        }
    }, [])

    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={token ? <Outlet /> : <Navigate to="/login" replace />}>
                <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/data" element={<DataCenter />} />
                    <Route path="/screening" element={<Screening />} />
                    <Route path="/patterns" element={<Patterns />} />
                    <Route path="/strategies" element={<Strategies />} />
                    <Route path="/backtest" element={<Backtest />} />
                    <Route path="/visual" element={<Visual />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/logs" element={<SystemLogs />} />
                </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}

export default App
