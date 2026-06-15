import { ChangeEvent, useState } from 'react'
import { z } from 'zod'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { AxiosResponse } from 'axios'
import { useNavigate } from 'react-router-dom'

interface LoginForm {
    username: string
    password: string
}

const schema = z.object({
    username: z.string().min(2),
    password: z.string().min(6),
})

export default function Login() {
    const { pushToast } = useToast()
    const navigate = useNavigate()
    const [form, setForm] = useState<LoginForm>({ username: '', password: '' })
    const [loading, setLoading] = useState(false)

    const submit = () => {
        const parsed = schema.safeParse(form)
        if (!parsed.success) {
            pushToast('请输入正确的账号与密码', 'error')
            return
        }
        setLoading(true)
        api.post('/auth/login', form)
            .then((res: AxiosResponse<{ token: string, role: string }>) => {
                localStorage.setItem('momentum_token', res.data.token)
                localStorage.setItem('momentum_role', res.data.role)
                pushToast('登录成功', 'success')
                window.dispatchEvent(new Event('momentum-auth'))
                navigate('/', { replace: true })
            })
            .catch(() => pushToast('登录失败，请检查账号密码', 'error'))
            .finally(() => setLoading(false))
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-xl font-semibold">系统登录</h2>
                <p className="mt-2 text-sm text-muted-foreground">使用管理员或分析师账号进入系统</p>
                <div className="mt-6 space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground">账号</label>
                        <input className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.username} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((prev: LoginForm) => ({ ...prev, username: e.target.value }))} />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground">密码</label>
                        <input type="password" className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.password} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((prev: LoginForm) => ({ ...prev, password: e.target.value }))} />
                    </div>
                    <button
                        className="w-full rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        onClick={submit}
                        disabled={loading}
                    >
                        {loading && (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        登录
                    </button>
                </div>
                <div className="mt-4 space-y-1.5 text-xs text-muted-foreground border-t border-border pt-4">
                    <p className="font-medium text-slate-600">默认账户：</p>
                    <div className="flex justify-between bg-slate-50 px-3 py-2 rounded-lg">
                        <span>管理员</span>
                        <span className="text-slate-800">admin / 123456</span>
                    </div>
                    <div className="flex justify-between bg-slate-50 px-3 py-2 rounded-lg">
                        <span>分析师</span>
                        <span className="text-slate-800">analyst / 123456</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

