import { useEffect, useState } from 'react'
import { categoryApi } from '../../api/categoryApi'

// 3단 레이지 카테고리 트리: roots → getChildren(root)=중분류 → getChildren(mid)=소분류
//  - 루트/중분류 클릭: 펼치기 + 해당 카테고리로 필터(선택)
//  - 소분류 클릭: 해당 소분류로 필터
//  실제 필터는 부모(AssetBoardPage)가 선택 id의 하위까지 클라이언트에서 처리.
export default function CategorySidebar({ selected, onSelect, popularTags = [], onTag }) {
  const [roots, setRoots] = useState([])
  const [midCache, setMidCache] = useState({})   // rootId -> 중분류[]
  const [leafCache, setLeafCache] = useState({}) // midId  -> 소분류[]
  const [openRoot, setOpenRoot] = useState(null)
  const [openMid, setOpenMid] = useState(null)

  useEffect(() => {
    categoryApi.getRoots().then(setRoots).catch(() => {})
  }, [])

  async function clickRoot(r) {
    onSelect(r.id)
    if (openRoot === r.id) { setOpenRoot(null); setOpenMid(null); return }
    setOpenRoot(r.id); setOpenMid(null)
    if (!midCache[r.id]) {
      const kids = await categoryApi.getChildren(r.id).catch(() => [])
      setMidCache(prev => ({ ...prev, [r.id]: kids }))
    }
  }

  async function clickMid(m) {
    onSelect(m.id)
    if (openMid === m.id) { setOpenMid(null); return }
    setOpenMid(m.id)
    if (!leafCache[m.id]) {
      const kids = await categoryApi.getChildren(m.id).catch(() => [])
      setLeafCache(prev => ({ ...prev, [m.id]: kids }))
    }
  }

  const itemCls = (active) =>
    `w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
      active ? 'bg-sage-100 text-sage-700 font-semibold' : 'text-slate-600 hover:bg-linen-100'}`
  const arrow = (open) => <span className="text-slate-300 text-xs">{open ? '▾' : '▸'}</span>

  return (
    <aside className="w-full lg:w-56 shrink-0 space-y-4">
      <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-3">
        <p className="text-xs font-semibold text-slate-400 px-2 mb-2">카테고리</p>
        <button className={itemCls(selected == null)} onClick={() => onSelect(null)}>전체</button>

        {roots.map(root => {
          const mids = midCache[root.id] ?? []
          const rootOpen = openRoot === root.id
          return (
            <div key={root.id}>
              <button className={`${itemCls(selected === root.id)} flex items-center justify-between`}
                onClick={() => clickRoot(root)}>
                <span>{root.name}</span>{arrow(rootOpen)}
              </button>

              {rootOpen && mids.map(mid => {
                const leaves = leafCache[mid.id] ?? []
                const midOpen = openMid === mid.id
                return (
                  <div key={mid.id}>
                    <button className={`${itemCls(selected === mid.id)} pl-6 flex items-center justify-between`}
                      onClick={() => clickMid(mid)}>
                      <span>{mid.name}</span>
                      {(leaves.length > 0 || !leafCache[mid.id]) && arrow(midOpen)}
                    </button>
                    {midOpen && leaves.map(leaf => (
                      <button key={leaf.id} className={`${itemCls(selected === leaf.id)} pl-10`}
                        onClick={() => onSelect(leaf.id)}>
                        {leaf.name}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* 인기 태그 — 백엔드 popular-tags 없어 현재는 불러온 에셋에서 클라이언트 집계 */}
      {popularTags.length > 0 && (
        <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-3">
          <p className="text-xs font-semibold text-slate-400 px-2 mb-2">인기 태그</p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {popularTags.map(t => (
              <button key={t} onClick={() => onTag?.(t)}
                className="bg-sage-100 text-sage-700 text-xs rounded-full px-2.5 py-1 hover:bg-sage-200 transition-colors">
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
