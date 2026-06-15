import { format, parse } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'

interface DatePickerProps {
    value?: string
    onChange: (date: string) => void
    placeholder?: string
}

export default function DatePicker({ value, onChange, placeholder = '选择日期' }: DatePickerProps) {
    const [open, setOpen] = useState(false)
    const [selected, setSelected] = useState<Date | undefined>(value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined)
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

    useEffect(() => {
        if (value) {
            const parsed = parse(value, 'yyyy-MM-dd', new Date())
            if (!isNaN(parsed.getTime())) {
                setSelected(parsed)
            }
        } else {
            setSelected(undefined)
        }
    }, [value])

    const handleSelect = (date: Date | undefined) => {
        setSelected(date)
        if (date) {
            onChange(format(date, 'yyyy-MM-dd'))
            setOpen(false)
        } else {
            onChange('')
        }
    }

    const formatDisplayDate = (date: Date) => {
        return format(date, 'yyyy年M月d日', { locale: zhCN })
    }

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`
                    w-full flex items-center justify-between gap-2
                    px-4 py-2.5 rounded-xl
                    bg-white border-2 border-slate-200
                    text-sm font-medium
                    transition-all duration-200
                    hover:border-primary/50 hover:shadow-sm
                    focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                    ${open ? 'border-primary ring-2 ring-primary/20 shadow-sm' : ''}
                `}
            >
                <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
                    {selected ? formatDisplayDate(selected) : placeholder}
                </span>
                <CalendarIcon size={16} className="text-slate-400" />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-2 z-50 rounded-xl bg-white border-2 border-slate-200 shadow-xl p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <style>{`
                        .rdp {
                            --rdp-cell-size: 36px;
                            --rdp-accent-color: var(--color-primary);
                            --rdp-background-color: var(--color-primary);
                            margin: 0;
                        }
                        .rdp-months {
                            justify-content: center;
                        }
                        .rdp-caption {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 0 8px 12px;
                            border-bottom: 1px solid #f1f5f9;
                            margin-bottom: 8px;
                        }
                        .rdp-caption_label {
                            font-size: 14px;
                            font-weight: 600;
                            color: #1e293b;
                        }
                        .rdp-nav {
                            display: flex;
                            gap: 4px;
                        }
                        .rdp-nav_button {
                            width: 28px;
                            height: 28px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 8px;
                            color: #64748b;
                            transition: all 0.15s;
                        }
                        .rdp-nav_button:hover {
                            background: #f1f5f9;
                            color: #1e293b;
                        }
                        .rdp-head_cell {
                            font-size: 12px;
                            font-weight: 500;
                            color: #94a3b8;
                            text-transform: none;
                            padding: 8px 0;
                        }
                        .rdp-cell {
                            padding: 2px;
                        }
                        .rdp-day {
                            width: 32px;
                            height: 32px;
                            font-size: 13px;
                            font-weight: 500;
                            border-radius: 8px;
                            color: #475569;
                            transition: all 0.15s;
                        }
                        .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) {
                            background: #f1f5f9;
                            color: #1e293b;
                        }
                        .rdp-day_selected {
                            background: var(--color-primary) !important;
                            color: white !important;
                            font-weight: 600;
                        }
                        .rdp-day_today:not(.rdp-day_selected) {
                            color: var(--color-primary);
                            font-weight: 600;
                            border: 2px solid var(--color-primary);
                        }
                        .rdp-day_disabled {
                            color: #cbd5e1;
                        }
                        .rdp-day_outside {
                            color: #cbd5e1;
                            opacity: 0.5;
                        }
                        .rdp-dropdown {
                            padding: 6px 8px;
                            border-radius: 8px;
                            border: 1px solid #e2e8f0;
                            font-size: 13px;
                            font-weight: 500;
                            color: #1e293b;
                            background: white;
                            cursor: pointer;
                        }
                        .rdp-dropdown:focus {
                            outline: none;
                            border-color: var(--color-primary);
                        }
                        .rdp-vhidden {
                            display: none;
                        }
                    `}</style>
                    <DayPicker
                        mode="single"
                        selected={selected}
                        onSelect={handleSelect}
                        locale={zhCN}
                        captionLayout="dropdown-buttons"
                        fromYear={2000}
                        toYear={new Date().getFullYear()}
                        components={{
                            IconLeft: () => <ChevronLeft size={16} />,
                            IconRight: () => <ChevronRight size={16} />,
                        }}
                    />
                </div>
            )}
        </div>
    )
}
