import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/authApi'

export default function EmailVerifyPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams])
  const [status, setStatus] = useState(token ? 'loading' : 'missing')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) return

    let ignore = false

    async function verify() {
      try {
        await authApi.verifyEmail(token)
        if (!ignore) {
          setStatus('success')
          setMessage('이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.')
        }
      } catch (err) {
        if (!ignore) {
          setStatus('error')
          setMessage(err.message || '이메일 인증에 실패했습니다.')
        }
      }
    }

    verify()

    return () => {
      ignore = true
    }
  }, [token])

  const title = {
    loading: '이메일 인증 중',
    success: '이메일 인증 완료',
    error: '이메일 인증 실패',
    missing: '인증 링크 오류',
  }[status]

  const description = {
    loading: '인증 링크를 확인하고 있습니다.',
    success: message,
    error: message,
    missing: '인증 토큰이 없는 링크입니다. 메일의 인증 버튼을 다시 눌러 주세요.',
  }[status]

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div
          className={[
            'mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold',
            status === 'success' ? 'bg-emerald-50 text-emerald-700' : '',
            status === 'error' || status === 'missing' ? 'bg-rose-50 text-rose-700' : '',
            status === 'loading' ? 'bg-slate-100 text-slate-600' : '',
          ].join(' ')}
        >
          {status === 'loading' ? '...' : status === 'success' ? '✓' : '!'}
        </div>
        <h1 className="mb-3 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mb-6 text-sm leading-6 text-slate-600">{description}</p>
        <Link
          to="/login"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#869B7E] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#6b7d64]"
        >
          로그인으로 이동
        </Link>
      </section>
    </div>
  )
}
