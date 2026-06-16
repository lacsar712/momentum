import { useState, useEffect } from 'react'

export function useAuth() {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('momentum_token'))
    const [role, setRole] = useState<string | null>(() => localStorage.getItem('momentum_role'))

    useEffect(() => {
        const syncAuth = () => {
            setToken(localStorage.getItem('momentum_token'))
            setRole(localStorage.getItem('momentum_role'))
        }

        window.addEventListener('storage', syncAuth)
        window.addEventListener('momentum-auth', syncAuth)

        return () => {
            window.removeEventListener('storage', syncAuth)
            window.removeEventListener('momentum-auth', syncAuth)
        }
    }, [])

    return {
        user: token ? { username: role === 'admin' ? 'admin' : 'analyst' } : null,
        isAdmin: role === 'admin',
        isAuthenticated: !!token,
    }
}
