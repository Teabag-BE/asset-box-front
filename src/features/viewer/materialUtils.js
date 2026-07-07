// 뷰어 "관대화(gracious)" 순수 로직 모음.
//
// 목표: 업로드가 불완전해도(텍스처 참조 없음/이름 어긋남/머티리얼 없음) 3D 뷰어가
// 항상 그럴듯한 스튜디오 클레이처럼 보이도록 보정한다.
//
// ⚠️ 최우선 안전 원칙
//   - 이미 색 텍스처(material.map)가 붙어 있거나 내장(blob:/data:) 텍스처인 머티리얼은
//     절대 건드리지 않는다. 정상 업로드에 회귀가 나면 안 된다.
//     → 오직 `!material.map` (색 텍스처 없음) 인 머티리얼만 보정 대상.
//   - 모든 신규 로직은 호출부에서 try/catch 로 감싸 예외 시 원래 로드 결과 그대로 렌더.
//
// 비유: 사진관에서 옷을 안 입고 온 손님(텍스처 없는 메시)에게는 깔끔한 회색 가운
// (neutralMaterial)을 입혀 보내고, 이미 정장을 입고 온 손님(map 있는 머티리얼)은
// 손대지 않는다. 형제 옷장(zip 텍스처)에 맞는 옷이 있으면 그걸 먼저 입혀본다.
import * as THREE from 'three'

// ── 공통 유틸 ──────────────────────────────────────────────────────────

function basenameOf(value = '') {
  const normalized = String(value).split('?')[0].replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
}

// 머티리얼이 배열일 수 있으므로 항상 배열로 펼쳐서 다룬다.
function asMaterialArray(material) {
  if (!material) return []
  return Array.isArray(material) ? material : [material]
}

// 이미 손대면 안 되는 머티리얼인가?
//   - map(색 텍스처)이 이미 있으면 정상 바인딩 → 보존.
//   - map 이 blob:/data: (FBX 내장 텍스처)면 더더욱 보존.
// (여기서 true 면 autoFix/neutral 대상에서 제외한다.)
function hasProtectedColorMap(material) {
  const map = material?.map
  if (!map) return false
  // map 이 있으면 원칙적으로 보존. 내장(blob:/data:) 여부와 무관하게 색이 이미 있음.
  return true
}

// ── A. 형제 텍스처 자동 매핑 ───────────────────────────────────────────

// 파일명(basename) 패턴으로 텍스처 역할을 추정한다.
// 정규식은 basename 소문자 기준. \b 는 단어 경계.
const ROLE_PATTERNS = [
  // albedo/색: basecolor / base_color / albedo / diffuse / _col / _c / _d / basemap / color
  ['albedo', /basecolor|base_color|albedo|diffuse|_col|_c\b|_d\b|basemap|color/i],
  // normal
  ['normal', /normal|_n\b|_nrm|_nml/i],
  // roughness (gloss 도 일단 roughness 취급 — 반전은 생략)
  ['roughness', /rough|_r\b|gloss/i],
  // metalness
  ['metalness', /metal|_m\b|metallic/i],
  // ao (ambient occlusion)
  ['ao', /_ao|occlusion|ambientocclusion/i],
  // emissive
  ['emissive', /emiss|emit|_e\b|_ilm/i],
]

/**
 * textureUrls(가용 텍스처 URL/이름 배열)를 역할별 URL 맵으로 분류.
 * 각 원소는 문자열 URL 이거나 { url|accessUrl, originalName } 객체 모두 허용.
 * @returns {{albedo?:string, normal?:string, roughness?:string, metalness?:string, ao?:string, emissive?:string}}
 */
export function classifyTextures(textureUrls = []) {
  const result = {}
  try {
    const entries = []
    for (const entry of textureUrls) {
      if (!entry) continue
      const url = typeof entry === 'string' ? entry : (entry.url || entry.accessUrl)
      if (!url) continue
      const name = typeof entry === 'string'
        ? basenameOf(url)
        : basenameOf(entry.originalName || url)
      if (!name) continue
      entries.push({ url, name })
    }

    // 1) 이름 패턴으로 역할 매칭.
    for (const { url, name } of entries) {
      for (const [role, pattern] of ROLE_PATTERNS) {
        // 먼저 감지된 것을 우선(같은 역할 여러 개면 첫 번째 유지).
        if (!result[role] && pattern.test(name)) {
          result[role] = url
        }
      }
    }

    // 2) albedo 미검출 폴백: normal/rough/metal/ao/emissive 로도 "안 잡힌" 텍스처가 있으면
    //    그걸 색맵(albedo)으로 간주한다. 키워드 없는 텍스처(예: bunny 의 'Mafioso_Clothing_Text.png')를 살린다.
    //    — 단색/색맵 텍스처가 특이한 이름으로 하나만 든 경우가 흔하고, 그게 곧 색맵일 확률이 절대적.
    if (!result.albedo) {
      const claimed = new Set([result.normal, result.roughness, result.metalness, result.ao, result.emissive].filter(Boolean))
      const leftover = entries.find(e => !claimed.has(e.url))
      if (leftover) result.albedo = leftover.url
    }
  } catch {
    // 분류 실패는 조용히 무시 — 빈 결과 반환.
  }
  return result
}

// 감지된 텍스처가 하나라도 있나?
export function hasAnyDetectedTexture(classified) {
  return !!classified && Object.keys(classified).length > 0
}

// 단일 텍스처를 로드해 슬롯에 세팅. 실패는 무시(guard).
// colorSpace: 색맵(map/emissiveMap)만 SRGB, 나머지는 linear(기본) 유지.
function loadTextureInto(loader, targetMaterial, slot, url, srgb) {
  if (!url) return
  try {
    loader.load(
      url,
      (texture) => {
        try {
          if (srgb) texture.colorSpace = THREE.SRGBColorSpace
          targetMaterial[slot] = texture
          targetMaterial.needsUpdate = true
        } catch {
          // 콜백 내 예외 무시.
        }
      },
      undefined,
      () => { /* 로드 실패 무시 — 원래 상태 유지 */ },
    )
  } catch {
    // load 호출 자체 실패 무시.
  }
}

// 원본 머티리얼을 mesh.userData 에 1회 보관(피커 "원본" 복원용).
function stashOriginal(mesh) {
  if (mesh.userData.assetboxOriginalMaterial === undefined) {
    mesh.userData.assetboxOriginalMaterial = mesh.material
  }
}

// ── B. 기본 머티리얼 폴백 ──────────────────────────────────────────────

// 중립 클레이 그레이. RoomEnvironment PMREM 환경맵과 함께 스튜디오 클레이처럼 보인다.
export function neutralMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xcfcccc,
    roughness: 0.62,
    metalness: 0.05,
  })
}

// 기존 머티리얼의 side(양면 렌더 보정 등)를 새 Standard 머티리얼로 승계.
function carryOverSide(source, target) {
  if (source && source.side !== undefined) target.side = source.side
}

// 감지된 텍스처(classified)를 MeshStandardMaterial 에 적용.
// map(albedo)/emissiveMap 만 SRGB, 그 외는 linear.
function applyDetectedTextures(loader, material, classified) {
  if (classified.albedo) loadTextureInto(loader, material, 'map', classified.albedo, true)
  if (classified.normal) loadTextureInto(loader, material, 'normalMap', classified.normal, false)
  if (classified.roughness) loadTextureInto(loader, material, 'roughnessMap', classified.roughness, false)
  if (classified.metalness) loadTextureInto(loader, material, 'metalnessMap', classified.metalness, false)
  if (classified.ao) loadTextureInto(loader, material, 'aoMap', classified.ao, false)
  if (classified.emissive) {
    // emissive 를 실제로 방출하도록 색을 흰색으로 올려준다(기본 검정이면 안 보임).
    material.emissive = new THREE.Color(0xffffff)
    loadTextureInto(loader, material, 'emissiveMap', classified.emissive, true)
  }
}

/**
 * A + B: root 를 순회하며, 색 텍스처가 없는(!material.map) 머티리얼만 보정.
 *   1) 형제 텍스처에서 albedo 가 감지되면 그것을 map 으로 로드(+normal/rough/metal/ao/emissive).
 *      → 슬롯 지원을 위해 MeshStandardMaterial 로 정규화 후 적용.
 *   2) albedo 도 못 찾으면 neutralMaterial(중립 클레이 그레이)로 교체.
 * 정상 텍스처(map 있음)·내장 텍스처 머티리얼은 절대 건드리지 않는다.
 * @returns {number} 보정한 머티리얼 수(디버그용)
 */
export function autoFixMaterials(root, textureUrls = []) {
  if (!root || typeof root.traverse !== 'function') return 0
  const classified = classifyTextures(textureUrls)
  const hasAlbedo = !!classified.albedo
  const loader = new THREE.TextureLoader()
  let fixedCount = 0

  root.traverse((child) => {
    if (!child.isMesh) return
    const materials = asMaterialArray(child.material)
    if (materials.length === 0) {
      // 머티리얼이 아예 없는 메시 → 중립 클레이.
      stashOriginal(child)
      child.material = neutralMaterial()
      fixedCount += 1
      return
    }

    let mutated = false
    const nextMaterials = materials.map((material) => {
      // 안전조건: 이미 색 텍스처가 붙어 있으면(정상/내장) 그대로 둔다.
      if (!material || hasProtectedColorMap(material)) return material

      // 여기부터는 !material.map 인 머티리얼만.
      stashOriginal(child)

      // 항상 MeshStandardMaterial 로 정규화(Phong 등 → Standard, 텍스처 슬롯 지원).
      const standard = neutralMaterial()
      carryOverSide(material, standard)

      if (hasAlbedo) {
        // 형제 텍스처가 감지됨 → 감지된 맵들을 적용. 색은 흰색으로(맵 색 그대로 보이게).
        standard.color = new THREE.Color(0xffffff)
        applyDetectedTextures(loader, standard, classified)
      } else {
        // 형제 albedo 없음. 원본 색이 "의미 있으면"(검정/미설정 아님) 살려서
        // 의도적 단색 머티리얼(예: 빨강)이 회색으로 뭉개지지 않게 한다.
        // 검정(0,0,0)/거의검정이면 렌더가 어두우니 중립 클레이 그레이 유지.
        const oc = material.color
        if (oc && (oc.r + oc.g + oc.b) > 0.06) {
          standard.color = oc.clone()
          if (typeof material.roughness === 'number') standard.roughness = material.roughness
          if (typeof material.metalness === 'number') standard.metalness = material.metalness
        }
        // else: neutralMaterial(중립 클레이 그레이) 기본값 유지.
      }

      mutated = true
      fixedCount += 1
      return standard
    })

    if (mutated) {
      child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0]
    }
  })

  return fixedCount
}

// ── B-2. GLB 보수적 폴백 ──────────────────────────────────────────────
//
// GLB(glTF)는 대부분 저작(authored) 머티리얼이 온전하므로 autoFixMaterials 처럼
// 적극적으로 손대면 정상 모델에 회귀가 난다. 여기서는 "머티리얼이 아예 없거나,
// 색·텍스처·버텍스컬러·emissive 가 전부 없어 새까맣게/안 보이게 렌더될" 머티리얼만
// 중립 클레이로 구제한다. 그 외 authored 머티리얼은 절대 건드리지 않는다.

// 색이 사실상 검정인가? (r+g+b < 0.06 이면 거의 검정으로 간주)
function isEffectivelyBlack(color) {
  if (!color) return true
  return (color.r + color.g + color.b) < 0.06
}

// 이 머티리얼이 "비어서 검게 뜰" 머티리얼인가?
//   교체 대상이 되려면 아래를 모두 만족해야 한다:
//     - 색 텍스처(map) 없음
//     - 버텍스컬러(vertexColors) 없음
//     - emissiveMap 없음
//     - emissive 색이 사실상 검정 (없으면 방출 없음 → 검정 취급)
//     - base color 가 사실상 검정
//   하나라도 어긋나면(색/텍스처/버텍스컬러/emissive 있음) authored 로 보고 보존.
function isEmptyBlackMaterial(material) {
  if (!material) return false
  if (material.map) return false
  if (material.vertexColors) return false
  if (material.emissiveMap) return false
  // emissive 가 있고 검정이 아니면 방출이 있으므로 보존.
  if (material.emissive && !isEffectivelyBlack(material.emissive)) return false
  // base color 가 검정이 아니면 색이 있으므로 보존.
  if (!isEffectivelyBlack(material.color)) return false
  return true
}

/**
 * GLB 전용 보수적 폴백. root 를 순회하며 각 mesh 에 대해 —
 *   - 머티리얼이 아예 없으면 → neutralMaterial() 적용(+원본 stash).
 *   - 머티리얼(배열 포함) 중 isEmptyBlackMaterial 을 만족하는 것만 중립 클레이로 교체.
 *   - 그 외(색/텍스처/버텍스컬러/emissive/투명 등 authored)는 절대 보존.
 * 전부 try/catch. 원본은 mesh.userData.assetboxOriginalMaterial 에 stash(피커 '원본' 호환).
 * @returns {number} 교체한 머티리얼 수(디버그용)
 */
export function neutralizeEmptyMaterials(root) {
  if (!root || typeof root.traverse !== 'function') return 0
  let fixedCount = 0

  root.traverse((child) => {
    try {
      if (!child.isMesh) return

      // 머티리얼이 아예 없는 메시 → 중립 클레이.
      if (!child.material) {
        stashOriginal(child)
        child.material = neutralMaterial()
        fixedCount += 1
        return
      }

      const materials = asMaterialArray(child.material)
      let mutated = false
      const nextMaterials = materials.map((material) => {
        try {
          if (isEmptyBlackMaterial(material)) {
            // 교체 전 원본 stash(최초 1회). authored side 승계.
            stashOriginal(child)
            const clay = neutralMaterial()
            carryOverSide(material, clay)
            mutated = true
            fixedCount += 1
            return clay
          }
        } catch {
          // 개별 머티리얼 판정 실패는 원본 유지.
        }
        return material
      })

      if (mutated) {
        child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0]
      }
    } catch {
      // 개별 메시 처리 실패는 무시하고 다음 메시로.
    }
  })

  return fixedCount
}

// ── C. 머티리얼 피커 프리셋 ────────────────────────────────────────────

// 프리셋: label 로 UI 노출, build()로 새 MeshStandardMaterial 생성.
// 'restore' 는 특수 처리(원본 복원).
export const MATERIAL_PRESETS = [
  { id: 'restore', label: '원본', restore: true },
  { id: 'clay', label: '클레이 그레이', build: () => new THREE.MeshStandardMaterial({ color: 0xcfcccc, roughness: 0.62, metalness: 0.05 }) },
  { id: 'white', label: '화이트', build: () => new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5, metalness: 0.0 }) },
  { id: 'matteBlack', label: '무광 검정', build: () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85, metalness: 0.0 }) },
  { id: 'silver', label: '메탈(실버)', build: () => new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.28, metalness: 1.0 }) },
  { id: 'gold', label: '골드', build: () => new THREE.MeshStandardMaterial({ color: 0xffd27a, roughness: 0.35, metalness: 1.0 }) },
  { id: 'plasticBlue', label: '플라스틱(블루)', build: () => new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4, metalness: 0.0 }) },
]

// 특수 프리셋: A 에서 감지된 텍스처가 있을 때만 노출.
export const DETECTED_PRESET_ID = 'detected'

// 원본(userData 보관본)으로 복원. 보관본이 없으면 현재 유지.
function restoreOriginal(mesh) {
  const original = mesh.userData.assetboxOriginalMaterial
  if (original !== undefined) {
    mesh.material = original
  }
}

// 감지된 텍스처를 새 Standard 머티리얼에 실어 mesh 에 적용.
function applyDetectedToMesh(mesh, loader, classified) {
  const materials = asMaterialArray(mesh.material)
  const build = () => {
    const standard = neutralMaterial()
    standard.color = new THREE.Color(0xffffff)
    applyDetectedTextures(loader, standard, classified)
    return standard
  }
  if (Array.isArray(mesh.material)) {
    mesh.material = materials.map(() => build())
  } else {
    mesh.material = build()
  }
}

/**
 * root 의 모든 mesh material 을 프리셋으로 교체.
 *   - preset.restore : userData 보관 원본으로 복원.
 *   - preset.id === DETECTED_PRESET_ID : classified 텍스처 적용.
 *   - 그 외 : preset.build() 로 새 머티리얼 교체(mesh 당 슬롯 수만큼 복제).
 * 교체 전 원본을 userData 에 보관해 언제든 '원본'으로 되돌릴 수 있게 한다.
 */
export function applyPreset(root, preset, classified = null) {
  if (!root || typeof root.traverse !== 'function' || !preset) return
  const loader = preset.id === DETECTED_PRESET_ID ? new THREE.TextureLoader() : null

  root.traverse((child) => {
    if (!child.isMesh) return
    try {
      // 원본 보관(최초 1회) — 어떤 프리셋을 쓰든 되돌릴 수 있게.
      stashOriginal(child)

      if (preset.restore) {
        restoreOriginal(child)
        return
      }

      if (preset.id === DETECTED_PRESET_ID && classified && loader) {
        applyDetectedToMesh(child, loader, classified)
        return
      }

      if (typeof preset.build === 'function') {
        const materials = asMaterialArray(child.material)
        if (Array.isArray(child.material)) {
          child.material = materials.map(() => {
            const m = preset.build()
            m.needsUpdate = true
            return m
          })
        } else {
          const m = preset.build()
          m.needsUpdate = true
          child.material = m
        }
      }
    } catch {
      // 개별 메시 교체 실패는 무시하고 다음 메시로.
    }
  })
}
