// "머티리얼 실험실"(MaterialLab) 순수 로직 모음.
//
// 목표: 색뿐 아니라 표면 질감·마감·고급 물리 속성(투명/유리·클리어코트·발광 등)을
// 조합해 실시간으로 재질을 실험하도록, THREE.MeshPhysicalMaterial 을 만들어 모델에
// 통째로 또는 파트별로 입힌다.
//
// ⚠️ 안전 원칙(기존 코드와 동일)
//   - 모든 함수는 try/catch 로 감싸 예외 시 원래 렌더를 유지한다(모델 로드/기존
//     autoFix·neutralize 결과를 훼손하지 않는다).
//   - 교체 전 원본 머티리얼을 mesh.userData 에 1회 보관해 '원본 복원'이 항상 가능.
//     기존 autoFix/neutralize 가 쓰는 `assetboxOriginalMaterial` 키와 충돌하지 않도록
//     별도 키 `assetboxLabOriginal` 을 쓴다. (단, 그 원조차 없으면 assetbox 원본으로 폴백)
//   - CSP 상 외부 리소스 금지 → 표면 텍스처는 canvas 로 절차적으로 생성한다.
//
// 비유: 재질을 "옷감 견본"처럼 다룬다. 베이스(금/은/플라스틱…)를 고르고, 그 위에
// 표면 질감(울퉁불퉁/브러시드/가죽…)이라는 요철 무늬를 얹고, 슬라이더로 광택·금속감·
// 두께감을 조절한다. 원단 무늬(캔버스 텍스처)는 (종류, 강도)별로 한 번만 짜서 재사용한다.
import * as THREE from 'three'

// ── 공통 유틸 ──────────────────────────────────────────────────────────

function asMaterialArray(material) {
  if (!material) return []
  return Array.isArray(material) ? material : [material]
}

// ── 1) 절차적 표면 텍스처 (canvas → THREE.CanvasTexture) ────────────────
//
// 각 텍스처는 회색조 "높이패턴"을 그린다(밝을수록 볼록). bumpMap 용도.
// strength(0~1)로 대비를 조절한다. (id, strength) 별로 캐시해 재생성을 막는다.

const SURFACE_SIZE = 256

// canvas 픽셀 버퍼를 회색조 함수로 채워 CanvasTexture 로 반환.
// heightFn(x, y) → 0~1 (0=검정/오목, 1=흰색/볼록)
function makeGrayscaleTexture(heightFn, repeat = 4) {
  const canvas = document.createElement('canvas')
  canvas.width = SURFACE_SIZE
  canvas.height = SURFACE_SIZE
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(SURFACE_SIZE, SURFACE_SIZE)
  const data = image.data
  for (let y = 0; y < SURFACE_SIZE; y += 1) {
    for (let x = 0; x < SURFACE_SIZE; x += 1) {
      let v = heightFn(x, y)
      if (!Number.isFinite(v)) v = 0.5
      v = Math.max(0, Math.min(1, v))
      const g = Math.round(v * 255)
      const idx = (y * SURFACE_SIZE + x) * 4
      data[idx] = g
      data[idx + 1] = g
      data[idx + 2] = g
      data[idx + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.needsUpdate = true
  return texture
}

// 값-노이즈(값 격자 + 이중선형 보간) — 시드 기반 결정적, 매번 같은 무늬.
function makeValueNoise(gridSize, seed) {
  const grid = new Float32Array(gridSize * gridSize)
  let s = seed >>> 0
  const rnd = () => {
    // xorshift32
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return (s >>> 0) / 4294967296
  }
  for (let i = 0; i < grid.length; i += 1) grid[i] = rnd()
  const at = (gx, gy) => {
    const wx = ((gx % gridSize) + gridSize) % gridSize
    const wy = ((gy % gridSize) + gridSize) % gridSize
    return grid[wy * gridSize + wx]
  }
  return (nx, ny) => {
    const fx = nx * gridSize
    const fy = ny * gridSize
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const smooth = (t) => t * t * (3 - 2 * t)
    const sx = smooth(tx)
    const sy = smooth(ty)
    const v00 = at(x0, y0)
    const v10 = at(x0 + 1, y0)
    const v01 = at(x0, y0 + 1)
    const v11 = at(x0 + 1, y0 + 1)
    const top = v00 + (v10 - v00) * sx
    const bottom = v01 + (v11 - v01) * sx
    return top + (bottom - top) * sy
  }
}

// 각 표면 텍스처의 회색조 패턴 생성기.
// strength(0~1): 요철 대비 세기. 0.5 를 기준으로 위아래로 벌린다.
function buildSurfaceTexture(id, strength) {
  const amp = Math.max(0, Math.min(1, strength))
  const contrast = (v) => 0.5 + (v - 0.5) * amp

  if (id === 'noise') {
    const noise = makeValueNoise(16, 1337)
    return makeGrayscaleTexture((x, y) => {
      const v = noise(x / SURFACE_SIZE, y / SURFACE_SIZE)
      return contrast(v)
    }, 4)
  }

  if (id === 'brushed') {
    // 가로로 흐르는 미세한 결. 세로 방향 고주파 줄무늬 + 약한 흔들림.
    const jitter = makeValueNoise(8, 909)
    return makeGrayscaleTexture((x, y) => {
      const line = 0.5 + 0.5 * Math.sin((y + jitter(x / SURFACE_SIZE, y / SURFACE_SIZE) * 6) * 1.6)
      const grain = jitter(x / SURFACE_SIZE * 3, y / SURFACE_SIZE * 0.2) * 0.3
      return contrast(line * 0.7 + grain)
    }, 3)
  }

  if (id === 'leather') {
    // 가죽/천: 굵은 셀 + 미세 grain 을 겹친 유기적 요철.
    const cell = makeValueNoise(10, 55)
    const grain = makeValueNoise(40, 7)
    return makeGrayscaleTexture((x, y) => {
      const nx = x / SURFACE_SIZE
      const ny = y / SURFACE_SIZE
      const v = cell(nx, ny) * 0.65 + grain(nx, ny) * 0.35
      return contrast(v)
    }, 3)
  }

  if (id === 'dots') {
    // 규칙적 도트(반구형 볼록). 격자마다 밝은 원.
    const period = 32
    const r = period * 0.32
    return makeGrayscaleTexture((x, y) => {
      const cx = (Math.floor(x / period) + 0.5) * period
      const cy = (Math.floor(y / period) + 0.5) * period
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const v = d < r ? 0.5 + 0.5 * Math.cos((d / r) * Math.PI) : 0
      return contrast(v)
    }, 4)
  }

  if (id === 'waves') {
    // 물결: 교차하는 사인파.
    return makeGrayscaleTexture((x, y) => {
      const nx = x / SURFACE_SIZE
      const ny = y / SURFACE_SIZE
      const v = 0.5 + 0.25 * Math.sin(nx * Math.PI * 8) + 0.25 * Math.sin(ny * Math.PI * 8 + 1.3)
      return contrast(v)
    }, 2)
  }

  // 알 수 없는 id → null (없음 취급).
  return null
}

// (id, strength) 별 캐시. strength 는 소수 2자리로 양자화해 키를 안정화.
const surfaceCache = new Map()

/**
 * 표면 텍스처 반환(회색조 bumpMap 용). id==='none' 이거나 실패 시 null.
 * (id, strength) 별로 캐시해 재생성을 막는다.
 */
export function getSurfaceTexture(id, strength = 0.6) {
  try {
    if (!id || id === 'none') return null
    const q = Math.round(Math.max(0, Math.min(1, strength)) * 100) / 100
    const key = `${id}:${q}`
    if (surfaceCache.has(key)) return surfaceCache.get(key)
    const texture = buildSurfaceTexture(id, q)
    surfaceCache.set(key, texture)
    return texture
  } catch (e) {
    console.warn('[materialLab] getSurfaceTexture 실패:', e)
    return null
  }
}

// UI 노출용 표면 질감 목록. make(strength) 로 텍스처 생성(캐시 경유).
export const SURFACE_TEXTURES = [
  { id: 'none', label: '없음', make: () => null },
  { id: 'noise', label: '울퉁불퉁', make: (s) => getSurfaceTexture('noise', s) },
  { id: 'brushed', label: '브러시드', make: (s) => getSurfaceTexture('brushed', s) },
  { id: 'leather', label: '가죽/천', make: (s) => getSurfaceTexture('leather', s) },
  { id: 'dots', label: '도트', make: (s) => getSurfaceTexture('dots', s) },
  { id: 'waves', label: '물결', make: (s) => getSurfaceTexture('waves', s) },
]

// ── 2) 베이스 프리셋 ──────────────────────────────────────────────────
//
// 클릭 시 config 의 물리 속성(color/metalness/roughness/clearcoat/transmission…)을
// 그 재질값으로 세팅한다. 유리는 transmission 을 사용한다.

export const BASE_PRESETS = [
  { id: 'gold',     label: '골드',      params: { color: '#ffd27a', metalness: 1.0, roughness: 0.3,  clearcoat: 0.0, transmission: 0.0 } },
  { id: 'silver',   label: '실버',      params: { color: '#e6e6e6', metalness: 1.0, roughness: 0.2,  clearcoat: 0.0, transmission: 0.0 } },
  { id: 'copper',   label: '구리',      params: { color: '#c47a52', metalness: 1.0, roughness: 0.35, clearcoat: 0.0, transmission: 0.0 } },
  { id: 'chrome',   label: '크롬',      params: { color: '#f0f4f8', metalness: 1.0, roughness: 0.05, clearcoat: 0.4, transmission: 0.0 } },
  { id: 'brushed',  label: '무광 금속',  params: { color: '#b8bcc2', metalness: 1.0, roughness: 0.62, clearcoat: 0.0, transmission: 0.0 } },
  { id: 'plastic',  label: '플라스틱',   params: { color: '#3b82f6', metalness: 0.0, roughness: 0.4,  clearcoat: 0.5, transmission: 0.0 } },
  { id: 'rubber',   label: '고무',      params: { color: '#2a2a2e', metalness: 0.0, roughness: 0.95, clearcoat: 0.0, transmission: 0.0 } },
  { id: 'ceramic',  label: '세라믹',     params: { color: '#f5f0e8', metalness: 0.0, roughness: 0.25, clearcoat: 0.6, transmission: 0.0 } },
  { id: 'glass',    label: '유리',      params: { color: '#eaf4ff', metalness: 0.0, roughness: 0.05, clearcoat: 0.0, transmission: 0.95, ior: 1.5 } },
  { id: 'clay',     label: '클레이',     params: { color: '#cfcccc', metalness: 0.05, roughness: 0.7, clearcoat: 0.0, transmission: 0.0 } },
]

// config 기본값. UI 로컬 state 초기값으로도 재사용.
export const DEFAULT_CONFIG = {
  color: '#cfcccc',
  metalness: 0.05,
  roughness: 0.7,
  clearcoat: 0.0,
  emissiveColor: '#ffffff',
  emissiveIntensity: 0.0,
  opacity: 1.0,
  transmission: 0.0,
  ior: 1.5,
  iridescence: 0.0,
  surfaceId: 'none',
  surfaceStrength: 0.6,
}

// ── 3) 머티리얼 생성 ──────────────────────────────────────────────────

function num(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * config → THREE.MeshPhysicalMaterial. 실패 시 null(호출부에서 기존 유지).
 * surfaceId 텍스처가 있으면 bumpMap + bumpScale(strength 반영).
 * transmission>0 이면 transparent/transmission/ior/thickness.
 * emissiveIntensity>0 이면 emissive 색 + intensity. opacity<1 이면 transparent.
 */
export function buildMaterial(config = {}) {
  try {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(cfg.color || '#cfcccc'),
      metalness: num(cfg.metalness, 0.05),
      roughness: num(cfg.roughness, 0.7),
    })

    // 클리어코트(맑은 광택 코팅층).
    const clearcoat = num(cfg.clearcoat, 0)
    if (clearcoat > 0) {
      material.clearcoat = clearcoat
      material.clearcoatRoughness = 0.1
    }

    // 무지개빛(iridescence) — 있으면 은은한 오일 슬릭.
    const iridescence = num(cfg.iridescence, 0)
    if (iridescence > 0) {
      material.iridescence = iridescence
      material.iridescenceIOR = 1.3
    }

    // 표면 질감 → bumpMap.
    const surface = getSurfaceTexture(cfg.surfaceId, num(cfg.surfaceStrength, 0.6))
    if (surface) {
      material.bumpMap = surface
      material.bumpScale = 0.02 + num(cfg.surfaceStrength, 0.6) * 0.25
    }

    // 발광(emissive).
    const emissiveIntensity = num(cfg.emissiveIntensity, 0)
    if (emissiveIntensity > 0) {
      material.emissive = new THREE.Color(cfg.emissiveColor || '#ffffff')
      material.emissiveIntensity = emissiveIntensity
    }

    // 투명/유리(transmission).
    const transmission = num(cfg.transmission, 0)
    if (transmission > 0) {
      material.transmission = transmission
      material.transparent = true
      material.ior = num(cfg.ior, 1.5)
      material.thickness = 0.5
    }

    // 반투명(opacity) — transmission 과 별개로 알파 투명.
    const opacity = num(cfg.opacity, 1)
    if (opacity < 1) {
      material.transparent = true
      material.opacity = opacity
    }

    material.side = THREE.DoubleSide
    material.needsUpdate = true
    return material
  } catch (e) {
    console.warn('[materialLab] buildMaterial 실패:', e)
    return null
  }
}

// ── 4) 적용 / 복원 ────────────────────────────────────────────────────

// 원본 머티리얼을 mesh.userData 에 1회 보관(실험실 전용 키).
// 이미 기존 autoFix/neutralize 가 assetboxOriginalMaterial 에 보관해 두었으면
// 그걸 훼손하지 않도록 별도 키를 쓴다. 없으면 현재 material 을 최초 1회 저장.
function stashLabOriginal(mesh) {
  if (mesh.userData.assetboxLabOriginal === undefined) {
    mesh.userData.assetboxLabOriginal = mesh.userData.assetboxOriginalMaterial !== undefined
      ? mesh.userData.assetboxOriginalMaterial
      : mesh.material
  }
}

// 단일 mesh 에 buildMaterial 결과를 적용(슬롯 수만큼 복제).
function applyToMesh(mesh, config) {
  stashLabOriginal(mesh)
  const materials = asMaterialArray(mesh.material)
  if (Array.isArray(mesh.material)) {
    mesh.material = materials.map(() => buildMaterial(config)).map((m, i) => m || materials[i])
  } else {
    const m = buildMaterial(config)
    if (m) mesh.material = m
  }
}

/**
 * targetMesh 있으면 그 메시만, 없으면 root 전체 메시에 buildMaterial 결과 적용.
 * 교체 전 원본을 assetboxLabOriginal 에 1회 보관. 전부 try/catch.
 * @returns {number} 적용한 메시 수(디버그용)
 */
export function applyMaterialConfig(root, config, targetMesh = null) {
  let count = 0
  try {
    if (targetMesh && targetMesh.isMesh) {
      applyToMesh(targetMesh, config)
      return 1
    }
    if (!root || typeof root.traverse !== 'function') return 0
    root.traverse((child) => {
      try {
        if (!child.isMesh) return
        applyToMesh(child, config)
        count += 1
      } catch {
        // 개별 메시 실패는 무시하고 다음 메시로.
      }
    })
  } catch (e) {
    console.warn('[materialLab] applyMaterialConfig 실패:', e)
  }
  return count
}

/**
 * 실험실 보관 원본으로 복원. 보관본이 없으면 해당 메시는 현재 유지.
 * @returns {number} 복원한 메시 수(디버그용)
 */
export function restoreLab(root) {
  let count = 0
  try {
    if (!root || typeof root.traverse !== 'function') return 0
    root.traverse((child) => {
      try {
        if (!child.isMesh) return
        const original = child.userData.assetboxLabOriginal
        if (original !== undefined) {
          child.material = original
          count += 1
        }
      } catch {
        // 개별 복원 실패는 무시.
      }
    })
  } catch (e) {
    console.warn('[materialLab] restoreLab 실패:', e)
  }
  return count
}
