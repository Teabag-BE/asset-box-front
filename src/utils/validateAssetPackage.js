// 업로드 전 클라이언트 사전검사.
// (1) ZIP 안에 뭐가 들어있는지 분류해, 못 올리는 이유를 "무엇이 왜 안 되는지 + 우리가 지원하는 형식"으로
//     친절하게 설명한다(백엔드의 불친절한 "허용되지 않은 확장자" 대신).
// (2) FBX가 참조하는 텍스처가 함께 올린 파일에 실제로 있는지 확인해,
//     콜라캔처럼 "이름 불일치로 텍스처가 안 붙는" 깨진 업로드를 등록 전에 막는다.
// (뷰어는 FBX가 이름으로 가리키는 텍스처만 인식하므로, 참조가 zip에 없으면 텍스처가 안 붙는다.)
import { unzipSync } from 'fflate'
import {
  MODEL_EXTS,
  KEPT_TEXTURE_EXTS,
  CONVERTIBLE_TEXTURE_EXTS,
  UNSUPPORTED_TEXTURE_EXTS,
  DROPPABLE_DOC_EXTS,
  MODEL_AUX_EXTS,
  SUPPORTED_FORMATS_HELP,
  extOf,
  isJunkEntry,
} from './assetFormats'

// 파일 목록을 짧게 요약. ['a','b','c','d','e'] → "a, b, c 외 2개"
function formatList(names, head = 3) {
  const shown = names.slice(0, head).join(', ')
  const rest = names.length - head
  return rest > 0 ? `${shown} 외 ${rest}개` : shown
}

// FBX는 텍스처 경로를 제어문자로 구분해 저장하므로 제어문자 범위를 의도적으로 사용한다.
// eslint-disable-next-line no-control-regex
const IMAGE_REFERENCE = /[^\x00-\x1f"]*\.(?:png|jpe?g|tga|tif|tiff|bmp|dds)/gi

function basename(pathOrUrl) {
  return `${pathOrUrl ?? ''}`.split(/[?#]/)[0].replace(/\\/g, '/').split('/').pop().toLowerCase()
}

// PNG(89 50 4E 47) / JPEG(FF D8 FF) 매직바이트가 있으면 내장 텍스처로 판단
function hasEmbeddedImage(bytes) {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x47) return true
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) return true
  }
  return false
}

// 큰 바이트 배열을 스택오버플로 없이 latin1 문자열로 디코드
function toLatin1(bytes) {
  let text = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return text
}

function extractReferencedBasenames(fbxBytes) {
  const text = toLatin1(fbxBytes)
  const refs = new Set()
  let m
  IMAGE_REFERENCE.lastIndex = 0
  while ((m = IMAGE_REFERENCE.exec(text))) {
    const name = basename(m[0]).trim()
    if (name) refs.add(name)
  }
  return refs
}

// 확장자를 뗀 stem. foo_diff_1k.png → foo_diff_1k
function textureStem(name) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

// 해상도 접미사(_1k/_2k/_4k/_2048 ...)까지 제거한 매칭 키. foo_diff_1k → foo_diff
function textureMatchKey(name) {
  return textureStem(name).replace(/[_\-.]?(?:\d+k|1024|2048|4096|8192)$/i, '')
}

// 뷰어와 동일한 3단 매칭 기준으로 zip 텍스처를 색인.
function buildPresentSets(textureBasenames) {
  const byBasename = new Set()
  const byStem = new Set()
  const byKey = new Set()
  for (const raw of textureBasenames) {
    const name = basename(raw)
    byBasename.add(name)
    if (name.endsWith('.jpg')) byBasename.add(`${name.slice(0, -4)}.jpeg`)
    else if (name.endsWith('.jpeg')) byBasename.add(`${name.slice(0, -5)}.jpg`)
    byStem.add(textureStem(name))
    byKey.add(textureMatchKey(name))
  }
  return { byBasename, byStem, byKey }
}

// 정확 → 확장자무시(stem) → 해상도+확장자무시(key) 중 하나라도 맞으면 존재로 본다.
function refIsMissing(ref, present) {
  return !present.byBasename.has(ref)
    && !present.byStem.has(textureStem(ref))
    && !present.byKey.has(textureMatchKey(ref))
}

// ZIP 엔트리를 형식별로 분류한다.
function classifyZip(entries) {
  const models = []       // .fbx / .glb / .gltf
  const keptTextures = [] // .png / .jpg / .jpeg (그대로 올라감)
  const convTextures = [] // .exr (업로드 시 PNG로 자동 변환)
  const unsupTextures = [] // .tga / .dds … (자동 제외 → 참조 시 안 보일 수 있음)
  const docs = []         // .txt / .html … (자동 제외해도 무방)
  const others = []       // 그 외 (자동 제외)
  const fbxEntries = []   // [{ bn, data }]

  for (const [path, data] of Object.entries(entries)) {
    if (isJunkEntry(path)) continue
    const bn = basename(path)
    if (!bn) continue
    const e = extOf(path)
    if (MODEL_EXTS.has(e)) {
      models.push(bn)
      if (e === 'fbx') fbxEntries.push({ bn, data })
    } else if (KEPT_TEXTURE_EXTS.has(e)) {
      keptTextures.push(bn)
    } else if (CONVERTIBLE_TEXTURE_EXTS.has(e)) {
      convTextures.push(bn)
    } else if (UNSUPPORTED_TEXTURE_EXTS.has(e)) {
      unsupTextures.push(bn)
    } else if (DROPPABLE_DOC_EXTS.has(e)) {
      docs.push(bn)
    } else if (!MODEL_AUX_EXTS.has(e)) {
      others.push(bn)
    }
  }
  return { models, keptTextures, convTextures, unsupTextures, docs, others, fbxEntries }
}

/**
 * @returns {Promise<{ok: true, warning?: string} | {ok: false, message: string}>}
 *  ok=false 면 등록을 막아야 함. ok=true 인데 warning 이 있으면 통과시키되 안내.
 *  파싱 실패 등 불확실하면 막지 않는다(오차단 방지 — 뷰어/백엔드가 최종 처리).
 */
export async function validateAssetPackage(file) {
  try {
    const name = (file?.name ?? '').toLowerCase()
    const buffer = new Uint8Array(await file.arrayBuffer())

    // 단일 파일 업로드 — 그대로 통과.
    if (name.endsWith('.glb') || name.endsWith('.gltf')) return { ok: true } // 자체 포함 포맷
    if (name.endsWith('.fbx')) return await validateFbx(buffer, [])
    if (!name.endsWith('.zip')) return { ok: true } // 알 수 없는 형식 — 막지 않음

    // ZIP — 내용물을 분류해 안내한다.
    const { models, keptTextures, convTextures, unsupTextures, docs, others, fbxEntries } =
      classifyZip(unzipSync(buffer))

    // 모델이 없다.
    if (models.length === 0) {
      return {
        ok: false,
        message: 'ZIP 안에 3D 모델 파일(.fbx / .glb)이 없습니다.\n'
          + (docs.length || others.length
            ? `들어있는 파일: ${formatList([...docs, ...others, ...unsupTextures])}\n`
            : '')
          + SUPPORTED_FORMATS_HELP,
      }
    }

    // 모델이 여러 개 — 한 게시글엔 하나만.
    if (models.length > 1) {
      return {
        ok: false,
        message: `이 ZIP에는 3D 모델이 ${models.length}개 들어 있어요 (${formatList(models)}).\n`
          + '한 게시글에는 모델 하나만 올릴 수 있어요. 올리려는 모델 하나와 그 텍스처만 골라 다시 압축해 주세요.\n'
          + '(에셋 팩이라면 모델별로 나눠서 각각 등록해야 합니다.)\n'
          + SUPPORTED_FORMATS_HELP,
      }
    }

    // 모델이 정확히 하나.
    // GLB/GLTF 단일 모델이면 텍스처 자체 포함 — 통과.
    if (fbxEntries.length === 0) return { ok: true }

    // 자동 제외되는 파일이 있으면 경고에 함께 담는다.
    const notes = []
    if (unsupTextures.length) {
      notes.push(`지원하지 않는 텍스처 포맷은 자동으로 빠집니다: ${formatList(unsupTextures)} `
        + '(PNG/JPG로 변환하거나 FBX에 내장해 주세요)')
    }
    if (docs.length || others.length) {
      notes.push(`문서·부가 파일은 자동으로 빠집니다: ${formatList([...docs, ...others])}`)
    }

    // FBX 텍스처 참조 검사(업로드에 살아남는 png/jpg/jpeg + exr 기준).
    // allTextureNames: zip에 실제로 들어있는 이미지 파일 전체(미지원 포맷 포함).
    // 참조 이름이 안 맞아도 텍스처를 "넣긴 넣은" 경우엔 차단하지 않기 위한 신호.
    const allTextureNames = [...keptTextures, ...convTextures, ...unsupTextures]
    return await validateFbx(fbxEntries[0].data, [...keptTextures, ...convTextures], notes, allTextureNames)
  } catch (e) {
    // 검사 자체 실패 시 업로드를 막지 않는다(오차단 방지).
    console.warn('[validateAssetPackage] 사전검사 실패, 통과 처리:', e)
    return { ok: true }
  }
}

// FBX 하나에 대한 텍스처 참조 검사.
// presentTextures : 업로드에 살아남는 텍스처 basename(참조 매칭용).
// allTextureNames : zip에 실제로 들어있던 이미지 파일 전체(미지원 포맷 포함) — 차단/경고 판단용.
async function validateFbx(fbxBytes, presentTextures, notes = [], allTextureNames = []) {
  const withNotes = (result) => {
    if (result.ok && notes.length) {
      return { ok: true, warning: [result.warning, ...notes].filter(Boolean).join('\n') }
    }
    return result
  }

  if (hasEmbeddedImage(fbxBytes)) return withNotes({ ok: true }) // 내장 텍스처 = 자체 완결

  const refs = extractReferencedBasenames(fbxBytes)
  if (refs.size === 0) return withNotes({ ok: true }) // 참조하는 외부 텍스처 없음

  const present = buildPresentSets(presentTextures)
  const missing = [...refs].filter(ref => refIsMissing(ref, present))

  // 참조 텍스처가 전부 빠짐.
  // 뷰어가 이제 관대하게(형제 텍스처 자동 매핑 + 중립 클레이 폴백) 처리하므로,
  // 텍스처 이유로는 절대 차단(ok:false)하지 않는다 — 경고만 남기고 통과시킨다.
  if (missing.length === refs.size) {
    // 텍스처 파일을 "넣긴 넣었는데" FBX가 가리키는 이름과 다른 경우(예: Sketchfab export).
    if (allTextureNames.length > 0) {
      return withNotes({
        ok: true,
        warning: `FBX가 참조하는 텍스처 이름(${formatList([...missing], 4)})이 함께 올린 파일과 달라서,\n`
          + '뷰어가 이름으로 자동 매칭을 시도합니다(안 맞으면 중립 클레이 재질로 표시).\n'
          + `포함된 텍스처: ${formatList(allTextureNames, 4)}\n`
          + '텍스처까지 정확히 보이게 하려면 FBX에 내장(Embed Media)해 export 하거나 GLB로 올리는 걸 권장해요.',
      })
    }
    // 텍스처 파일 자체가 하나도 없음 — 예전엔 차단했으나, 이제 경고만.
    // 뷰어가 중립 클레이 재질로 항상 그럴듯하게 렌더하고, 모델은 정상 등록·다운로드된다.
    return withNotes({
      ok: true,
      warning: `FBX가 참조하는 텍스처가 업로드 파일에 없습니다: ${formatList([...missing], 4)}\n`
        + '뷰어에서 중립 클레이 재질로 표시되며, 모델 자체는 등록·다운로드됩니다.\n'
        + '텍스처까지 보이게 하려면 FBX가 참조하는 이름 그대로 ZIP에 포함하거나,\n'
        + '텍스처를 FBX에 내장(Embed Media)해 export 하거나, GLB로 올려주세요.',
    })
  }

  // 일부만 빠짐 — 통과시키되 경고.
  if (missing.length > 0) {
    return withNotes({
      ok: true,
      warning: `일부 텍스처가 빠졌습니다(${formatList([...missing], 4)}). 그대로 등록하면 일부가 안 보일 수 있어요.`,
    })
  }

  return withNotes({ ok: true })
}
