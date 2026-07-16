import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { messageApi } from '../api/messageApi'
import { resolveUserName } from '../utils/userNames'
import Spinner from '../components/Spinner'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../utils/timeAgo'

export default function InboxPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [names, setNames] = useState({}) // partnerId -> 표시 이름
  const [loading, setLoading] = useState(true)
  const [newId, setNewId] = useState('')

  // 폴링: 인박스 10초 주기 갱신
  useEffect(() => {
    let active = true
    const load = () =>
      messageApi.getInbox()
        .then(list => {
          if (!active) return
          setConversations(list)
          // 상대 표시 이름 해석 ("유저 #번호" 대신)
          Promise.all(
            list.map(c => resolveUserName(c.partnerId).then(n => [c.partnerId, n])),
          ).then(entries => { if (active) setNames(Object.fromEntries(entries)) })
        })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false) })
    load()
    const id = setInterval(load, 10000)
    return () => { active = false; clearInterval(id) }
  }, [])

  function startConversation(e) {
    e.preventDefault()
    const id = newId.trim()
    if (id) navigate(`/messages/${id}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">메시지</h1>

      {/* 새 대화 시작 — 크리에이터 목록에서 상대를 골라 시작(권장). userId 직접 입력도 지원. */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Link to="/directory"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#869B7E]/50 bg-sage-50 px-3 py-2 text-sm font-semibold text-[#556350] hover:bg-sage-100 transition-colors">
          👥 크리에이터에서 상대 찾기
        </Link>
        <form onSubmit={startConversation} className="flex gap-2 flex-1 min-w-[220px]">
          <input
            value={newId}
            onChange={e => setNewId(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="또는 userId 직접 입력"
            inputMode="numeric"
            className="flex-1 rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E]"
          />
          <Button type="submit" disabled={!newId.trim()}>대화 시작</Button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>
      ) : conversations.length === 0 ? (
        <EmptyState icon="💬" title="아직 대화가 없습니다" description="상대 userId를 입력하거나 포트폴리오에서 메시지를 보내보세요." />
      ) : (
        <ul className="divide-y divide-linen-200 bg-white border border-[#C9CAAC]/40 rounded-2xl overflow-hidden">
          {conversations.map(conv => (
            <li key={conv.partnerId}>
              <Link
                to={`/messages/${conv.partnerId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-linen-50 transition-colors"
              >
                <Avatar nickname={names[conv.partnerId] || `#${conv.partnerId}`} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-800">{names[conv.partnerId] || `유저 #${conv.partnerId}`}</span>
                    <span className="text-xs text-slate-400 shrink-0">{timeAgo(conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{conv.lastMessage}</p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="shrink-0 bg-crimson-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
