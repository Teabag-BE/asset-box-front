import { useEffect, useState } from 'react'
import { commentApi, requestCommentApi } from '../../api/commentApi'
import { useAuth } from '../../auth/AuthContext'
import Avatar from '../../components/Avatar'
import Button from '../../components/Button'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { timeAgo } from '../../utils/timeAgo'

// 백엔드는 flat list(부모/답글이 한 배열, parentId 로만 구분)를 준다.
// Mock 컴포넌트는 comment.replies 중첩 구조를 기대하므로 여기서 그룹핑해서 맞춰준다.
//  - parentId == null 이면 최상위, 아니면 그 부모의 replies 로.
//  - 삭제 판정: Mock 은 deleted(boolean)였지만 백엔드는 deletedAt(타임스탬프) → !!deletedAt.
function groupComments(flat) {
  const roots = []
  const byId = new Map()

  // 1차: 최상위 댓글을 replies 배열과 함께 등록
  for (const c of flat) {
    if (c.parentId == null) {
      const node = { ...c, deleted: !!c.deletedAt, replies: [] }
      byId.set(c.id, node)
      roots.push(node)
    }
  }
  // 2차: 답글을 부모에 매달기 (부모가 있는 경우만)
  for (const c of flat) {
    if (c.parentId != null) {
      const parent = byId.get(c.parentId)
      if (parent) parent.replies.push({ ...c, deleted: !!c.deletedAt })
    }
  }
  return roots
}

function CommentInput({ onSubmit, placeholder = '댓글을 입력하세요...', small = false }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    try {
      await onSubmit(text)
      setText('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        rows={small ? 2 : 3}
        className={`flex-1 resize-none border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#869B7E]/40 ${small ? 'text-xs' : 'text-sm'}`}
      />
      <Button type="submit" variant="primary" size="sm" disabled={loading || !text.trim()}>등록</Button>
    </form>
  )
}

function ReplyItem({ reply, currentUserId, targetId, api, onRefresh, onError }) {
  const toast = useToast()
  const confirm = useConfirm()
  async function handleDelete() {
    if (!(await confirm({ title: '답글 삭제', message: '이 답글을 삭제할까요?', confirmText: '삭제', danger: true }))) return
    try {
      await api.deleteComment(targetId, reply.id)
      toast('답글을 삭제했어요')
      onRefresh()
    } catch (err) {
      onError(err.message ?? '삭제에 실패했습니다.')
    }
  }

  return (
    <div className="flex gap-3">
      <Avatar nickname={reply.deleted ? '?' : reply.authorNickname} size="sm" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          {!reply.deleted && <span className="text-xs font-semibold text-slate-700">{reply.authorNickname}</span>}
          <span className="text-xs text-slate-400">{timeAgo(reply.createdAt)}</span>
        </div>
        <p className={`text-sm ${reply.deleted ? 'text-slate-400 italic' : 'text-slate-700'}`}>
          {reply.deleted ? '삭제된 댓글입니다.' : reply.content}
        </p>
        {!reply.deleted && String(currentUserId) === String(reply.authorId) && (
          <button className="text-xs text-slate-400 hover:text-red-500 mt-1" onClick={handleDelete}>삭제</button>
        )}
      </div>
    </div>
  )
}

function CommentItem({ comment, targetId, currentUserId, api, onRefresh, onError }) {
  const [showReply, setShowReply] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  async function handleDelete() {
    if (!(await confirm({ title: '댓글 삭제', message: '이 댓글을 삭제할까요?', confirmText: '삭제', danger: true }))) return
    try {
      await api.deleteComment(targetId, comment.id)
      toast('댓글을 삭제했어요')
      onRefresh()
    } catch (err) {
      onError(err.message ?? '삭제에 실패했습니다.')
    }
  }

  async function handleReply(text) {
    try {
      await api.createComment(targetId, { content: text, parentId: comment.id })
      setShowReply(false)
      toast('답글을 남겼어요')
      onRefresh()
    } catch (err) {
      onError(err.message ?? '등록에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Avatar nickname={comment.deleted ? '?' : comment.authorNickname} size="sm" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            {!comment.deleted && <span className="text-xs font-semibold text-slate-700">{comment.authorNickname}</span>}
            <span className="text-xs text-slate-400">{timeAgo(comment.createdAt)}</span>
          </div>
          <p className={`text-sm ${comment.deleted ? 'text-slate-400 italic' : 'text-slate-700'}`}>
            {comment.deleted ? '삭제된 댓글입니다.' : comment.content}
          </p>
          {!comment.deleted && (
            <div className="flex gap-3 mt-1">
              {currentUserId && (
                <button
                  className="text-xs text-slate-400 hover:text-[#556350]"
                  onClick={() => setShowReply(r => !r)}
                >{showReply ? '취소' : '↩ 답글'}</button>
              )}
              {String(currentUserId) === String(comment.authorId) && (
                <button className="text-xs text-slate-400 hover:text-red-500" onClick={handleDelete}>삭제</button>
              )}
            </div>
          )}
        </div>
      </div>

      {comment.replies?.length > 0 && (
        <div className="ml-10 space-y-3 border-l-2 border-slate-100 pl-4">
          {comment.replies.map(r => (
            <ReplyItem key={r.id} reply={r} currentUserId={currentUserId} targetId={targetId} api={api} onRefresh={onRefresh} onError={onError} />
          ))}
        </div>
      )}

      {showReply && (
        <div className="ml-10">
          <CommentInput small placeholder="답글을 입력하세요..." onSubmit={handleReply} />
        </div>
      )}
    </div>
  )
}

/**
 * @param {string} targetId  - postId 또는 requestId
 * @param {'post'|'request'} type - 댓글 API 종류
 */
export default function CommentSection({ targetId, type = 'post' }) {
  const { user } = useAuth()
  const toast = useToast()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const api = type === 'request' ? requestCommentApi : commentApi

  // loading 은 최초 마운트 때만 true(초기값). 이후 새로고침은 목록만 조용히 갱신한다.
  // setState 는 모두 promise 콜백(.then/.catch/.finally) 안에서만 호출 — effect 에서 동기
  // setState 를 부르면 react-hooks 규칙(set-state-in-effect)에 걸리기 때문.
  function load() {
    return api.getComments(targetId)
      .then(data => { setComments(groupComments(Array.isArray(data) ? data : [])); setError('') })
      .catch(err => setError(err.message ?? '댓글을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [targetId, type])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateComment(text) {
    try {
      await api.createComment(targetId, { content: text, parentId: null })
      toast('댓글을 남겼어요')
      await load()
    } catch (err) {
      setError(err.message ?? '등록에 실패했습니다.')
    }
  }

  const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0)

  return (
    <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-6 space-y-5">
      <h2 className="font-semibold text-slate-800">
        💬 댓글{totalCount > 0 && <span className="ml-1 text-slate-400 font-normal text-sm">({totalCount})</span>}
      </h2>

      {error && <p className="text-xs text-crimson-600">{error}</p>}

      {user ? (
        <CommentInput onSubmit={handleCreateComment} />
      ) : (
        <p className="text-sm text-slate-400">댓글을 작성하려면 로그인하세요.</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-400">첫 댓글을 작성해보세요.</p>
      ) : (
        <div className="space-y-5 divide-y divide-slate-100">
          {comments.map(c => (
            <div key={c.id} className="pt-4 first:pt-0">
              <CommentItem comment={c} targetId={targetId} currentUserId={user?.id} api={api} onRefresh={load} onError={setError} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
