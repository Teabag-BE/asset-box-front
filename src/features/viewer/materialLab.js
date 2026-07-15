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

// 표면 높이 패턴(회색조)을 노멀맵으로 변환한다.
// glTF(.glb)는 bumpMap 을 지원하지 않으므로, 표면 질감을 노멀맵으로 만들면 라이브에서도
// 보이고 '변형본 .glb 다운로드'에도 함께 포함된다. (id, strength) 별 캐시.
const normalCache = new Map()
export function getSurfaceNormalTexture(id, strength = 0.85) {
  try {
    if (!id || id === 'none') return null
    const q = Math.round(Math.max(0, Math.min(1, strength)) * 100) / 100
    const key = `${id}:${q}`
    if (normalCache.has(key)) return normalCache.get(key)

    const height = getSurfaceTexture(id, q)          // 회색조 높이 CanvasTexture
    const src = height && height.image
    if (!src || !src.width) return null
    const w = src.width, h = src.height
    const data = src.getContext('2d').getImageData(0, 0, w, h).data
    const out = document.createElement('canvas'); out.width = w; out.height = h
    const octx = out.getContext('2d')
    const img = octx.createImageData(w, h)
    const H = (x, y) => data[(((y % h + h) % h) * w + ((x % w + w) % w)) * 4] / 255
    const s = 3.0                                     // Sobel 세기(노멀 기울기)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (H(x - 1, y) - H(x + 1, y)) * s
        const dy = (H(x, y - 1) - H(x, y + 1)) * s
        const len = Math.hypot(dx, dy, 1) || 1
        const i = (y * w + x) * 4
        img.data[i]     = (dx / len * 0.5 + 0.5) * 255
        img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255
        img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
      }
    }
    octx.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(out)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    normalCache.set(key, tex)
    return tex
  } catch (e) {
    console.warn('[materialLab] getSurfaceNormalTexture 실패:', e)
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
  { id: 'glass',    label: '유리',      params: { color: '#ffffff', metalness: 0.0, roughness: 0.02, clearcoat: 0.0, transmission: 1.0, ior: 1.5 } },
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
  surfaceStrength: 0.85,
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

    // 사용자가 첨부한 이미지 → albedo(map). 색은 흰색으로 해 맵 색을 그대로 보여준다.
    if (cfg.customMap && cfg.customMap.isTexture) {
      material.map = cfg.customMap
      material.color = new THREE.Color(0xffffff)
    }

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

    // 표면 질감 → normalMap. (bumpMap 은 glTF 로 내보내지 못하므로 노멀맵을 쓴다:
    // 라이브에서도 보이고 '변형본 .glb 다운로드'에도 함께 포함된다.)
    const s = num(cfg.surfaceStrength, 0.85)
    const surfaceNormal = getSurfaceNormalTexture(cfg.surfaceId, s)
    if (surfaceNormal) {
      material.normalMap = surfaceNormal
      const sc = 0.4 + s * 2.6   // 강도(최대 ~3.0) — 이전보다 더 세게.
      material.normalScale = new THREE.Vector2(sc, sc)
    }

    // 발광(emissive).
    const emissiveIntensity = num(cfg.emissiveIntensity, 0)
    if (emissiveIntensity > 0) {
      material.emissive = new THREE.Color(cfg.emissiveColor || '#ffffff')
      material.emissiveIntensity = emissiveIntensity
    }

    // 투명/유리(transmission). 실제 유리처럼 보이도록 굴절·반사·감쇠를 함께 세팅.
    const transmission = num(cfg.transmission, 0)
    if (transmission > 0) {
      material.transmission = transmission
      material.transparent = true
      material.metalness = 0            // 유리는 비금속(금속성이 섞이면 탁해진다)
      material.ior = num(cfg.ior, 1.5)
      // thickness(유리 두께)는 굴절 세기를 좌우한다. 고정값이면 큰 모델은 굴절이 약하고
      // 작은 모델은 과하게 왜곡돼서, 적용하는 메시 크기에 맞춰 _thickness 를 넘겨받는다(applyToMesh).
      const thickness = num(cfg._thickness, 0.5)
      material.thickness = thickness
      material.specularIntensity = 1.0  // 표면 프레넬 반사를 또렷하게 — 유리 특유의 하이라이트
      material.envMapIntensity = 1.5     // 환경 반사 강조(HDR/스튜디오가 유리에 비쳐야 유리다움)
      // 감쇠: 빛이 두께를 지날수록 아주 옅게 색이 물들어 깊이감을 준다(얇은 곳은 맑게 유지).
      material.attenuationColor = new THREE.Color('#eaf6ff')
      material.attenuationDistance = Math.max(thickness * 5, 0.5)
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

// 실험실에 처음 손대기 직전(= 화면에 보이던 상태)의 재질을 1회 보관(실험실 전용 키).
// 주의: autoFix 가 텍스처를 입혀 둔 모델은 assetboxOriginalMaterial 에 'autoFix 이전의
// 맵 없는 원본'이 들어있다. 실험실의 '오리지널'은 사용자가 보던 화면(=텍스처 입은 재질)으로
// 돌아가야 하므로, 그 키를 쓰지 않고 반드시 '현재 mesh.material' 을 저장한다.
// (예전엔 assetboxOriginalMaterial 을 우선 사용해서, 복원 시 텍스처가 사라지는 버그가 있었다.)
function stashLabOriginal(mesh) {
  if (mesh.userData.assetboxLabOriginal === undefined) {
    mesh.userData.assetboxLabOriginal = mesh.material
  }
}

// 유리(transmission) 두께 힌트: 메시의 월드 크기(평균 치수)의 절반 정도를 두께로.
// 큰 모델도 작은 모델도 자연스러운 굴절이 나오도록 [0.05, 3] 로 클램프.
function thicknessHintFor(mesh) {
  try {
    const geo = mesh.geometry
    if (!geo) return 0.5
    if (!geo.boundingBox) geo.computeBoundingBox()
    const size = new THREE.Vector3()
    geo.boundingBox.getSize(size)
    const scale = mesh.getWorldScale(new THREE.Vector3())
    const avg = (size.x * scale.x + size.y * scale.y + size.z * scale.z) / 3
    return Math.min(3, Math.max(0.05, avg * 0.5))
  } catch {
    return 0.5
  }
}

// 단일 mesh 에 buildMaterial 결과를 적용(슬롯 수만큼 복제).
function applyToMesh(mesh, config) {
  stashLabOriginal(mesh)
  // 유리일 때만 메시 크기 기반 두께를 실어 보낸다.
  const cfg = num(config.transmission, 0) > 0
    ? { ...config, _thickness: thicknessHintFor(mesh) }
    : config
  const materials = asMaterialArray(mesh.material)
  if (Array.isArray(mesh.material)) {
    mesh.material = materials.map(() => buildMaterial(cfg)).map((m, i) => m || materials[i])
  } else {
    const m = buildMaterial(cfg)
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
