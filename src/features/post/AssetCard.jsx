import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../components/Avatar'
import { timeAgo } from '../../utils/timeAgo'
import { resolveUserProfile, displayName } from '../../utils/userNames'

// 통계용 미니 아이콘 — 이모지 대신 선 아이콘으로 통일(플랫폼별 렌더 차이·과한 존재감 방지).
function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.3 12.6 12 20l7.7-7.4a5 5 0 1 0-7.2-7l-.5.6-.5-.6a5 5 0 1 0-7.2 7Z" />
    </svg>
  )
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

const PREVIEW_THEMES = [
  { bg: 'linear-gradient(145deg, #eef5f2 0%, #d8e4de 50%, #f8f4ea 100%)', main: '#5f7f72', accent: '#d6a94d' },
  { bg: 'radial-gradient(circle at 50% 20%, #2d4653 0%, #101820 58%, #05070a 100%)', main: '#7ec8d8', accent: '#f2f4ec' },
  { bg: 'linear-gradient(145deg, #22272f 0%, #11151d 55%, #030405 100%)', main: '#c94f4f', accent: '#8daa84' },
  { bg: 'linear-gradient(145deg, #f2f0e8 0%, #ddd8ca 100%)', main: '#7f8f78', accent: '#2e3829' },
]

function seededIndex(value, length) {
  const seed = String(value ?? 'asset').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return seed % length
}

function AssetPreviewFallback({ title, extension }) {
  const theme = PREVIEW_THEMES[seededIndex(title, PREVIEW_THEMES.length)]
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: theme.bg }}>
      <div className="absolute inset-0 opacity-35"
        style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, white 0 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-lg border border-white/45 bg-white/10 shadow-2xl backdrop-blur-sm" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-lg"
        style={{ background: theme.main, boxShadow: `0 24px 70px ${theme.main}66` }} />
      <div className="absolute left-1/2 top-[38%] h-2 w-28 -translate-x-1/2 rounded-full" style={{ background: theme.accent }} />
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
        <div>
          <p className="max-w-[13rem] truncate text-sm font-bold text-white drop-shadow">{title}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-white/70">{extension || 'asset'} preview</p>
        </div>
        <div className="h-8 w-8 rounded-md border border-white/25 bg-white/15" />
      </div>
    </div>
  )
}

export default function AssetCard({
  id, title, thumbnailUrl, authorNickname, authorId, tags = [], createdAt,
  fileExtension, viewCount, likeCount, commentCount, downloadCount,
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const [profile, setProfile] = useState(null)

  // 백엔드 post DTO가 닉네임/아바타를 안 주므로 authorId로 프로필을 해석 (캐시됨)
  useEffect(() => {
    if (authorId == null) return undefined
    let active = true
    resolveUserProfile(authorId).then(p => { if (active) setProfile(p) })
    return () => { active = false }
  }, [authorId])

  const author = authorNickname || (profile ? displayName(profile, authorId) : null) || (authorId != null ? `#${authorId}` : '익명')
  const created = timeAgo(createdAt)
  const showThumbnail = thumbnailUrl && !imageFailed

  return (
    <Link to={`/assets/${id}`} className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-[#DAD8C5] bg-white shadow-[0_8px_24px_rgba(35,45,32,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#869B7E]/70 hover:shadow-[0_14px_34px_rgba(35,45,32,0.15)]">
      {/* 썸네일 */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[#EEF0E8]">
        {showThumbnail ? (
          <img src={thumbnailUrl} alt={title} onError={() => setImageFailed(true)}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.025]" />
        ) : (
          <AssetPreviewFallback title={title} extension={fileExtension} />
        )}
        {fileExtension && (
          <div className="absolute left-3 top-3">
            <span className="rounded-md bg-[#111827]/75 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
              {fileExtension}
            </span>
          </div>
        )}
      </div>

      {/* 본문 — flex 컬럼으로 태그 유무와 무관하게 통계 줄을 하단에 고정(카드 높이·정렬 통일) */}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-bold text-slate-900 transition-colors group-hover:text-[#556350]">{title}</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <Avatar src={profile?.avatarUrl} nickname={author} size="sm" />
              <span className="truncate">{author}</span>
              {created && <><span className="text-slate-300">·</span><span className="shrink-0 text-slate-400">{created}</span></>}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-semibold text-sage-700">공개</span>
        </div>

        {/* 태그 줄 — 없어도 높이를 확보해 카드 간 정렬 유지 */}
        <div className="flex min-h-[20px] flex-wrap items-center gap-1">
          {tags.slice(0, 3).map(t => (
            <span key={t} className="rounded-full bg-[#EFF3EC] px-2 py-0.5 text-[10px] font-medium text-[#556350]">#{t}</span>
          ))}
          {tags.length > 3 && <span className="text-[10px] text-slate-400">+{tags.length - 3}</span>}
        </div>

        {/* 통계 — mt-auto 로 항상 카드 맨 아래 */}
        <div className="mt-auto flex items-center gap-3.5 border-t border-linen-200 pt-2.5 text-xs text-slate-400 tabular-nums">
          <span className="flex items-center gap-1 text-crimson-400"><HeartIcon filled={(likeCount ?? 0) > 0} /><span className="text-slate-500">{likeCount ?? 0}</span></span>
          <span className="flex items-center gap-1"><EyeIcon /><span className="text-slate-500">{viewCount ?? 0}</span></span>
          {downloadCount > 0 && <span className="flex items-center gap-1"><span>⬇</span> {downloadCount}</span>}
          {commentCount > 0 && <span className="flex items-center gap-1"><span>💬</span> {commentCount}</span>}
        </div>
      </div>
    </Link>
  )
}
