import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postApi } from '../api/postApi'
import Button from '../components/Button'
import TagInput from '../features/post/TagInput'
import CategorySelector from '../features/post/CategorySelector'

const inputCls = 'w-full rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E] transition-colors'

export default function CreateAssetPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [tags, setTags] = useState([])
  const [thumbnail, setThumbnail] = useState(null)
  const [preview, setPreview] = useState('')
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function onThumb(e) {
    const f = e.target.files?.[0]
    setThumbnail(f ?? null)
    setPreview(f ? URL.createObjectURL(f) : '')
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!categoryId) { setError('카테고리는 소분류까지 선택해야 합니다.'); return }
    if (!thumbnail) { setError('썸네일 이미지는 필수입니다.'); return }
    if (!model) { setError('3D 모델 파일은 필수입니다.'); return }
    setLoading(true)
    try {
      const created = await postApi.create({
        title,
        content,
        categoryId,
        tags,
        thumbnail,
        assets: [model],
      })
      navigate(created?.id ? `/assets/${created.id}` : '/assets')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">에셋 등록</h1>
      {error && <p className="text-crimson-600 text-sm mb-3">{error}</p>}

      <form onSubmit={onSubmit} className="flex flex-col gap-5 bg-white border border-[#C9CAAC]/40 rounded-2xl p-6">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">제목</label>
          <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} className={inputCls} placeholder="에셋 이름" />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">설명</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} required rows={5} className={inputCls} placeholder="에셋에 대한 설명, 사용처, 라이선스 등" />
        </div>

        <CategorySelector onSelect={setCategoryId} />

        <TagInput value={tags} onChange={setTags} />

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">썸네일 <span className="text-crimson-600">*</span></label>
          <input type="file" accept="image/*" onChange={onThumb} className="text-sm text-slate-500" />
          {preview && (
            <img src={preview} alt="미리보기" className="mt-2 w-full max-h-56 object-contain rounded-lg border border-linen-200" />
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            3D 모델 파일 <span className="text-crimson-600">*</span>
            <span className="text-slate-400 font-normal"> 현재 백엔드는 .fbx만 허용</span>
          </label>
          <input type="file" accept=".fbx" required
            onChange={e => setModel(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-500" />
          {model && <span className="block mt-1 text-xs text-slate-400">{model.name}</span>}
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? '등록 중...' : '에셋 등록'}
        </Button>
      </form>
    </div>
  )
}
