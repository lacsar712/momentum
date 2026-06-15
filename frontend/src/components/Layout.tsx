import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
    return (
        <div className="flex h-screen w-full relative overflow-hidden bg-transparent">
            {/* Ambient Background decoration can be handled by body style in index.css */}

            <Sidebar />

            <main className="flex-1 h-full overflow-y-auto pl-64 pr-0 py-0 relative z-10 w-full scrollbar-none">
                <div className="min-h-full max-w-7xl mx-auto p-8 animate-fade-in-up">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
