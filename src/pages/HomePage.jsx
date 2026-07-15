import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

function FeatureCard({ to, icon, title, desc, disabled }) {
  const inner = (
    <div className={`h-full bg-white border rounded-2xl p-5 transition-colors ${
      disabled ? 'border-slate-200 opacity-60' : 'border-slate-200 hover:border-[#869B7E]'}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <p className="font-bold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{desc}</p>
      {disabled && <span className="inline-block mt-3 text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">준비 중</span>}
    </div>
  )
  return disabled ? <div>{inner}</div> : <Link to={to}>{inner}</Link>
}

export default function HomePage() {
  const { user } = useAuth()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* 히어로 */}
      <div className="text-center mb-10">
        <div className="w-14 h-14 rounded-2xl bg-[#869B7E] flex items-center justify-center text-white text-2xl font-black mx-auto mb-4">A</div>
        <h1 className="text-3xl font-bold text-slate-900">AssetBox</h1>
        <p className="text-slate-500 mt-2">3D 에셋을 탐색하고 공유하는 플랫폼</p>
        {!user && (
          <div className="flex gap-3 justify-center mt-6">
            <Link to="/login" className="bg-[#869B7E] text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-[#6b7d64] transition-colors">로그인</Link>
            <Link to="/signup" className="border border-slate-300 px-6 py-2.5 rounded-lg font-semibold text-slate-600 hover:bg-white transition-colors">회원가입</Link>
          </div>
        )}
      </div>

      {/* 기능 카드 */}
      {user && (
        <>
          <p className="text-sm text-slate-400 mb-3">바로가기</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FeatureCard to="/assets"    icon="🧊" title="에셋" desc="3D 에셋 업로드·조회" />
            <FeatureCard to="/requests"  icon="📋" title="요청 게시판" desc="에셋 제작 요청 등록·조회" />
            <FeatureCard to="/directory" icon="👥" title="크리에이터" desc="제작자 포트폴리오" />
            <FeatureCard to="/inbox"     icon="💬" title="메시지" desc="유저 간 1:1 다이렉트 메시지" />
            <FeatureCard to="/profile"   icon="🙂" title="내 프로필" desc="내 포트폴리오·계정" />
            <FeatureCard icon="🛠" title="관리자" desc="회원·게시물·피드백 관리" disabled />
          </div>
        </>
      )}

      {/* 미니게임 오락실 — 대기 중 즐기기 (로그인 여부 무관) */}
      <Link to="/games"
        className="mt-12 flex items-center gap-4 rounded-2xl p-5 bg-gradient-to-r from-sage-100 to-sage-50
                   border border-sage-200/60 hover:shadow-md transition-shadow">
        <span className="text-4xl">🕹</span>
        <div className="flex-1">
          <p className="font-bold text-slate-800">기다리는 동안 한 판!</p>
          <p className="text-sm text-slate-500 mt-0.5">에셋을 기다리는 동안 즐기는 미니게임 오락실 — 사이트 안에서 바로 플레이</p>
        </div>
        <span className="text-sm font-bold text-[#556350] shrink-0">플레이 →</span>
      </Link>
    </div>
  )
}
