import { Link } from 'react-router-dom'
import Avatar from '../../components/Avatar'
import { timeAgo } from '../../utils/timeAgo'

function CubeIcon() {
  return (
    <svg className="w-12 h-12 text-[#C9CAAC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
        d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    </svg>
  )
}

export default function AssetCard({
  id, title, thumbnailUrl, authorNickname, authorId, tags = [], createdAt,
  fileExtension, viewCount, likeCount, commentCount, downloadCount,
}) {
  const author = authorNickname || (authorId != null ? `#${authorId}` : '익명')
  const created = timeAgo(createdAt)

  return (
    <Link to={`/assets/${id}`} className="group relative bg-white rounded-xl overflow-hidden border border-[#C9CAAC]/40 shadow-[0_2px_12px_rgba(44,56,41,0.10)] hover:shadow-[0_8px_28px_rgba(44,56,41,0.18)] hover:border-[#869B7E]/60 hover:-translate-y-0.5 transition-all duration-200 block">
      {/* 썸네일 */}
      <div className="aspect-square bg-linen-100 relative overflow-hidden">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={title} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-linen-50"><CubeIcon /></div>
        )}
        {fileExtension && (
          <div className="absolute bottom-2 left-2">
            <span className="bg-[#2C3829]/80 backdrop-blur-sm text-[#C9CAAC] text-[10px] font-mono uppercase px-2 py-0.5 rounded-md">
              {fileExtension}
            </span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-[#556350] transition-colors">{title}</p>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Avatar nickname={author} size="sm" />
          <span className="truncate">{author}</span>
          {created && <><span className="text-slate-300">·</span><span className="shrink-0">{created}</span></>}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map(t => (
              <span key={t} className="bg-sage-100 text-sage-700 text-[10px] rounded-full px-2 py-0.5">#{t}</span>
            ))}
            {tags.length > 3 && <span className="text-[10px] text-slate-400">+{tags.length - 3}</span>}
          </div>
        )}
        {/* 통계 (백엔드가 likeCount/viewCount 등 DTO 노출하면 자동으로 채워짐) */}
        <div className="flex items-center gap-3 text-xs text-slate-400 pt-1.5 border-t border-linen-200">
          <span className="flex items-center gap-1"><span className="text-crimson-400">♥</span> {likeCount ?? 0}</span>
          <span className="flex items-center gap-1"><span>👁</span> {viewCount ?? 0}</span>
          {downloadCount > 0 && <span className="flex items-center gap-1"><span>⬇</span> {downloadCount}</span>}
          {commentCount > 0 && <span className="flex items-center gap-1"><span>💬</span> {commentCount}</span>}
        </div>
      </div>
    </Link>
  )
}
