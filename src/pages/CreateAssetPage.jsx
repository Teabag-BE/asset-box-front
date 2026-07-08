import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { unzipSync } from 'fflate'
import { postApi } from '../api/postApi'
import { aiApi } from '../api/aiApi'
import Button from '../components/Button'
import TagInput from '../features/post/TagInput'
import CategorySelector from '../features/post/CategorySelector'
import { toAssetZipFile } from '../utils/assetZip'
import { validateAssetPackage } from '../utils/validateAssetPackage'
import { downscaleToDataUrl } from '../utils/imageToDataUrl'

// 상세페이지와 동일하게 lazy 로딩 — three.js 뷰어를 메인 번들에서 분리(코드 스플리팅 유지).
const AssetViewer360 = lazy(() => import('../features/viewer/AssetViewer360'))

const inputCls = 'w-full rounded-lg border border-[#C9CAAC]/80 bg-white px-3 py-2 text-sm outline-none focus:border-[#869B7E] transition-colors'

// 미리보기용 모델/이미지 확장자.
const MODEL_EXTS = ['fbx', 'glb', 'gltf']
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tga']

function extOf(name = '') {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// 파일(assetPackage)에서 미리보기용 데이터를 준비한다. 만든 blob URL 은 반환값의 urls 로 모아
// 호출측에서 revoke 하도록 한다. 실패는 던지지 않고 null 을 반환(graceful degradation).
async function buildPreviewData(file) {
  const ext = extOf(file.name)
  const createdUrls = []

  // .glb / .gltf / .fbx — 파일 하나를 blob URL 로. 텍스처는 자체 포함/내장.
  if (MODEL_EXTS.includes(ext)) {
    const modelUrl = URL.createObjectURL(file)
    createdUrls.push(modelUrl)
    return { modelUrl, ext, textureUrls: [], urls: createdUrls }
  }

  // .zip — fflate 로 풀어 모델 1개 + 이미지들을 blob URL 로.
  if (ext === 'zip') {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const entries = unzipSync(bytes)

    let modelUrl = null
    let modelExt = null
    const textureUrls = []

    for (const [path, data] of Object.entries(entries)) {
      // __MACOSX, 디렉토리 엔트리 등은 건너뛴다.
      if (path.startsWith('__MACOSX') || path.endsWith('/')) continue
      const originalName = path.replace(/\\/g, '/').split('/').pop()
      if (!originalName) continue
      const e = extOf(originalName)

      if (!modelUrl && MODEL_EXTS.includes(e)) {
        // Uint8Array 뷰의 실제 바이트 범위만 잘라 Blob 생성.
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        modelUrl = URL.createObjectURL(new Blob([buf]))
        modelExt = e
        createdUrls.push(modelUrl)
      } else if (IMAGE_EXTS.includes(e)) {
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        const texUrl = URL.createObjectURL(new Blob([buf]))
        createdUrls.push(texUrl)
        // 뷰어의 buildTextureUrlMap 이 originalName(zip 내 파일명)으로 매칭한다.
        // blob URL 의 basename 은 UUID 라, originalName 없이는 텍스처가 안 붙는다.
        textureUrls.push({ originalName, accessUrl: texUrl })
      }
    }

    if (!modelUrl) {
      // 모델이 없으면 미리보기 불가 — 만든 URL 정리 후 null.
      createdUrls.forEach(u => URL.revokeObjectURL(u))
      return null
    }
    return { modelUrl, ext: modelExt, textureUrls, urls: createdUrls }
  }

  return null
}

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

  // AI 추천 상태.
  const [aiEnabled, setAiEnabled] = useState(false)          // 서버에 키가 있고 엔드포인트가 살아있을 때만 true
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiTags, setAiTags] = useState([])                    // 추천 태그 목록
  const [aiCategory, setAiCategory] = useState(null)          // { categoryId, categoryPath } | null
  const [presetCategory, setPresetCategory] = useState(null)  // CategorySelector 로 밀어넣을 categoryId

  // 마운트 시 AI 사용 가능 여부만 조용히 확인. 실패하면 그냥 버튼을 안 그린다.
  useEffect(() => {
    let alive = true
    aiApi.status().then(r => { if (alive) setAiEnabled(r.enabled) })
    return () => { alive = false }
  }, [])

  // 미리보기 상태.
  const [previewData, setPreviewData] = useState(null)   // { modelUrl, ext, textureUrls } | null
  const [previewStatus, setPreviewStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'unavailable'
  const previewUrlsRef = useRef([])   // revoke 대상 blob URL 목록
  const captureRef = useRef(null)     // AssetViewer360 가 등록한 capture() 함수

  // assetPackage 가 바뀌면 미리보기 데이터를 다시 준비한다.
  // 로직은 async 함수로 두고, setState 는 콜백/후속 처리에서만 호출(effect 동기 setState 아님).
  useEffect(() => {
    let cancelled = false

    // 이전 blob URL 정리.
    const revokePrev = () => {
      previewUrlsRef.current.forEach(u => {
        try { URL.revokeObjectURL(u) } catch { /* 무시 */ }
      })
      previewUrlsRef.current = []
    }

    // 모든 setState 는 async 함수(콜백) 안에서만 호출한다 — effect 본문 동기 setState 금지 규칙 준수.
    ;(async () => {
      if (!assetPackage) {
        revokePrev()
        if (cancelled) return
        setPreviewData(null)
        setPreviewStatus('idle')
        return
      }

      if (cancelled) return
      setPreviewData(null)
      setPreviewStatus('loading')

      try {
        const data = await buildPreviewData(assetPackage)
        if (cancelled) {
          // 이 사이 파일이 또 바뀌었으면 방금 만든 URL 은 여기서 정리.
          data?.urls?.forEach(u => { try { URL.revokeObjectURL(u) } catch { /* 무시 */ } })
          return
        }
        revokePrev()
        if (data) {
          previewUrlsRef.current = data.urls
          setPreviewData({ modelUrl: data.modelUrl, ext: data.ext, textureUrls: data.textureUrls })
          setPreviewStatus('ready')
        } else {
          setPreviewData(null)
          setPreviewStatus('unavailable')
        }
      } catch (err) {
        console.warn('[CreateAssetPage] 미리보기 준비 실패:', err)
        if (cancelled) return
        revokePrev()
        setPreviewData(null)
        setPreviewStatus('unavailable')
      }
    })()

    return () => { cancelled = true }
  }, [assetPackage])

  // 언마운트 시 남은 blob URL 정리(누수 방지). preview(썸네일 objectURL)도 함께.
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch { /* 무시 */ } })
      previewUrlsRef.current = []
    }
  }, [])

  function onThumb(e) {
    const f = e.target.files?.[0]
    setThumbnail(f ?? null)
    setPreview(f ? URL.createObjectURL(f) : '')
  }

  // 미리보기 화면 → PNG 캡처 → 썸네일로 사용. 성공 시 생성된 File 을, 실패 시 null 을 반환한다.
  // (반환값을 주는 이유: onSubmit 에서 캡처 직후 setThumbnail 이 반영되기 전에 그 File 을 바로 써야 하므로.)
  async function captureThumbnail() {
    try {
      const capture = captureRef.current
      if (typeof capture !== 'function') return null
      const blob = await capture()
      if (!blob) return null
      const file = new File([blob], 'thumbnail.png', { type: 'image/png' })
      setThumbnail(file)
      setPreview(URL.createObjectURL(file))
      return file
    } catch (err) {
      console.warn('[CreateAssetPage] 썸네일 자동생성 실패:', err)
      return null
    }
  }

  async function onCaptureClick() {
    setError('')
    const file = await captureThumbnail()
    if (!file) setError('썸네일 자동생성에 실패했습니다. 파일로 직접 올려주세요.')
  }

  // AI 추천: 제목 + 파일명 + (있으면)썸네일/미리보기 캡처를 서버로 보내 태그·카테고리를 추천받는다.
  async function onAiSuggest() {
    setAiError('')
    setAiBusy(true)
    try {
      const filenames = [assetPackage?.name].filter(Boolean)

      // 이미지 보조: 이미 올린 썸네일이 있으면 그걸, 없으면 미리보기 화면을 1회 캡처해 축소본을 첨부.
      let thumbnailBase64 = null
      if (thumbnail) {
        thumbnailBase64 = await downscaleToDataUrl(thumbnail)
      } else if (previewStatus === 'ready' && typeof captureRef.current === 'function') {
        const blob = await captureRef.current()
        if (blob) thumbnailBase64 = await downscaleToDataUrl(blob)
      }

      const res = await aiApi.suggest({ title: title.trim(), filenames, thumbnailBase64 })
      const tags = Array.isArray(res?.tags) ? res.tags : []
      setAiTags(tags)
      setAiCategory(res?.categoryId ? { categoryId: res.categoryId, categoryPath: res.categoryPath } : null)
      if (tags.length === 0 && !res?.categoryId) {
        setAiError('추천할 만한 게 마땅치 않아요. 제목을 조금 더 구체적으로 적어보세요.')
      }
    } catch (err) {
      setAiError(err.message || 'AI 추천에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setAiBusy(false)
    }
  }

  // 추천 태그를 TagInput 규칙(소문자·공백→하이픈·최대 10개)에 맞춰 담는다.
  function addAiTag(raw) {
    const norm = String(raw).trim().toLowerCase().replace(/\s+/g, '-')
    setTags(prev => (norm && !prev.includes(norm) && prev.length < 10 ? [...prev, norm] : prev))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!categoryId) { setError('대분류를 선택해주세요. (중·소분류는 선택 사항이에요)'); return }
    if (!assetPackage) { setError('GLB, FBX 또는 ZIP 파일은 필수입니다.'); return }

    // 썸네일이 없으면, 미리보기가 준비된 경우 자동 캡처를 시도한다(백엔드 필수라 폴백으로 채움).
    let thumb = thumbnail
    if (!thumb) {
      thumb = await captureThumbnail()
    }
    if (!thumb) { setError('썸네일 이미지는 필수입니다. (미리보기에서 "이 화면으로 썸네일 만들기"를 눌러 자동 생성할 수 있어요.)'); return }

    // 업로드 전 사전검사: FBX가 참조하는 텍스처가 실제로 포함됐는지 브라우저에서 확인
    const check = await validateAssetPackage(assetPackage)
    if (!check.ok) { setError(check.message); return }
    if (check.warning && !window.confirm(`${check.warning}\n\n그대로 등록할까요?`)) return

    setLoading(true)
    try {
      const assetZip = await toAssetZipFile(assetPackage)
      const created = await postApi.create({
        title,
        content,
        categoryId,
        tags,
        thumbnail: thumb,
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
      {error && <p className="text-crimson-600 text-sm mb-3 whitespace-pre-line">{error}</p>}

      <form onSubmit={onSubmit} className="flex flex-col gap-5 bg-white border border-[#C9CAAC]/40 rounded-2xl p-6">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">제목</label>
          <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} className={inputCls} placeholder="에셋 이름" />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">설명</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} required rows={5} className={inputCls} placeholder="에셋에 대한 설명, 사용처, 라이선스 등" />
        </div>

        <CategorySelector onSelect={setCategoryId} value={presetCategory} />

        <TagInput value={tags} onChange={setTags} />

        {/* ✨ AI 추천 — 서버에 키가 있을 때만 노출. 추천 결과는 눌러서 담는 방식(자동 적용 아님). */}
        {aiEnabled && (
          <div className="rounded-xl border border-[#C9CAAC]/60 bg-linen-50/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">✨ AI 추천</span>
              <button
                type="button"
                onClick={onAiSuggest}
                disabled={aiBusy || (!title.trim() && !assetPackage)}
                className="rounded-lg bg-[#869B7E] text-white text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#75886c] transition-colors"
              >
                {aiBusy ? '분석 중…' : '태그·분류 추천받기'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              제목·파일명{thumbnail || previewStatus === 'ready' ? '·썸네일' : ''}을 보고 추천해요. 원하는 것만 눌러서 담으세요.
            </p>
            {aiError && <p className="mt-2 text-xs text-crimson-600">{aiError}</p>}

            {(aiTags.length > 0 || aiCategory) && (
              <div className="mt-2 flex flex-col gap-2">
                {aiCategory && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-500 shrink-0">분류</span>
                    <button
                      type="button"
                      onClick={() => setPresetCategory(aiCategory.categoryId)}
                      className={`inline-flex items-center gap-1 rounded-full border text-xs px-2.5 py-1 transition-colors ${
                        presetCategory === aiCategory.categoryId
                          ? 'border-sage-200 bg-sage-100 text-sage-600 cursor-default'
                          : 'border-[#869B7E] text-[#4b5d45] hover:bg-sage-50'
                      }`}
                    >
                      {presetCategory === aiCategory.categoryId ? '✓' : '+'} {aiCategory.categoryPath || '추천 분류'}
                    </button>
                  </div>
                )}
                {aiTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-500 shrink-0">태그</span>
                    {aiTags.map(t => {
                      const norm = String(t).trim().toLowerCase().replace(/\s+/g, '-')
                      const added = tags.includes(norm)
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => addAiTag(t)}
                          disabled={added}
                          className={`inline-flex items-center gap-1 rounded-full text-xs px-2.5 py-1 border transition-colors ${
                            added
                              ? 'border-sage-200 bg-sage-100 text-sage-600 cursor-default'
                              : 'border-[#C9CAAC] text-slate-600 hover:bg-sage-50'
                          }`}
                        >
                          {added ? '✓' : '+'} #{norm}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            썸네일 <span className="text-crimson-600">*</span>
            <span className="text-slate-400 font-normal"> (모델로 자동 생성 가능)</span>
          </label>
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

          {/* 업로드 전 3D 미리보기 — 준비되면 뷰어, 아니면 안내만. 실패해도 폼 제출엔 영향 없음. */}
          {assetPackage && (
            <div className="mt-3">
              <div
                className="relative w-full rounded-lg overflow-hidden border border-[#C9CAAC]/50 bg-slate-100"
                style={{ height: 340 }}
              >
                {previewStatus === 'ready' && previewData ? (
                  <Suspense fallback={(
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                      뷰어 불러오는 중...
                    </div>
                  )}>
                    <AssetViewer360
                      modelUrl={previewData.modelUrl}
                      fileExtension={previewData.ext}
                      textureUrls={previewData.textureUrls}
                      onCaptureReady={fn => { captureRef.current = fn }}
                    />
                  </Suspense>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-1">
                    <span className="text-3xl">📦</span>
                    <span>
                      {previewStatus === 'loading'
                        ? '미리보기 준비 중...'
                        : '미리보기를 만들 수 없습니다 (등록에는 영향 없어요)'}
                    </span>
                  </div>
                )}
              </div>

              {/* 모델로 썸네일 자동생성 — 미리보기가 준비됐을 때만 활성화. */}
              <button
                type="button"
                onClick={onCaptureClick}
                disabled={previewStatus !== 'ready'}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[#869B7E] px-3 py-1.5 text-sm text-[#4b5d45] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-linen-50 transition-colors"
              >
                📸 이 화면으로 썸네일 만들기
              </button>
              <p className="mt-1 text-xs text-slate-400">
                뷰어에서 각도·조명·재질을 조정한 뒤 버튼을 누르면 그 화면이 썸네일로 저장됩니다.
              </p>
            </div>
          )}

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
