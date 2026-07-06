// 업로드 전 클라이언트 사전검사.
// FBX가 참조하는 텍스처가 함께 올린 파일에 실제로 있는지 브라우저에서 미리 확인해,
// 콜라캔처럼 "이름 불일치로 텍스처가 안 붙는" 깨진 업로드를 등록 전에 막는다.
// (뷰어는 FBX가 이름으로 가리키는 텍스처만 인식하므로, 참조가 zip에 없으면 텍스처가 안 붙는다.)
import { unzipSync } from 'fflate'

// FBX는 텍스처 경로를 제어문자로 구분해 저장하므로 제어문자 범위를 의도적으로 사용한다.
// eslint-disable-next-line no-control-regex
const IMAGE_REFERENCE = /[^\x00-\x1f"]*\.(?:png|jpe?g|tga|tif|tiff|bmp|dds)/gi
const IMAGE_EXT = /\.(?:png|jpe?g|tga|tif|tiff|bmp|dds)$/i

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

/**
 * @returns {Promise<{ok: true, warning?: string} | {ok: false, message: string}>}
 *  ok=false 면 등록을 막아야 함. ok=true 인데 warning 이 있으면 통과시키되 안내.
 *  파싱 실패 등 불확실하면 막지 않는다(오차단 방지 — 뷰어/백엔드가 최종 처리).
 */
export async function validateAssetPackage(file) {
  try {
    const name = (file?.name ?? '').toLowerCase()
    const buffer = new Uint8Array(await file.arrayBuffer())

    let fbxBytes = null
    let textureBasenames = []

    if (name.endsWith('.glb') || name.endsWith('.gltf')) {
      return { ok: true } // 자체 포함 포맷
    } else if (name.endsWith('.fbx')) {
      fbxBytes = buffer // 단일 FBX(동봉 텍스처 없음)
    } else if (name.endsWith('.zip')) {
      const entries = unzipSync(buffer)
      for (const path of Object.keys(entries)) {
        const bn = basename(path)
        if (path.startsWith('__MACOSX/') || bn === '.ds_store' || !bn) continue
        const lower = path.toLowerCase()
        if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return { ok: true }
        if (lower.endsWith('.fbx')) fbxBytes = entries[path]
        else if (IMAGE_EXT.test(bn)) textureBasenames.push(bn)
      }
    } else {
      return { ok: true } // 알 수 없는 형식 — 막지 않음
    }

    if (!fbxBytes) return { ok: true }
    if (hasEmbeddedImage(fbxBytes)) return { ok: true } // 내장 텍스처 = 자체 완결

    const refs = extractReferencedBasenames(fbxBytes)
    if (refs.size === 0) return { ok: true } // 참조하는 외부 텍스처 없음

    const present = buildPresentSets(textureBasenames)
    const missing = [...refs].filter(ref => refIsMissing(ref, present))

    if (missing.length === refs.size) {
      const list = missing.slice(0, 4).join(', ') + (missing.length > 4 ? ' 외' : '')
      return {
        ok: false,
        message: `FBX가 참조하는 텍스처가 업로드 파일에 없습니다: ${list}\n`
          + 'FBX가 참조하는 이름 그대로 텍스처를 ZIP에 포함하거나, 텍스처를 FBX에 내장(Embed Media)해 export 하거나, GLB로 올려주세요.',
      }
    }

    if (missing.length > 0) {
      const list = missing.slice(0, 4).join(', ') + (missing.length > 4 ? ' 외' : '')
      return { ok: true, warning: `일부 텍스처가 빠졌습니다(${list}). 그대로 등록하면 일부가 안 보일 수 있어요.` }
    }

    return { ok: true }
  } catch (e) {
    // 검사 자체 실패 시 업로드를 막지 않는다(오차단 방지).
    console.warn('[validateAssetPackage] 사전검사 실패, 통과 처리:', e)
    return { ok: true }
  }
}
