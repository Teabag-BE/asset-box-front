import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { messageApi } from '../api/messageApi'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)

  // 폴링: 안 읽은 메시지 수 (15초)
  useEffect(() => {
    if (!user) return   // 로그아웃 시 배지는 user 가드로 안 보이므로 reset 불필요
    let active = true
    const fetchUnread = () =>
      messageApi.getUnread().then(r => active && setUnread(r.count)).catch(() => {})
    fetchUnread()
    const id = setInterval(fetchUnread, 15000)
    return () => { active = false; clearInterval(id) }
  }, [user])

  const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
  const navCls = (to) => `px-3 py-1.5 text-sm rounded-lg transition-colors ${
    isActive(to) ? 'text-[#556350] font-semibold bg-sage-50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`

  return (
    <div className="min-h-screen bg-[#F6F3EB] flex flex-col">
      <header className="sticky top-0 z-50 bg-white border-b border-[#C9CAAC]/50 px-4 shadow-sm">
        <div className="max-w-5xl mx-auto h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#869B7E] flex items-center justify-center text-white text-xs font-black group-hover:bg-[#6b7d64] transition-colors">A</div>
            <span className="text-slate-800 font-bold text-base tracking-tight">AssetBox</span>
          </Link>

          {user && (
            <nav className="flex items-center gap-0.5">
              <Link to="/assets" className={navCls('/assets')}>에셋</Link>
              <Link to="/requests" className={navCls('/requests')}>요청 게시판</Link>
              <Link to="/directory" className={navCls('/directory')}>크리에이터</Link>
              <Link to="/hall" className={navCls('/hall')}>🏆 명예의 전당</Link>
            </nav>
          )}

          {user && (
            <form className="hidden md:block flex-1 max-w-xs"
              onSubmit={e => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) navigate(`/search?q=${encodeURIComponent(q)}`) }}>
              <input name="q" placeholder="에셋 검색 (제목·태그)"
                className="w-full rounded-lg border border-[#C9CAAC]/60 bg-linen-50 px-3 py-1.5 text-sm outline-none focus:border-[#869B7E]" />
            </form>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {user ? (
              <>
                <Link to="/inbox" className="relative p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-50" title="메시지">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {unread > 0 && (
                    <span className="absolute top-0.5 right-0.5 bg-crimson-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
                <button onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                  <span className="w-7 h-7 rounded-full bg-sage-100 text-sage-700 text-xs font-bold flex items-center justify-center">
                    {user.nickname?.[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className="text-sm text-slate-700 hidden sm:block font-medium">{user.nickname}</span>
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <button onClick={() => { logout(); navigate('/login') }}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-50">
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 transition-colors">로그인</Link>
                <Link to="/signup" className="bg-[#869B7E] text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#6b7d64] transition-colors shadow-sm">회원가입</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1"><Outlet /></main>
    </div>
  )
}
