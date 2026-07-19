import { Link, useLocation } from 'react-router-dom'

// 크리에이터 섹션 공통 탭 — 멤버 디렉토리와 명예의 전당을 한 섹션으로 묶는다.
// (명예의 전당은 별도 네비 항목이 아니라 크리에이터 하위 탭 — 팀 피드백)
export default function DirectoryTabs() {
  const { pathname } = useLocation()
  const cls = (active) =>
    `px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
      active ? 'bg-[#869B7E] text-white' : 'bg-white border border-[#C9CAAC]/60 text-slate-600 hover:bg-linen-100'
    }`
  return (
    <div className="flex gap-2 mb-5">
      <Link to="/directory" className={cls(pathname === '/directory')}>👥 멤버</Link>
      <Link to="/hall" className={cls(pathname === '/hall')}>🏆 명예의 전당</Link>
    </div>
  )
}
