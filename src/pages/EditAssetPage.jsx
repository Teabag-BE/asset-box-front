import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { postApi } from '../api/postApi'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import TagInput from '../features/post/TagInput'
import CategorySelector from '../features/post/CategorySelector'

// 에셋 수정 (제목/설명/카테고리/태그 + 선택적 썸네일·모델 파일 교체).
// 파일 교체는 신 서버(multipart PUT)에서만 동작 — 구 서버면 안내 후 중단(#165 dark-launch).
export default function EditAssetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(null) // 기존 분류 유지, 재선택 시 변경
  const [tags, setTags] = useState([])
  const [thumbFile, setThumbFile] = useState(null)   // 새 썸네일(선택 — 비우면 기존 유지)
  const [zipFile, setZipFile] = useState(null)       // 새 모델 파일(선택 — 비우면 기존 유지)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    postApi.getDetail(id)
      .then(post => {
        if (!alive) return
        if (user && String(post.authorId) !== String(user.id)) {
          navigate(`/assets/${id}`) // 작성자 아니면 상세로
          return
        }
        setTitle(post.title ?? '')
        setContent(post.content ?? '')
        setCategoryId(post.categoryId ?? null)
        setTags(post.tags ?? [])
      })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // id 변경 시에만 재조회 (user/navigate는 안정적)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!categoryId) {
      setError('대분류를 선택해주세요. (중·소분류는 선택 사항)\n(바꾸지 않으려면 카테고리를 건드리지 마세요 — 기존 분류가 유지됩니다)')
      return
    }
    setSaving(true)
    try {
      const meta = { title, content, categoryId, tags }
      if (thumbFile || zipFile) {
        // 파일 교체는 신 서버(multipart)에서만 가능 — 실패 시 조용히 텍스트만 저장하지 않고 안내.
        try {
          await postApi.updateWithFiles(id, { ...meta, thumbnail: thumbFile, assetZip: zipFile })
        } catch {
          setError('파일 교체는 서버 업데이트 후 지원돼요. 파일 선택을 비우면 텍스트 수정은 지금도 저장됩니다.')
          return
        }
      } else {
        // 텍스트만 수정: 구 서버(JSON) 우선 → 릴리스 후 신 서버(multipart 전용)면 폴백.
        try {
          await postApi.update(id, meta)
        } catch {
          await postApi.updateWithFiles(id, meta)
        }
      }
      toast('수정이 저장되었습니다')
      navigate(`/assets/${id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-7 h-7" /></div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 mb-4">에셋 수정</h1>
      {error && <p className="text-crimson-600 text-sm mb-3 whitespace-pre-line">{error}</p>}
      <form onSubmit={onSubmit} className="flex flex-col gap-5 bg-white border border-[#C9CAAC]/40 rounded-2xl p-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">제목</span>
          <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={100}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#869B7E]" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">설명</span>
          <textarea value={content} onChange={e => setContent(e.target.value)} required rows={6}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#869B7E]" />
        </label>
        <div>
          <CategorySelector onSelect={setCategoryId} />
          <p className="text-xs text-slate-400 mt-1">카테고리를 바꾸려면 대분류부터 다시 선택하세요(중·소분류는 선택). 그대로 두면 기존 분류가 유지됩니다.</p>
        </div>
        <TagInput value={tags} onChange={setTags} />
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">썸네일 교체 <span className="text-slate-400">(선택)</span></span>
            <input type="file" accept="image/*"
              onChange={e => setThumbFile(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#869B7E]/15 file:text-[#556350] file:font-semibold file:cursor-pointer" />
            {thumbFile && <span className="text-xs text-slate-400">{thumbFile.name} <button type="button" className="underline" onClick={() => setThumbFile(null)}>취소</button></span>}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">모델 파일 교체 <span className="text-slate-400">(선택)</span></span>
            <input type="file" accept=".glb,.fbx,.zip,model/gltf-binary,application/zip,application/x-zip-compressed"
              onChange={e => setZipFile(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#869B7E]/15 file:text-[#556350] file:font-semibold file:cursor-pointer" />
            {zipFile && <span className="text-xs text-slate-400">{zipFile.name} <button type="button" className="underline" onClick={() => setZipFile(null)}>취소</button></span>}
          </label>
        </div>
        <p className="text-xs text-slate-400">※ 파일을 비워두면 기존 썸네일·모델이 그대로 유지됩니다.</p>
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>{saving ? '저장 중…' : '저장'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(`/assets/${id}`)}>취소</Button>
        </div>
      </form>
    </div>
  )
}
