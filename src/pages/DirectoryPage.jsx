import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { postApi } from '../api/postApi'
import { userApi } from '../api/userApi'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'

// 백엔드에 유저 목록 API가 없어, 에셋 작성자들을 모아 디렉토리를 구성(클라이언트).
// 유저목록 API 생기면 그걸로 교체.
export default function DirectoryPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    postApi.getList({ size: 100 })
      .then(async res => {
        const posts = res.items ?? []
        const counts = {}
        posts.forEach(p => { if (p.authorId != null) counts[p.authorId] = (counts[p.authorId] ?? 0) + 1 })
        const ids = Object.keys(counts)
        const profiles = await Promise.all(ids.map(id => userApi.getById(id).catch(() => null)))
        setUsers(profiles.filter(Boolean).map(u => ({ ...u, assetCount: counts[u.id] ?? 0 })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const ranked = useMemo(() => {
    const list = [...users].sort((a, b) => b.assetCount - a.assetCount)
    const needle = q.trim().toLowerCase()
    return needle
      ? list.filter(u => u.nickname?.toLowerCase().includes(needle) || u.description?.toLowerCase().includes(needle))
      : list
  }, [users, q])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">크리에이터 디렉토리</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">제작자 포트폴리오를 한눈에 확인하세요.</p>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="닉네임 또는 소개로 검색..."
        className="w-full max-w-md rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E] mb-5" />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>
      ) : ranked.length === 0 ? (
        <EmptyState icon="👥" title="표시할 멤버가 없습니다" description="에셋을 업로드한 멤버가 여기에 표시됩니다." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ranked.map((u, i) => (
            <Link key={u.id} to={`/portfolio/${u.id}`}
              className="relative bg-white border border-[#C9CAAC]/40 rounded-xl p-4 flex items-center gap-4 hover:border-[#869B7E]/60 hover:shadow-md transition-all">
              {i < 3 && (
                <span className={`absolute top-2 right-2 text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${
                  i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : 'bg-orange-400'}`}>{i + 1}위</span>
              )}
              <Avatar src={u.avatarUrl} nickname={u.nickname} size="lg" />
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{u.nickname}</p>
                <p className="text-xs text-slate-400 truncate">{u.description || '소개가 없습니다.'}</p>
                <p className="text-xs text-slate-500 mt-1"><b>{u.assetCount}</b> 에셋 · <span className="text-slate-300">0 좋아요</span></p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
