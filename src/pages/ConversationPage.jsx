import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { messageApi } from '../api/messageApi'
import { resolveUserName } from '../utils/userNames'
import Spinner from '../components/Spinner'
import Avatar from '../components/Avatar'
import { useToast } from '../components/Toast'

function MessageBubble({ msg, isMe }) {
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
        isMe ? 'bg-[#869B7E] text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
      }`}>
        {msg.content}
        <div className={`text-[11px] mt-1 ${isMe ? 'text-white/70' : 'text-slate-400'}`}>
          {new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          {isMe && <span className="ml-1">{msg.read ? '읽음' : ''}</span>}
        </div>
      </div>
    </div>
  )
}

export default function ConversationPage() {
  const { partnerId } = useParams()
  const toast = useToast()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [partner, setPartner] = useState({ id: null, name: '' })
  const bottomRef = useRef(null)

  // 상대 표시 이름 해석 (없으면 "유저 #번호" 폴백)
  useEffect(() => {
    let active = true
    resolveUserName(partnerId).then(name => { if (active) setPartner({ id: partnerId, name }) })
    return () => { active = false }
  }, [partnerId])

  // 아직 못 받았거나 다른 대화의 이름이면 번호로 폴백
  const partnerLabel = (String(partner.id) === String(partnerId) && partner.name) || `유저 #${partnerId}`

  // 1:1 대화에서 "내 메시지"는 보낸 사람이 상대가 아닌 것 (내 userId 없이 판정)
  const isMine = (msg) => String(msg.senderId) !== String(partnerId)

  const load = useCallback(() => {
    return messageApi.getConversation(partnerId)
      // 백엔드는 최신순(DESC) → 화면은 오래된→최신 순으로 뒤집음
      .then(msgs => setMessages([...msgs].reverse()))
  }, [partnerId])

  // 최초 로드 + 읽음 처리, 이후 5초 폴링 (loading 은 초기값 true → 첫 로드에서 해제)
  useEffect(() => {
    let active = true
    load()
      .then(() => messageApi.markRead(partnerId).catch(() => {}))
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false))

    const id = setInterval(() => {
      load().then(() => messageApi.markRead(partnerId).catch(() => {})).catch(() => {})
    }, 5000)
    return () => { active = false; clearInterval(id) }
  }, [partnerId, load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      const sent = await messageApi.send(Number(partnerId), text)
      setMessages(prev => [...prev, sent])
    } catch (err) {
      setError(err.message)
      setInput(text)
      toast('메시지 전송에 실패했어요', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex items-center gap-3 pb-3 border-b border-linen-200 mb-3">
        <Link to="/inbox" className="text-slate-400 hover:text-slate-600 text-lg">←</Link>
        <Avatar nickname={partnerLabel} size="md" />
        <Link to={`/portfolio/${partnerId}`} className="font-semibold text-slate-800 text-sm hover:text-[#556350]">{partnerLabel}</Link>
      </div>

      {error && <p className="text-crimson-600 text-sm mb-2">{error}</p>}

      <div className="flex-1 overflow-y-auto px-1">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
        ) : messages.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">첫 메시지를 보내보세요.</p>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} isMe={isMine(msg)} />)
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 pt-3 border-t border-slate-200 mt-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="메시지 입력..."
          maxLength={1000}
          className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[#869B7E]"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}
          className="bg-[#869B7E] disabled:bg-[#a9b8a3] text-white rounded-full px-5 py-2 text-sm font-medium transition-colors">
          전송
        </button>
      </form>
    </div>
  )
}
