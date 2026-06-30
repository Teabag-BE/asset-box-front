import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const MAJORS = [
  { value: 'TA', label: '3D 아티스트' },
  { value: 'UNITY', label: 'Unity 크리에이터' },
  { value: 'UNREAL', label: 'Unreal 크리에이터' },
  { value: 'BACK_END', label: '개발자' },
  { value: 'AI', label: 'AI 크리에이터' },
]

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '', password: '', name: '', nickname: '', major: 'TA',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signup(form)
      navigate('/login')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#869B7E]'

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-6 text-slate-900">회원가입</h1>
        {error && <p className="text-crimson-600 text-sm mb-4">{error}</p>}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">이메일</span>
            <input name="email" type="email" value={form.email} onChange={onChange} required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">비밀번호 <span className="text-slate-400">(8~50자)</span></span>
            <input name="password" type="password" value={form.password} onChange={onChange} required minLength={8} maxLength={50} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">이름</span>
            <input name="name" value={form.name} onChange={onChange} required maxLength={50} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">닉네임 <span className="text-slate-400">(2~30자)</span></span>
            <input name="nickname" value={form.nickname} onChange={onChange} required minLength={2} maxLength={30} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">활동 분야</span>
            <select name="major" value={form.major} onChange={onChange} className={inputCls}>
              {MAJORS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={loading}
            className="mt-2 w-full bg-[#869B7E] disabled:bg-[#a9b8a3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#6b7d64] transition-colors">
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="text-[#556350] font-medium hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  )
}
