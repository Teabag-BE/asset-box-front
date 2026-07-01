import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postApi } from '../api/postApi'
import { categoryApi } from '../api/categoryApi'
import AssetGrid from '../features/post/AssetGrid'
import CategorySidebar from '../features/post/CategorySidebar'
import Button from '../components/Button'

// 정렬 탭 — 최신순만 동작(백엔드 정렬 기본). 인기/조회는 백엔드 카운트 노출되면 활성
const SORTS = [
  { key: 'latest', label: '최신순', enabled: true },
  { key: 'popular', label: '인기순', enabled: false },
  { key: 'views', label: '조회순', enabled: false },
]

export default function AssetBoardPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [categoryId, setCategoryId] = useState(null)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState(null)
  const [sort, setSort] = useState('latest')

  useEffect(() => {
    postApi.getList({ size: 100 })
      .then(res => setItems(res.items ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
    categoryApi.getAll().then(setCats).catch(() => {})
  }, [])

  // 선택 카테고리의 하위(자손) id 집합 — 클라이언트 필터용
  const subtreeIds = useMemo(() => {
    if (categoryId == null) return null
    const set = new Set([categoryId])
    let added = true
    while (added) {
      added = false
      for (const c of cats) {
        if (c.parentId != null && set.has(c.parentId) && !set.has(c.id)) { set.add(c.id); added = true }
      }
    }
    return set
  }, [categoryId, cats])

  // 인기 태그(클라이언트 집계): 불러온 에셋 태그 빈도 상위 12
  const popularTags = useMemo(() => {
    const freq = {}
    items.forEach(p => (p.tags ?? []).forEach(t => { freq[t] = (freq[t] ?? 0) + 1 }))
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t)
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(p => {
      if (subtreeIds && !subtreeIds.has(p.categoryId)) return false
      if (tag && !(p.tags ?? []).includes(tag)) return false
      if (q && !(p.title?.toLowerCase().includes(q) || (p.tags ?? []).some(t => t.toLowerCase().includes(q)))) return false
      return true
    })
  }, [items, subtreeIds, tag, search])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">에셋</h1>
          <p className="text-sm text-slate-500 mt-1">새롭게 업로드된 3D 에셋을 둘러보세요.</p>
        </div>
        <Button onClick={() => navigate('/assets/new')}>+ 에셋 등록</Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <CategorySidebar selected={categoryId} onSelect={(id) => { setCategoryId(id); setTag(null) }}
          popularTags={popularTags} onTag={setTag} />

        <div className="flex-1 min-w-0">
          {/* 검색 + 정렬 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="에셋 제목·태그 검색"
              className="flex-1 min-w-[180px] rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E]" />
            <div className="flex gap-1">
              {SORTS.map(s => (
                <button key={s.key} disabled={!s.enabled} onClick={() => s.enabled && setSort(s.key)}
                  title={s.enabled ? '' : '백엔드 준비 중'}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    sort === s.key ? 'bg-[#869B7E] text-white'
                    : s.enabled ? 'bg-white text-slate-500 border border-[#C9CAAC]/50 hover:border-[#869B7E]/40'
                    : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {(tag || categoryId != null) && (
            <div className="flex items-center gap-2 mb-3 text-sm">
              {tag && <span className="bg-sage-100 text-sage-700 rounded-full px-2.5 py-0.5 text-xs">#{tag} <button onClick={() => setTag(null)}>×</button></span>}
              {categoryId != null && <span className="text-slate-400 text-xs">카테고리 필터 적용 중</span>}
            </div>
          )}

          <AssetGrid posts={filtered} loading={loading} error={error} />
        </div>
      </div>
    </div>
  )
}
