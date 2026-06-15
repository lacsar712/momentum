import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
    id: string
    message: string
    type: ToastType
}

interface ToastContextValue {
    pushToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([])

    const pushToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = `${Date.now()}-${Math.random()}`
        setItems((prev: ToastItem[]) => [...prev, { id, message, type }])
        setTimeout(() => {
            setItems((prev: ToastItem[]) => prev.filter((item: ToastItem) => item.id !== id))
        }, 2600)
    }, [])

    const value = useMemo(() => ({ pushToast }), [pushToast])

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 space-y-3">
                {items.map((item: ToastItem) => (
                    <div
                        key={item.id}
                        className={`rounded-xl px-4 py-3 text-sm shadow-lg ${item.type === 'success'
                                ? 'bg-emerald-500 text-white'
                                : item.type === 'error'
                                    ? 'bg-rose-500 text-white'
                                    : 'bg-slate-900 text-white'
                            }`}
                    >
                        {item.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) {
        throw new Error('ToastProvider missing')
    }
    return ctx
}
