import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { postApi } from '../api/postApi'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import TagInput from '../features/post/TagInput'
import CategorySelector from '../features/post/CategorySelector'

// 에셋 메타데이터 수정 (제목/설명/카테고리/태그). 파일 교체는 백엔드 미지원 → 제외.
export default function EditAssetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(null) // 기존 분류 유지, 재선택 시 변경
  const [tags, setTags] = useState([])
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
      await postApi.update(id, { title, content, categoryId, tags })
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
        <p className="text-xs text-slate-400">※ 모델·썸네일 파일 교체는 준비 중입니다. 지금은 제목·설명·카테고리·태그만 수정됩니다.</p>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(`/assets/${id}`)}>취소</Button>
        </div>
      </form>
    </div>
  )
}
