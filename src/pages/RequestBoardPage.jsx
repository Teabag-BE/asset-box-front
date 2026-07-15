import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { requestApi } from '../api/requestApi'
import { STATUS_TABS, StatusBadge } from '../features/request/requestStatus'
import { timeAgo } from '../utils/timeAgo'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'
import UserName from '../components/UserName'

function RequestCard({ req }) {
  const deadline = req.deadline ? new Date(req.deadline).toLocaleDateString('ko-KR') : null
  return (
    <Link to={`/requests/${req.id}`}
      className="group bg-white rounded-xl border border-[#C9CAAC]/40 shadow-[0_2px_12px_rgba(44,56,41,0.08)] hover:shadow-[0_8px_24px_rgba(44,56,41,0.16)] hover:border-[#869B7E]/60 transition-all p-4 flex flex-col">
      {/* 참조 이미지(첫 장)를 썸네일로 사용 — 있을 때만 카드 상단에 표시 */}
      {req.thumbnailUrl && (
        <div className="-mx-4 -mt-4 mb-3 aspect-video bg-linen-100 overflow-hidden rounded-t-xl">
          <img src={req.thumbnailUrl} alt={req.title} loading="lazy" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-slate-800 text-sm group-hover:text-[#556350] line-clamp-1">{req.title}</p>
        <StatusBadge status={req.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mb-2">
        {req.assetType && <span className="flex items-center gap-1">📦 {req.assetType}</span>}
        {req.engine && <span className="flex items-center gap-1">🛠 {req.engine}</span>}
        {deadline && <span className="flex items-center gap-1">📅 {deadline}</span>}
      </div>
      <p className="text-xs text-slate-500 line-clamp-2 flex-1">{req.content}</p>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-linen-200 text-xs text-slate-400">
        <span>요청자 <UserName id={req.requesterId} /></span>
        <span className="flex items-center gap-2">
          {req.assigneeId && <span className="text-[#556350]">담당 <UserName id={req.assigneeId} /></span>}
          <span>{timeAgo(req.createdAt)}</span>
        </span>
      </div>
    </Link>
  )
}

export default function RequestBoardPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [tab, setTab] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    requestApi.getList()
      .then(res => setItems(res.items ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => tab === 'ALL' ? items : items.filter(r => r.status === tab),
    [items, tab],
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">요청 게시판</h1>
          <p className="text-sm text-slate-500 mt-1">필요한 3D 에셋 제작을 요청하세요.</p>
        </div>
        <Button onClick={() => navigate('/requests/new')}>+ 요청 작성</Button>
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-[#869B7E] text-white' : 'bg-white text-slate-500 border border-[#C9CAAC]/50 hover:border-[#869B7E]/40'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-crimson-600 text-sm mb-3">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="요청글이 없습니다" description={tab === 'ALL' ? '첫 요청을 작성해보세요.' : '이 상태의 요청이 없습니다.'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(req => <RequestCard key={req.id} req={req} />)}
        </div>
      )}
    </div>
  )
}
