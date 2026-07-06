// AssetBox가 다루는 파일 형식의 단일 기준.
// 사전검사(validateAssetPackage)와 ZIP 정규화(assetZip)가 같은 규칙을 공유해,
// "검사는 통과시켰는데 정작 업로드 zip엔 빠져 있다" 같은 어긋남을 막는다.

// 3D 모델. glb/gltf 는 텍스처를 자체 포함한다.
export const MODEL_EXTS = new Set(['fbx', 'glb', 'gltf'])

// 백엔드가 그대로 저장하는 텍스처 포맷.
export const KEPT_TEXTURE_EXTS = new Set(['png', 'jpg', 'jpeg'])

// 업로드 시 프론트에서 PNG로 자동 변환해 주는 포맷.
export const CONVERTIBLE_TEXTURE_EXTS = new Set(['exr'])

// gltf 가 함께 참조하는 바이너리 버퍼(모델의 일부).
export const MODEL_AUX_EXTS = new Set(['bin'])

// 텍스처이긴 하지만 아직 지원하지 않는 포맷.
// → 업로드 시 자동으로 빠지므로, 참조돼 있으면 해당 부분 색이 안 보일 수 있다.
export const UNSUPPORTED_TEXTURE_EXTS = new Set(['tga', 'tif', 'tiff', 'bmp', 'dds', 'psd', 'hdr'])

// 에셋과 무관하게 흔히 섞여 오는 문서/부가 파일. 자동으로 빼도 무방하다.
export const DROPPABLE_DOC_EXTS = new Set([
  'txt', 'md', 'markdown', 'html', 'htm', 'pdf', 'url', 'rtf', 'nfo',
  'ini', 'cfg', 'log', 'doc', 'docx', 'csv', 'xml', 'json',
])

// 사용자에게 보여줄 지원 형식 안내 (에러/경고 하단에 공통으로 붙인다).
export const SUPPORTED_FORMATS_HELP =
  'AssetBox 지원 형식 — 모델: .fbx, .glb  ·  텍스처: .png, .jpg, .jpeg (.exr 는 자동 변환)\n'
  + '문서·부가 파일(.txt, .html 등)은 올릴 때 자동으로 빠집니다.'

export function extOf(path = '') {
  const base = `${path}`.replace(/\\/g, '/').split('/').pop() || ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function baseNameOfPath(path = '') {
  return (`${path}`.replace(/\\/g, '/').split('/').pop() || '').toLowerCase()
}

// 압축 메타/OS 부산물 — 항상 무시.
export function isJunkEntry(path = '') {
  const bn = baseNameOfPath(path)
  return path.startsWith('__MACOSX/')
    || path.endsWith('/')
    || bn === '.ds_store'
    || bn === 'thumbs.db'
    || bn === 'desktop.ini'
    || bn.startsWith('._')
}

// 업로드용 ZIP에 남길 파일인가? (모델 + 지원 텍스처 + 변환 대상만 유지)
export function isKeptForUpload(path = '') {
  if (isJunkEntry(path)) return false
  const e = extOf(path)
  return MODEL_EXTS.has(e)
    || MODEL_AUX_EXTS.has(e)
    || KEPT_TEXTURE_EXTS.has(e)
    || CONVERTIBLE_TEXTURE_EXTS.has(e)
}
