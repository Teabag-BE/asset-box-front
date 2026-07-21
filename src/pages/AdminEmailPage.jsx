import { useEffect, useMemo, useState } from 'react'
import { adminEmailApi } from '../api/adminEmailApi'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'

const MAJORS = [
  { value: 'TA', label: '3D 아티스트' },
  { value: 'UNITY', label: 'Unity 크리에이터' },
  { value: 'UNREAL', label: 'Unreal 크리에이터' },
  { value: 'BACK_END', label: '개발자' },
  { value: 'AI', label: 'AI 크리에이터' },
]

const STATUS_LABEL = {
  ENROLL: '인증 대기',
  VERIFIED: '인증 완료',
}

export default function AdminEmailPage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ email: '', name: '', major: 'BACK_END' })

  async function load(nextPage = page) {
    setError('')
    setLoading(true)
    try {
      const data = await adminEmailApi.getList({ page: nextPage, size: 20 })
      setItems(data?.content ?? [])
      setPage(data?.number ?? nextPage)
      setTotalPages(Math.max(data?.totalPages ?? 1, 1))
      setTotalElements(data?.totalElements ?? 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(item =>
      item.email?.toLowerCase().includes(needle) ||
      item.name?.toLowerCase().includes(needle) ||
      item.major?.toLowerCase().includes(needle) ||
      item.status?.toLowerCase().includes(needle)
    )
  }, [items, q])

  const onChange = e => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await adminEmailApi.enroll({
        email: form.email.trim(),
        name: form.name.trim(),
        major: form.major,
      })
      setForm({ email: '', name: '', major: 'BACK_END' })
      toast('이메일을 화이트리스트에 등록했습니다.')
      await load(0)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(email) {
    const ok = window.confirm(`${email}을(를) 화이트리스트에서 삭제할까요?`)
    if (!ok) return

    setError('')
    try {
      await adminEmailApi.remove(email)
      toast('이메일을 삭제했습니다.')
      await load(page)
    } catch (err) {
      setError(err.message)
    }
  }

  const inputCls = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#869B7E]'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">이메일 관리</h1>
          <p className="mt-1 text-sm text-slate-500">회원가입을 허용할 이메일을 등록하고 인증 상태를 확인합니다.</p>
        </div>
        <div className="text-sm text-slate-500">총 {totalElements.toLocaleString()}개</div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <form onSubmit={onSubmit} className="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_140px_160px_auto]">
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={onChange}
          required
          placeholder="email@example.com"
          className={inputCls}
        />
        <input
          name="name"
          value={form.name}
          onChange={onChange}
          required
          placeholder="이름"
          className={inputCls}
        />
        <select name="major" value={form.major} onChange={onChange} className={inputCls}>
          {MAJORS.map(major => <option key={major.value} value={major.value}>{major.label}</option>)}
        </select>
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-lg bg-[#869B7E] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#6b7d64] disabled:bg-[#a9b8a3]"
        >
          {saving ? '등록 중' : '등록'}
        </button>
      </form>

      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="현재 페이지에서 검색"
          className={`${inputCls} w-full max-w-sm`}
        />
        <button
          type="button"
          onClick={() => load(page)}
          className="h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">표시할 이메일이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">이메일</th>
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">분야</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 text-right font-semibold">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => (
                  <tr key={item.email} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.email}</td>
                    <td className="px-4 py-3 text-slate-600">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.major}</td>
                    <td className="px-4 py-3">
                      <span className={[
                        'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                        item.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                      ].join(' ')}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDelete(item.email)}
                        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => load(Math.max(page - 1, 0))}
          disabled={loading || page === 0}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          이전
        </button>
        <span className="text-sm text-slate-500">{page + 1} / {totalPages}</span>
        <button
          type="button"
          onClick={() => load(Math.min(page + 1, totalPages - 1))}
          disabled={loading || page + 1 >= totalPages}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          다음
        </button>
      </div>
    </div>
  )
}
