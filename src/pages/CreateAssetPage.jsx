import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postApi } from '../api/postApi'
import Button from '../components/Button'
import TagInput from '../features/post/TagInput'
import CategorySelector from '../features/post/CategorySelector'
import { toAssetZipFile } from '../utils/assetZip'

const inputCls = 'w-full rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E] transition-colors'

export default function CreateAssetPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [tags, setTags] = useState([])
  const [thumbnail, setThumbnail] = useState(null)
  const [preview, setPreview] = useState('')
  const [assetPackage, setAssetPackage] = useState(null)
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
    if (!assetPackage) { setError('GLB, FBX 또는 ZIP 파일은 필수입니다.'); return }
    setLoading(true)
    try {
      const assetZip = await toAssetZipFile(assetPackage)
      const created = await postApi.create({
        title,
        content,
        categoryId,
        tags,
        thumbnail,
        assetZip,
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
            3D 에셋 패키지 <span className="text-crimson-600">*</span>
            <span className="text-slate-400 font-normal"> .glb, .fbx 또는 .zip</span>
          </label>
          <input type="file" accept=".glb,.fbx,.zip,model/gltf-binary,application/zip,application/x-zip-compressed" required
            onChange={e => setAssetPackage(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-500" />
          {assetPackage && <span className="block mt-1 text-xs text-slate-400">{assetPackage.name}</span>}
          <div className="mt-2 rounded-lg border border-[#C9CAAC]/50 bg-linen-50/60 p-3 text-xs text-slate-500 leading-relaxed">
            <p className="font-semibold text-slate-600 mb-1">텍스처가 잘 보이려면?</p>
            <p className="mb-1">
              <b className="text-slate-600">GLB 권장</b> — 재질·텍스처가 파일 하나에 포함돼 가장 안전합니다.
            </p>
            <p className="mb-1">
              <b className="text-slate-600">FBX + 텍스처 ZIP</b>을 올릴 땐, <u>FBX가 참조하는 텍스처 이름 그대로</u> ZIP에 포함해야 합니다.
              뷰어는 FBX가 이름으로 가리키는 텍스처만 인식하며, 이름이 다르면(예: 다른 PC 경로로 링크한 채 export) 텍스처가 붙지 않습니다.
            </p>
            <p className="text-slate-400">
              ※ 3D 툴에서 <b>텍스처를 FBX에 내장(Embed Media)</b>해 export 하면 ZIP 없이 FBX 하나로도 텍스처가 표시됩니다.
            </p>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? '등록 중...' : '에셋 등록'}
        </Button>
      </form>
    </div>
  )
}
