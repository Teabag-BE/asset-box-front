import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form)
      toast('로그인되었습니다 👋')
      navigate('/inbox')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-6 text-slate-900">로그인</h1>
        {error && <p className="text-crimson-600 text-sm mb-4">{error}</p>}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">이메일</span>
            <input name="email" type="email" value={form.email} onChange={onChange} required
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#869B7E]" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">비밀번호</span>
            <input name="password" type="password" value={form.password} onChange={onChange} required
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#869B7E]" />
          </label>
          <button type="submit" disabled={loading}
            className="mt-2 w-full bg-[#869B7E] disabled:bg-[#a9b8a3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#6b7d64] transition-colors">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          계정이 없으신가요?{' '}
          <Link to="/signup" className="text-[#556350] font-medium hover:underline">회원가입</Link>
        </p>
      </div>
    </div>
  )
}
