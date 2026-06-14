import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { postApi } from '../api/postApi'
import AssetGrid from '../features/post/AssetGrid'

// 백엔드 검색 API가 없어 불러온 에셋에서 클라이언트 검색(제목·태그). 생기면 서버사이드로 교체.
export default function SearchResultsPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    postApi.getList({ size: 100 })
      .then(res => setItems(res.items ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return items.filter(p =>
      p.title?.toLowerCase().includes(needle) || (p.tags ?? []).some(t => t.toLowerCase().includes(needle)))
  }, [items, q])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">'{q}' 검색 결과</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">총 {results.length}개 (제목·태그 검색)</p>
      <AssetGrid posts={results} loading={loading} error={error} />
    </div>
  )
}
