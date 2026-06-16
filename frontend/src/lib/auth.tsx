import { createContext, useContext, useState, useEffect, ReactNode } from 'react'


interface AuthUser {
    username: string
    role: 'admin' | 'analyst'
}

interface AuthContextValue {
    user: AuthUser | null
    isAdmin: boolean
    loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, isAdmin: false, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)

    const parseToken = () => {
        const token = localStorage.getItem('momentum_token')
        const role = localStorage.getItem('momentum_role')
        if (token && role) {
            // 从localStorage中的role字段获取用户信息
            // 由于没有后端获取用户信息的接口，我们从登录时保存的role推断
            const username = role === 'admin' ? 'admin' : 'analyst'
            setUser({ username, role: role as 'admin' | 'analyst' })
        } else {
            setUser(null)
        }
        setLoading(false)
    }

    useEffect(() => {
        parseToken()

        const handleAuthChange = () => {
            parseToken()
        }

        window.addEventListener('momentum-auth', handleAuthChange)
        window.addEventListener('storage', handleAuthChange)

        return () => {
            window.removeEventListener('momentum-auth', handleAuthChange)
            window.removeEventListener('storage', handleAuthChange)
        }
    }, [])

    const isAdmin = user?.role === 'admin'

    return (
        <AuthContext.Provider value={{ user, isAdmin, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    return useContext(AuthContext)
}
