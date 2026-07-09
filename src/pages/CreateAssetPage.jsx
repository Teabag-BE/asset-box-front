import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { unzipSync } from 'fflate'
import { postApi } from '../api/postApi'
import Button from '../components/Button'
import FileDropzone from '../components/FileDropzone'
import TagInput from '../features/post/TagInput'
import CategorySelector from '../features/post/CategorySelector'
import { toAssetZipFile } from '../utils/assetZip'
import { validateAssetPackage } from '../utils/validateAssetPackage'

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

  // 썸네일 파일 선택/드롭 처리. 드롭존과 자동캡처 양쪽에서 재사용.
  function onThumbFile(f) {
    setThumbnail(f ?? null)
    setPreview(f ? URL.createObjectURL(f) : '')
  }

  // 3D 에셋 파일 선택/드롭 처리. 드롭은 accept 필터가 안 먹으므로 확장자를 직접 검사해 친절히 안내.
  function onAssetFile(f) {
    if (!f) { setAssetPackage(null); return }
    if (!/\.(glb|fbx|zip)$/i.test(f.name)) {
      setError(`"${f.name}" 은 지원하지 않는 형식이에요. .glb, .fbx, .zip 파일만 올릴 수 있어요.`)
      return
    }
    setError('')
    setAssetPackage(f)
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

        <CategorySelector onSelect={setCategoryId} />

        <TagInput value={tags} onChange={setTags} />

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            썸네일 <span className="text-crimson-600">*</span>
            <span className="text-slate-400 font-normal"> (모델로 자동 생성 가능)</span>
          </label>
          <FileDropzone
            accept="image/*"
            icon="🖼️"
            label="썸네일 이미지를 끌어다 놓거나 클릭해서 선택"
            hint="모델 미리보기에서 자동 생성할 수도 있어요"
            file={thumbnail}
            onFile={onThumbFile}
          />
          {preview && (
            <img src={preview} alt="미리보기" className="mt-2 w-full max-h-56 object-contain rounded-lg border border-linen-200" />
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            3D 에셋 패키지 <span className="text-crimson-600">*</span>
            <span className="text-slate-400 font-normal"> .glb, .fbx 또는 .zip</span>
          </label>
          <FileDropzone
            accept=".glb,.fbx,.zip,model/gltf-binary,application/zip,application/x-zip-compressed"
            icon="📦"
            label="3D 파일을 끌어다 놓거나 클릭해서 선택"
            hint=".glb / .fbx / .zip · 최대 50MB · GLB 권장"
            file={assetPackage}
            onFile={onAssetFile}
          />

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
