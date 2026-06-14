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

  async function handleRoot(id) {
    setRootId(id); setMidId(''); setLeafId(''); setMids([]); setLeaves([])
    onSelect(null)
    if (id) {
      const children = await categoryApi.getChildren(id)
      setMids(children)
      if (!children.length) onSelect(Number(id))
    }
  }

  async function handleMid(id) {
    setMidId(id); setLeafId(''); setLeaves([])
    onSelect(null)
    if (id) {
      const children = await categoryApi.getChildren(id)
      setLeaves(children)
      if (!children.length) onSelect(Number(id))
    }
  }

  function handleLeaf(id) {
    setLeafId(id)
    onSelect(id ? Number(id) : null)
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">카테고리 <span className="text-slate-400 font-normal">(선택)</span></label>
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
