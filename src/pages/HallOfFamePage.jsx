import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { postApi } from '../api/postApi'
import { userApi } from '../api/userApi'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'
import DirectoryTabs from '../features/post/DirectoryTabs'

// 명예의 전당 — 크리에이터를 기여도로 랭킹.
// 현재 지표: 공유한 에셋 수(목록 API로 집계 가능). 좋아요/조회수는 목록 아이템에 아직
// 포함되지 않아(디테일에만 있고, 디테일 호출은 조회수를 증가시킴) 랭킹에 쓰지 않는다.
// 백엔드 목록 DTO에 likeCount 가 추가되면 아래 score 계산만 바꾸면 좋아요 기반으로 승격된다.
const MEDALS = ['🥇', '🥈', '🥉']

// 시상대 배치용 스타일(1위=금, 2위=은, 3위=동).
const PODIUM = [
  { ring: 'ring-amber-400',  badge: 'bg-amber-500',  glow: 'shadow-[0_8px_30px_rgba(230,181,102,0.35)]', h: 'sm:mt-0'  },
  { ring: 'ring-slate-300',  badge: 'bg-slate-400',  glow: 'shadow-md',                                   h: 'sm:mt-8'  },
  { ring: 'ring-orange-300', badge: 'bg-orange-400', glow: 'shadow-md',                                   h: 'sm:mt-12' },
]

export default function HallOfFamePage() {
  const [creators, setCreators] = useState([])
  const [totalAssets, setTotalAssets] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    // 에셋 목록을 모아 작성자별 에셋 수를 집계 → 프로필과 합쳐 랭킹.
    postApi.getList({ size: 100 })
      .then(async res => {
        const posts = res.items ?? []
        const counts = {}
        posts.forEach(p => { if (p.authorId != null) counts[p.authorId] = (counts[p.authorId] ?? 0) + 1 })
        const ids = Object.keys(counts)
        const profiles = await Promise.all(ids.map(id => userApi.getById(id).catch(() => null)))
        if (!alive) return
        const merged = profiles
          .filter(Boolean)
          .map(u => ({ ...u, assetCount: counts[u.id] ?? 0 }))
          .sort((a, b) => b.assetCount - a.assetCount)
        setCreators(merged)
        setTotalAssets(posts.length)
      })
      .catch(() => { if (alive) setError('명예의 전당을 불러오지 못했습니다.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const top3 = useMemo(() => creators.slice(0, 3), [creators])
  const rest = useMemo(() => creators.slice(3), [creators])
  // 시상대는 시각적으로 2위-1위-3위 순서로 배치(가운데가 1위).
  const podiumOrder = useMemo(() => [top3[1], top3[0], top3[2]].filter(Boolean), [top3])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <DirectoryTabs />
      {/* 헤더 */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#a98a4b]">
          <span className="w-6 h-px bg-[#d9b978]" /> AssetBox Hall of Fame <span className="w-6 h-px bg-[#d9b978]" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 mt-3 flex items-center justify-center gap-2">
          🏆 명예의 전당
        </h1>
        <p className="text-sm text-slate-500 mt-2">가장 많은 에셋을 공유하며 팀에 기여한 크리에이터들 🙌</p>
        {!loading && !error && creators.length > 0 && (
          <div className="mt-4 inline-flex items-center gap-4 text-xs text-slate-500 font-mono bg-white border border-[#C9CAAC]/50 rounded-full px-4 py-1.5">
            <span><b className="text-slate-800">{creators.length}</b> 크리에이터</span>
            <span className="text-slate-300">·</span>
            <span><b className="text-slate-800">{totalAssets}</b> 에셋</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
      ) : error ? (
        <EmptyState icon="⚠️" title="불러오기 실패" description={error} />
      ) : creators.length === 0 ? (
        <EmptyState icon="🏆" title="아직 전당에 오른 크리에이터가 없어요" description="에셋을 업로드하면 여기에 이름을 올릴 수 있어요." />
      ) : (
        <>
          {/* 시상대 (top 3) */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end justify-center gap-4 sm:gap-6 mb-10">
            {podiumOrder.map(u => {
              const rank = creators.indexOf(u) // 0,1,2
              const p = PODIUM[rank]
              const big = rank === 0
              return (
                <Link key={u.id} to={`/portfolio/${u.id}`}
                  className={`relative flex flex-col items-center ${p.h} bg-white border border-[#C9CAAC]/50 rounded-2xl px-6 py-5 w-full sm:w-44 hover:border-[#869B7E]/60 transition-all ${p.glow}`}>
                  <div className={`absolute -top-3 ${p.badge} text-white text-xs font-bold px-2 py-0.5 rounded-full shadow`}>{rank + 1}위</div>
                  <div className={`rounded-full ring-4 ${p.ring} ${big ? 'ring-offset-2' : ''}`}>
                    <Avatar src={u.avatarUrl} nickname={u.nickname} size={big ? 'xl' : 'lg'} />
                  </div>
                  <div className="text-2xl mt-2 leading-none">{MEDALS[rank]}</div>
                  <p className={`font-bold text-slate-900 mt-1 text-center truncate max-w-full ${big ? 'text-lg' : 'text-base'}`}>{u.nickname}</p>
                  <p className="text-xs text-slate-400 truncate max-w-full">{u.major || ' '}</p>
                  <p className="mt-2 text-sm"><b className="text-[#556350]">{u.assetCount}</b> <span className="text-slate-400">에셋</span></p>
                </Link>
              )
            })}
          </div>

          {/* 4위 이하 랭킹 리스트 */}
          {rest.length > 0 && (
            <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl divide-y divide-[#C9CAAC]/30 overflow-hidden">
              {rest.map((u, i) => (
                <Link key={u.id} to={`/portfolio/${u.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-linen-50 transition-colors">
                  <span className="w-7 text-center font-mono font-bold text-slate-400 tabular-nums">{i + 4}</span>
                  <Avatar src={u.avatarUrl} nickname={u.nickname} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{u.nickname}</p>
                    <p className="text-xs text-slate-400 truncate">{u.description || u.major || '소개가 없습니다.'}</p>
                  </div>
                  <span className="text-sm text-slate-600 shrink-0"><b>{u.assetCount}</b> <span className="text-slate-400">에셋</span></span>
                </Link>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-slate-400 mt-6">
            현재는 <b>공유한 에셋 수</b> 기준 랭킹이에요. 좋아요·조회수 기반 랭킹은 곧 추가됩니다.
          </p>
        </>
      )}
    </div>
  )
}
