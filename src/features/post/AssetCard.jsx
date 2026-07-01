import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../components/Avatar'
import { timeAgo } from '../../utils/timeAgo'

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
  const author = authorNickname || (authorId != null ? `#${authorId}` : '익명')
  const created = timeAgo(createdAt)
  const showThumbnail = thumbnailUrl && !imageFailed

  return (
    <Link to={`/assets/${id}`} className="group relative block overflow-hidden rounded-lg border border-[#DAD8C5] bg-white shadow-[0_8px_24px_rgba(35,45,32,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#869B7E]/70 hover:shadow-[0_14px_34px_rgba(35,45,32,0.15)]">
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

      <div className="space-y-3 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-bold text-slate-900 transition-colors group-hover:text-[#556350]">{title}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Avatar nickname={author} size="sm" />
              <span className="truncate">{author}</span>
              {created && <><span className="text-slate-300">·</span><span className="shrink-0">{created}</span></>}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-semibold text-sage-700">공개</span>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map(t => (
              <span key={t} className="rounded-full bg-[#EFF3EC] px-2 py-0.5 text-[10px] font-medium text-[#556350]">#{t}</span>
            ))}
            {tags.length > 3 && <span className="text-[10px] text-slate-400">+{tags.length - 3}</span>}
          </div>
        )}
        {/* 통계 (백엔드가 likeCount/viewCount 등 DTO 노출하면 자동으로 채워짐) */}
        <div className="flex items-center gap-3 border-t border-linen-200 pt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="text-crimson-400">♥</span> {likeCount ?? 0}</span>
          <span className="flex items-center gap-1"><span>👁</span> {viewCount ?? 0}</span>
          {downloadCount > 0 && <span className="flex items-center gap-1"><span>⬇</span> {downloadCount}</span>}
          {commentCount > 0 && <span className="flex items-center gap-1"><span>💬</span> {commentCount}</span>}
        </div>
      </div>
    </Link>
  )
}
