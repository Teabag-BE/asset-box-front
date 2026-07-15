import { useEffect, useRef, useState } from 'react'
import { categoryApi } from '../../api/categoryApi'

const selectClass = 'w-full rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E] transition-colors'

// value: 외부(예: AI 추천)에서 categoryId 를 밀어넣어 드롭다운을 자동으로 채우게 하는 선택 prop.
//        평소 수동 선택에는 넘기지 않아도 된다(EditAssetPage 등은 미사용).
export default function CategorySelector({ onSelect, value }) {
  const [roots, setRoots]   = useState([])
  const [mids, setMids]     = useState([])
  const [leaves, setLeaves] = useState([])
  const [rootId, setRootId] = useState('')
  const [midId, setMidId]   = useState('')
  const [leafId, setLeafId] = useState('')
  const [allCats, setAllCats] = useState(null)   // 조상 체인 해석용 플랫 목록(한 번만 로드)
  const lastAppliedRef = useRef(undefined)        // 같은 value 로 중복 적용/수동선택 되돌림 방지

  useEffect(() => {
    categoryApi.getRoots().then(setRoots).catch(() => {})
  }, [])

  // value 가 "새로" 들어올 때만, 그 categoryId 의 조상 체인을 풀어 드롭다운을 채우고 emit.
  // lastAppliedRef 로 한 번 적용한 value 는 다시 처리하지 않는다 → 이후 수동 선택을 덮어쓰지 않는다.
  useEffect(() => {
    if (value == null || lastAppliedRef.current === value) return
    lastAppliedRef.current = value
    let cancelled = false
    ;(async () => {
      try {
        let all = allCats
        if (!all) {
          all = await categoryApi.getAll()
          if (cancelled) return
          setAllCats(all)
        }
        const byId = new Map(all.map(c => [c.id, c]))
        const chain = []
        let cur = byId.get(Number(value))
        while (cur) {
          chain.unshift(cur)
          cur = cur.parentId != null ? byId.get(cur.parentId) : null
        }
        if (cancelled || chain.length === 0) return
        const [r, m, l] = chain
        const midList = r ? await categoryApi.getChildren(r.id) : []
        const leafList = m ? await categoryApi.getChildren(m.id) : []
        if (cancelled) return
        setMids(midList)
        setLeaves(leafList)
        setRootId(r ? String(r.id) : '')
        setMidId(m ? String(m.id) : '')
        setLeafId(l ? String(l.id) : '')
        emit(r?.id ?? '', m?.id ?? '', l?.id ?? '')
      } catch {
        /* 무시 — 실패해도 수동 선택으로 진행 가능 */
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

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
