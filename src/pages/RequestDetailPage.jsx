import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { requestApi } from '../api/requestApi'
import { useAuth } from '../auth/AuthContext'
import { STATUS, STATUS_FLOW, StatusBadge } from '../features/request/requestStatus'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import UserName from '../components/UserName'
import CommentSection from '../features/post/CommentSection'

function Field({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-slate-400 w-20 shrink-0">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  )
}

// 상태 진행 타임라인 (REJECTED는 별도 표시)
function StatusTimeline({ status }) {
  if (status === 'REJECTED') {
    return <p className="text-sm text-crimson-600 font-medium">반려된 요청입니다.</p>
  }
  const currentIdx = STATUS_FLOW.indexOf(status)
  return (
    <ol className="space-y-2">
      {STATUS_FLOW.map((s, i) => {
        const done = i <= currentIdx
        return (
          <li key={s} className="flex items-center gap-2 text-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${done ? 'bg-[#869B7E]' : 'bg-slate-200'}`} />
            <span className={done ? 'text-slate-700 font-medium' : 'text-slate-400'}>{STATUS[s].label}</span>
          </li>
        )
      })}
    </ol>
  )
}

export default function RequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [req, setReq] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    requestApi.getDetail(id)
      .then(setReq)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!confirm('이 요청글을 삭제할까요?')) return
    try { await requestApi.remove(id); navigate('/requests') }
    catch (e) { setError(e.message) }
  }

  async function handleAccept() {
    try { const updated = await requestApi.assign(id); setReq(updated) }
    catch (e) { setError(e.message) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-7 h-7" /></div>
  if (error) return <p className="text-center text-crimson-600 py-20 text-sm">{error}</p>
  if (!req) return null

  const isMine = user && String(user.id) === String(req.requesterId)
  const canAccept = user && !isMine && !req.assigneeId && req.status === 'REQUESTED'
  const deadline = req.deadline ? new Date(req.deadline).toLocaleString('ko-KR') : null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/requests" className="text-sm text-slate-400 hover:text-slate-600">← 요청 게시판으로</Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-3">
        {/* 본문 */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status={req.status} />
              {/* 명세 R-8: 삭제는 REQUESTED 상태에서 요청자 본인만 */}
              {isMine && req.status === 'REQUESTED' &&
                <Button variant="danger" size="sm" className="ml-auto" onClick={handleDelete}>삭제</Button>}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4">{req.title}</h1>
            <div className="space-y-1.5 border-y border-linen-200 py-4 mb-4">
              <Field label="에셋종류" value={req.assetType} />
              <Field label="선호스타일" value={req.preferredStyle} />
              <Field label="엔진" value={req.engine} />
              <Field label="마감" value={deadline} />
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{req.content}</p>

            {req.referenceImages?.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-5">
                {req.referenceImages.map((img, i) => (
                  <img key={i} src={img.url ?? img.presignedUrl} alt={`reference ${i + 1}`}
                    className="w-full aspect-square object-cover rounded-lg border border-linen-200" />
                ))}
              </div>
            )}

            {req.linkedPostId && (
              <Link to={`/assets/${req.linkedPostId}`} className="inline-block mt-5 text-sm text-[#556350] hover:underline">
                🔗 완성된 에셋 #{req.linkedPostId} 보기
              </Link>
            )}
          </div>

          {/* 💬 요청 댓글 */}
          <CommentSection targetId={id} type="request" />
        </div>

        {/* 사이드바 */}
        <aside className="space-y-5">
          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-3">현재 상태</h2>
            <div className="mb-4"><StatusBadge status={req.status} /></div>
            <StatusTimeline status={req.status} />
            {canAccept && (
              <Button size="sm" className="w-full justify-center mt-4" onClick={handleAccept}>이 요청 수락하기</Button>
            )}
          </div>

          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-5 space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">요청자</p>
              <p className="text-sm font-medium text-slate-800"><UserName id={req.requesterId} /></p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">담당 제작자</p>
              <p className="text-sm font-medium text-slate-800">{req.assigneeId ? <UserName id={req.assigneeId} /> : '미배정'}</p>
            </div>
            {!isMine && (
              <Button variant="secondary" size="sm" className="w-full justify-center"
                onClick={() => navigate(`/messages/${req.requesterId}`)}>
                💬 요청자에게 메시지
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
