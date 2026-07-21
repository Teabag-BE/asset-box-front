import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'

const MAJORS = [
  { value: 'TA', label: '3D 아티스트' },
  { value: 'UNITY', label: 'Unity 크리에이터' },
  { value: 'UNREAL', label: 'Unreal 크리에이터' },
  { value: 'BACK_END', label: '개발자' },
  { value: 'AI', label: 'AI 크리에이터' },
]

const VERIFIED_EMAIL_KEY = 'verifiedSignupEmail'

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({
    email: '', password: '', name: '', nickname: '', major: 'TA',
  })
  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [mailSent, setMailSent] = useState(false)
  const [error, setError] = useState('')
  const [sendingMail, setSendingMail] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const storedEmail = localStorage.getItem(VERIFIED_EMAIL_KEY) ?? ''
    if (!storedEmail) return

    setVerifiedEmail(storedEmail)
    setMailSent(true)
    setForm(prev => ({ ...prev, email: storedEmail }))
  }, [])

  const emailVerified = useMemo(
    () => Boolean(form.email) && form.email.trim().toLowerCase() === verifiedEmail.trim().toLowerCase(),
    [form.email, verifiedEmail],
  )

  const onChange = e => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    if (name === 'email') {
      setError('')
      setMailSent(false)
    }
  }

  async function onRequestEmailVerification() {
    setError('')
    const email = form.email.trim()

    if (!email) {
      setError('이메일을 입력해 주세요.')
      return
    }

    setSendingMail(true)
    try {
      await authApi.requestEmailVerification(email)
      setMailSent(true)
      toast('인증 메일을 발송했습니다. 메일함에서 인증을 완료해 주세요.', 'info')
    } catch (err) {
      setError(err.message)
    } finally {
      setSendingMail(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')

    if (!emailVerified) {
      setError('이메일 인증을 먼저 완료해 주세요.')
      return
    }

    setLoading(true)
    try {
      await signup(form)
      localStorage.removeItem(VERIFIED_EMAIL_KEY)
      toast('회원가입이 완료되었습니다. 로그인해 주세요.')
      navigate('/login')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#869B7E] disabled:bg-slate-50 disabled:text-slate-400'
  const disabledUntilVerified = !emailVerified

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-3 text-2xl font-bold text-slate-900">회원가입</h1>
        <p className="mb-6 text-sm leading-6 text-slate-500">
          가입 가능한 이메일인지 먼저 인증한 뒤 계정 정보를 입력해 주세요.
        </p>

        {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">이메일</span>
            <div className="flex gap-2">
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={onChange}
                required
                className={`${inputCls} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={onRequestEmailVerification}
                disabled={sendingMail || emailVerified}
                className="h-10 shrink-0 rounded-lg border border-[#869B7E] px-3 text-sm font-semibold text-[#556350] transition-colors hover:bg-[#f3f6f1] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                {emailVerified ? '인증 완료' : sendingMail ? '발송 중' : '인증 메일'}
              </button>
            </div>
          </label>

          <div className={[
            'rounded-lg border px-3 py-2 text-sm',
            emailVerified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500',
          ].join(' ')}>
            {emailVerified
              ? `${verifiedEmail} 인증이 완료되었습니다.`
              : mailSent
                ? '메일함의 인증 링크를 누른 뒤 이 페이지로 돌아와 주세요.'
                : '이메일 인증을 완료해야 회원가입을 진행할 수 있습니다.'}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">비밀번호 <span className="text-slate-400">(8~50자)</span></span>
            <input name="password" type="password" value={form.password} onChange={onChange} required minLength={8} maxLength={50} disabled={disabledUntilVerified} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">이름</span>
            <input name="name" value={form.name} onChange={onChange} required maxLength={50} disabled={disabledUntilVerified} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">닉네임 <span className="text-slate-400">(2~30자)</span></span>
            <input name="nickname" value={form.nickname} onChange={onChange} required minLength={2} maxLength={30} disabled={disabledUntilVerified} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">활동 분야</span>
            <select name="major" value={form.major} onChange={onChange} disabled={disabledUntilVerified} className={inputCls}>
              {MAJORS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <button
            type="submit"
            disabled={loading || disabledUntilVerified}
            className="mt-2 w-full rounded-lg bg-[#869B7E] py-2.5 font-semibold text-white transition-colors hover:bg-[#6b7d64] disabled:cursor-not-allowed disabled:bg-[#a9b8a3]"
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-medium text-[#556350] hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  )
}
