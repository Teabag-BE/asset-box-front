import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { resolveUserProfile, displayName } from '../utils/userNames'

// 유저 칩 — 아바타 + 닉네임 + 전공을 보여주고, 클릭하면 그 유저의 포트폴리오로 이동.
// 백엔드가 id만 내려주는 곳(요청 상세 등)에서 프로필을 비동기로 해석해 채운다(캐시).
export default function UserChip({ id, size = 'md' }) {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (id == null) return undefined
    let alive = true
    resolveUserProfile(id).then(p => { if (alive) setProfile(p) })
    return () => { alive = false }
  }, [id])

  if (id == null) return null
  const name = profile ? displayName(profile, id) : `유저 #${id}`

  return (
    <Link to={`/portfolio/${id}`} title={`${name} 포트폴리오 보기`}
      className="inline-flex items-center gap-2 rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-linen-100 transition-colors group max-w-full">
      <Avatar src={profile?.avatarUrl} nickname={name} size={size === 'sm' ? 'sm' : 'md'} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 truncate group-hover:text-[#556350]">{name}</span>
        {profile?.major && <span className="block text-[11px] text-slate-400 truncate">{profile.major}</span>}
      </span>
    </Link>
  )
}
