import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface SelectOption {
    value: string
    label: string
}

interface SelectProps {
    value: string
    options: SelectOption[]
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
}

export default function Select({ value, options, onChange, placeholder = '请选择', disabled }: SelectProps) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const selectedOption = options.find(o => o.value === value)

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(!open)}
                className={`
                    w-full flex items-center justify-between gap-2
                    px-4 py-2.5 rounded-xl
                    bg-white border-2 border-slate-200
                    text-sm font-medium
                    transition-all duration-200
                    hover:border-primary/50 hover:shadow-sm
                    focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                    ${open ? 'border-primary ring-2 ring-primary/20 shadow-sm' : ''}
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}
                `}
            >
                <span className={selectedOption ? 'text-slate-900' : 'text-slate-400'}>
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-xl bg-white border-2 border-slate-200 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-[280px] overflow-y-auto p-1.5">
                        {options.map(option => (
                            <button
                                key={option.value}
                                onClick={() => {
                                    onChange(option.value)
                                    setOpen(false)
                                }}
                                className={`
                                    w-full flex items-center justify-between gap-2
                                    px-3 py-2.5 rounded-lg text-sm
                                    transition-all duration-150
                                    ${option.value === value
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-slate-700 hover:bg-slate-100'
                                    }
                                `}
                            >
                                <span>{option.label}</span>
                                {option.value === value && <Check size={16} className="text-primary" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
