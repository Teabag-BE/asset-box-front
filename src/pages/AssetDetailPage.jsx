import { useEffect, useState, lazy, Suspense } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { postApi } from '../api/postApi'
import { fileApi } from '../api/fileApi'
import { resolveUserName } from '../utils/userNames'
import { useAuth } from '../auth/AuthContext'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Avatar from '../components/Avatar'

// three.js 묶음은 무거우니 모델이 있을 때만 lazy 로드
const AssetViewer360 = lazy(() => import('../features/viewer/AssetViewer360'))

function formatBytes(bytes) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)}${units[unit]}`
}

// S3 presigned URL로 실제 다운로드를 트리거한다. 백엔드가 Content-Disposition(원본 파일명)을
// 붙여주므로 파일이 S3 key(UUID)가 아니라 원래 이름으로 저장된다.
// (cross-origin URL이라 a.download 속성은 브라우저가 무시하고 서버 헤더를 따른다)
function triggerBrowserDownload(url) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function AssetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [post, setPost] = useState(null)
  const [model, setModel] = useState(null)   // { url, ext } | null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)
  const [authorName, setAuthorName] = useState('')

  // 백엔드 post DTO가 작성자 닉네임을 안 주므로 authorId로 이름을 해석 (캐시됨)
  useEffect(() => {
    const aid = post?.authorId
    if (!aid) return undefined
    let active = true
    resolveUserName(aid).then(n => { if (active) setAuthorName(n) })
    return () => { active = false }
  }, [post?.authorId])

  useEffect(() => {
    let alive = true

    async function loadPost() {
      try {
        const data = await postApi.getDetail(id)
        if (!alive) return
        setPost(data)
        setModel(fileApi.resolveModelFromViewer(data.viewer) ?? await fileApi.resolveModelFromFiles(data.files ?? []))
      } catch (e) {
        if (alive) setError(e.message)
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadPost()
    return () => { alive = false }
  }, [id])

  async function handleDelete() {
    if (!confirm('이 에셋을 삭제할까요?')) return
    try {
      await postApi.remove(id)
      navigate('/assets')
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-7 h-7" /></div>
  if (error) return <p className="text-center text-crimson-600 py-20 text-sm">{error}</p>
  if (!post) return null

  const isMine = user && String(user.id) === String(post.authorId)
  const author = post.authorNickname || authorName || `#${post.authorId}`
  const assetFiles = post.files ?? []

  // 다운로드 버튼: 미리보기용 accessUrl을 직접 열면 파일명이 S3 key(UUID)로 저장되므로,
  // 원본 파일명이 붙은 전용 다운로드 URL(/files/download/presigned-url)을 받아서 내려받는다.
  async function handleDownload(file) {
    const fileId = file.fileId ?? file.id
    try {
      setDownloadingId(fileId)
      const url = fileId ? await fileApi.getDownloadUrl(fileId) : file.accessUrl
      if (url) triggerBrowserDownload(url)
    } catch {
      if (file.accessUrl) triggerBrowserDownload(file.accessUrl) // 실패 시 폴백(이름은 UUID일 수 있음)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link to="/assets" className="text-sm text-slate-400 hover:text-slate-600">← 목록</Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-3">
        {/* ───── 본문 (좌, 2칸) ───── */}
        <div className="lg:col-span-2 space-y-5">
          {/* 뷰어 / 썸네일 */}
          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl overflow-hidden">
            <div className="aspect-video bg-linen-100 flex items-center justify-center">
              {model ? (
                <Suspense fallback={<Spinner className="w-7 h-7" />}>
                  <AssetViewer360
                    modelUrl={model.url}
                    fileExtension={model.ext}
                    textureUrls={model.textures}
                    thumbnailUrl={post.thumbnailUrl}
                    className="w-full h-full"
                  />
                </Suspense>
              ) : post.thumbnailUrl
                ? <img src={post.thumbnailUrl} alt={post.title} className="w-full h-full object-contain" />
                : <span className="text-5xl text-slate-300">🧊</span>}
            </div>
          </div>

          {/* 제목 / 설명 */}
          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                {post.categoryPath?.length > 0 && (
                  <p className="text-xs text-slate-400 mb-1">{post.categoryPath.join(' › ')}</p>
                )}
                <h1 className="text-2xl font-bold text-slate-900">{post.title}</h1>
              </div>
              {isMine && (
                <div className="flex gap-2 shrink-0">
                  {/* TODO(백엔드 수정 API 연결되면): <Link to={`/assets/${id}/edit`}><Button variant="secondary" size="sm">수정</Button></Link> */}
                  <Button variant="danger" size="sm" onClick={handleDelete}>삭제</Button>
                </div>
              )}
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{post.content}</p>

            {post.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-5">
                {post.tags.map(t => <Badge key={t} variant="violet">#{t}</Badge>)}
              </div>
            )}

            {/* ❤️ 좋아요 — 백엔드 like API 생기면 주석 해제
            <div className="mt-5 pt-5 border-t border-linen-200">
              <Button variant={liked ? 'primary' : 'secondary'} onClick={handleLike}>
                ♥ 좋아요 {post.likeCount ?? 0}
              </Button>
            </div> */}
          </div>

          {/* 💬 댓글 — 백엔드 CommentController 구현되면 주석 해제
          <CommentSection targetId={id} type="post" /> */}
          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-6">
            <h2 className="font-semibold text-slate-800 text-sm mb-1">💬 댓글</h2>
            <p className="text-xs text-slate-400">댓글 기능은 백엔드 준비 중입니다.</p>
          </div>
        </div>

        {/* ───── 사이드바 (우, 1칸) ───── */}
        <aside className="space-y-5">
          {/* 에셋 정보 */}
          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-3">에셋 정보</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-400">좋아요</dt>
              <dd className="text-slate-700 text-right">{post.likeCount ?? 0}</dd>
              <dt className="text-slate-400">조회수</dt>
              <dd className="text-slate-700 text-right">{post.viewCount ?? 0}</dd>
              {/* 백엔드가 DTO에 노출하면 자동 표시됨 (폴리곤/용량 등) */}
              {post.polygon != null && (<><dt className="text-slate-400">폴리곤</dt><dd className="text-slate-700 text-right">{post.polygon.toLocaleString()}</dd></>)}
            </dl>
          </div>

          {/* 작성자 */}
          <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-3">작성자</h2>
            <div className="flex items-center gap-3 mb-4">
              <Avatar nickname={author} size="md" />
              <span className="text-sm font-medium text-slate-800">{author}</span>
            </div>
            <div className="space-y-2">
              <Button variant="secondary" size="sm" className="w-full justify-center"
                onClick={() => navigate(`/portfolio/${post.authorId}`)}>
                포트폴리오 보기
              </Button>
              {!isMine && (
                <Button variant="secondary" size="sm" className="w-full justify-center"
                  onClick={() => navigate(`/messages/${post.authorId}`)}>
                  💬 메시지 보내기
                </Button>
              )}
            </div>
          </div>

          {/* 연결된 요청 */}
          {post.linkedRequestId && (
            <Link to={`/requests/${post.linkedRequestId}`}
              className="block bg-white border border-[#C9CAAC]/40 rounded-2xl p-5 text-sm text-[#556350] hover:border-[#869B7E]/60 transition-colors">
              🔗 연결된 요청 #{post.linkedRequestId} 보기
            </Link>
          )}

          {assetFiles.length > 0 && (
            <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-3">📦 다운로드 파일</h2>
              <div className="space-y-2">
                {assetFiles.map(file => {
                  const fid = file.fileId ?? file.id
                  return (
                  <button key={fid}
                    type="button"
                    onClick={() => handleDownload(file)}
                    disabled={downloadingId === fid}
                    className="w-full text-left flex items-center justify-between gap-3 rounded-lg border border-linen-200 px-3 py-2 text-sm hover:border-[#869B7E]/50 hover:bg-linen-50 disabled:opacity-60">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-700">{file.originalName}</span>
                      <span className="text-xs uppercase text-slate-400">{file.fileType ?? file.extension}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {downloadingId === fid ? '준비 중…' : formatBytes(file.sizeBytes)}
                    </span>
                  </button>
                  )
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
