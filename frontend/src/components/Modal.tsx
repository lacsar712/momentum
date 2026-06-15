import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
    open: boolean
    title: string
    onClose: () => void
    children: ReactNode
    footer?: ReactNode
    maxWidth?: string
}

export default function Modal({ open, title, onClose, children, footer, maxWidth = 'max-w-3xl' }: ModalProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    if (!open || !mounted) {
        return null
    }

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <div className={`w-full ${maxWidth} rounded-2xl bg-white text-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-200`}>
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <button className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition" onClick={onClose}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>
                <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
                {footer && <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 rounded-b-2xl">{footer}</div>}
            </div>
        </div>,
        document.body
    )
}
