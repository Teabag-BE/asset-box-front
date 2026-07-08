import { useEffect, useState } from 'react'
import { categoryApi } from '../../api/categoryApi'

const selectClass = 'w-full rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E] transition-colors'

export default function CategorySelector({ onSelect }) {
  const [roots, setRoots]   = useState([])
  const [mids, setMids]     = useState([])
  const [leaves, setLeaves] = useState([])
  const [rootId, setRootId] = useState('')
  const [midId, setMidId]   = useState('')
  const [leafId, setLeafId] = useState('')

  useEffect(() => {
    categoryApi.getRoots().then(setRoots).catch(() => {})
  }, [])

  // 대분류만 필수, 중·소분류는 선택. 선택된 가장 깊은 단계의 id 를 categoryId 로 넘긴다.
  // (대분류만 고르면 대분류 id, 중분류까지 고르면 중분류 id, 소분류까지 고르면 소분류 id)
  function emit(root, mid, leaf) {
    const deepest = leaf || mid || root
    onSelect(deepest ? Number(deepest) : null)
  }

  async function handleRoot(id) {
    setRootId(id); setMidId(''); setLeafId(''); setMids([]); setLeaves([])
    emit(id, '', '')
    if (id) {
      const children = await categoryApi.getChildren(id)
      setMids(children)
    }
  }

  async function handleMid(id) {
    setMidId(id); setLeafId(''); setLeaves([])
    emit(rootId, id, '')
    if (id) {
      const children = await categoryApi.getChildren(id)
      setLeaves(children)
    }
  }

  function handleLeaf(id) {
    setLeafId(id)
    emit(rootId, midId, id)
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">
        카테고리 <span className="text-crimson-600">*</span>
        <span className="text-slate-400 font-normal"> 대분류는 필수 · 중/소분류는 선택 (안 골라도 태그로 검색돼요)</span>
      </label>
      <select value={rootId} onChange={e => handleRoot(e.target.value)} className={selectClass}>
        <option value="">대분류 선택</option>
        {roots.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {mids.length > 0 && (
        <select value={midId} onChange={e => handleMid(e.target.value)} className={selectClass}>
          <option value="">중분류 선택</option>
          {mids.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {leaves.length > 0 && (
        <select value={leafId} onChange={e => handleLeaf(e.target.value)} className={selectClass}>
          <option value="">소분류 선택</option>
          {leaves.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
    </div>
  )
}
