/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps */
// react-three-fiber 뷰어: useFrame/useThree 안에서 camera·scene 을 직접 변경하는 건
// r3f 의 정상 관용구라 react-hooks lint 규칙을 이 파일에 한해 끈다.
import { Suspense, useState, useRef, useEffect, useMemo, Component } from 'react'
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, useProgress, Html, Center } from '@react-three/drei'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import * as THREE from 'three'
import {
  autoFixMaterials,
  neutralizeEmptyMaterials,
} from './materialUtils'
import {
  SURFACE_TEXTURES,
  BASE_PRESETS,
  DEFAULT_CONFIG,
  applyMaterialConfig,
  restoreLab,
} from './materialLab'

class ErrorBoundary extends Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #e2e8f0',
          borderTopColor: '#7c3aed', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 8px'
        }} />
        {Math.round(progress)}%
      </div>
    </Html>
  )
}

function AutoFitCamera({ target }) {
  const { camera, controls } = useThree()
  useEffect(() => {
    if (!target) return

    target.updateWorldMatrix?.(true, true)
    const box = new THREE.Box3().setFromObject(target)
    if (box.isEmpty()) return

    const center = box.getCenter(new THREE.Vector3())
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 1)
    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
    const fitFov = Math.min(vFov, hFov)
    const dist = (radius / Math.sin(fitFov / 2)) * 1.12
    const direction = new THREE.Vector3(1, 0.45, 1).normalize()

    camera.position.copy(center).addScaledVector(direction, dist)
    camera.lookAt(center)
    camera.near = Math.max(dist / 100, 0.01)
    camera.far = Math.max(dist + radius * 8, 100)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(center)
      controls.minDistance = radius * 0.35
      controls.maxDistance = dist * 4
      controls.update()
      controls.saveState?.()
    }
  }, [target, camera, controls])
  return null
}

// 360° 캡처 컨트롤러 — capturing=true 동안 카메라를 한 바퀴 돌리고 WebM 녹화
function CaptureController({ capturing, modelCenter, onDone }) {
  const { camera, gl } = useThree()
  const recorderRef  = useRef(null)
  const chunksRef    = useRef([])
  const progressRef  = useRef(0)
  const startAngleRef = useRef(null)
  const radiusRef    = useRef(1)
  const yRef         = useRef(0)

  useEffect(() => {
    if (!capturing) return

    const canvas = gl.domElement
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm'
    const stream   = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType })

    chunksRef.current = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      onDone(blob)
    }
    recorder.start()
    recorderRef.current = recorder

    // 현재 카메라 수평 거리 저장, 높이는 모델 중심 기준 고정
    const cx = modelCenter?.x ?? 0, cy = modelCenter?.y ?? 0, cz = modelCenter?.z ?? 0
    radiusRef.current     = Math.sqrt((camera.position.x - cx) ** 2 + (camera.position.z - cz) ** 2)
    yRef.current          = cy + radiusRef.current * 0.25  // 살짝 위에서 내려다보는 각도
    startAngleRef.current = Math.atan2(camera.position.x - cx, camera.position.z - cz)
    progressRef.current  = 0

    return () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop() }
  }, [capturing])

  useFrame((_, delta) => {
    if (!capturing || startAngleRef.current === null) return
    const DURATION = 6 // 초
    progressRef.current += delta / DURATION

    if (progressRef.current >= 1) {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      startAngleRef.current = null
      return
    }

    const cx = modelCenter?.x ?? 0, cy = modelCenter?.y ?? 0, cz = modelCenter?.z ?? 0
    const angle = startAngleRef.current + progressRef.current * Math.PI * 2
    camera.position.x = Math.sin(angle) * radiusRef.current + cx
    camera.position.z = Math.cos(angle) * radiusRef.current + cz
    camera.position.y = yRef.current
    camera.lookAt(cx, cy, cz)
    camera.updateMatrixWorld()
  })

  return null
}

// HDR 미지정 시 기본 환경맵. metalness 가 있는 재질은 반사할 환경이 없으면
// 조명이 있어도 검게 나오므로(사과·통조림이 어둡던 원인), 내장 RoomEnvironment 를 깔아준다.
function DefaultEnvironment() {
  const { scene, gl } = useThree()

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envMap
    pmrem.dispose()

    return () => {
      scene.environment = null
      envMap.dispose()
    }
  }, [scene, gl])

  return null
}

// 낮/밤/스튜디오 조명 프리셋.
//   - toneMappingExposure(gl) 와 scene.background 는 useEffect 로 직접 설정하고
//     cleanup 에서 원복한다(setState 아님 → lint OK).
//   - preset 별 라이트는 JSX 로 return. RoomEnvironment(반사용)는 studio/day 에서 별도로 유지.
// preset: 'studio' | 'day' | 'night'
const LIGHTING_PRESETS = {
  // studio: 지금과 동일한 느낌. exposure 1.0, 배경은 기존 유지(건드리지 않음).
  studio: { exposure: 1.0, background: null, useRoomEnv: true },
  // day: 실제 HDR(/hdr/day.hdr)이 배경+환경맵을 담당. background=null 로 두어 LightingRig 가
  //      배경을 덮어쓰지 않게 하고(HDR 소유), 노출만 조정 + 소프트 태양광만 얹는다.
  day: { exposure: 1.0, background: null, useRoomEnv: false },
  // night: 어둡고 차가움. exposure 0.6, 어두운 남색 배경. 반사 환경은 유지(실루엣 방지).
  night: { exposure: 0.6, background: 0x0b1220, useRoomEnv: true },
}

function LightingRig({ preset = 'studio' }) {
  const { gl, scene } = useThree()
  const config = LIGHTING_PRESETS[preset] || LIGHTING_PRESETS.studio

  useEffect(() => {
    let prevExposure = 1.0
    let prevBackground = null
    try {
      prevExposure = gl.toneMappingExposure
      prevBackground = scene.background
      gl.toneMappingExposure = config.exposure
      // background 가 지정된 프리셋만 배경을 덮어쓴다. studio(null)는 기존 배경 유지.
      if (config.background !== null && config.background !== undefined) {
        scene.background = new THREE.Color(config.background)
      }
    } catch (e) {
      console.warn('[LightingRig] 조명 프리셋 적용 실패, 원래 상태 유지:', e)
    }

    return () => {
      try {
        gl.toneMappingExposure = prevExposure
        // 우리가 배경을 덮어썼던 경우에만 원복(다른 프리셋/HDR 배경을 훼손하지 않도록).
        if (config.background !== null && config.background !== undefined) {
          scene.background = prevBackground
        }
      } catch {
        // 원복 실패는 무시.
      }
    }
  }, [gl, scene, config.exposure, config.background])

  if (preset === 'day') {
    // 환경 조명은 실제 HDR(/hdr/day.hdr)이 제공하므로, 여기선 직접광을 최소화한다.
    // 부드러운 태양 하이라이트만 살짝 얹어 형태감을 살린다(과노출 방지).
    return (
      <>
        <directionalLight position={[8, 14, 6]} intensity={0.55} color={0xfff2e0} castShadow />
      </>
    )
  }

  if (preset === 'night') {
    // 어둡고 차가움. 낮은 cool ambient + 차가운 키/rim + 약한 warm point 로 온기.
    // 모델이 실루엣으로 죽지 않게 최소 가시성 확보.
    return (
      <>
        <ambientLight intensity={0.3} color={0x223044} />
        <directionalLight position={[5, 9, 4]} intensity={0.8} color={0x9db8ff} castShadow />
        <directionalLight position={[-6, 4, -5]} intensity={0.5} color={0x6f86c9} />
        <pointLight position={[2, 3, 3]} intensity={0.5} distance={20} decay={2} color={0xffb27a} />
      </>
    )
  }

  // studio(기본): 기존 하드코딩 조명과 동일.
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />
    </>
  )
}

// 환경맵 로더. .hdr(RGBELoader) / .exr(EXRLoader) / 등장방형 이미지(.jpg .png .webp, TextureLoader) 지원.
// 로컬 드래그앤드롭 파일(blob URL)도 동일 경로로 처리된다.
const IMAGE_ENV_EXTS = ['jpg', 'jpeg', 'png', 'webp']

function HdrEnvironment({ url, extension }) {
  const { scene, gl } = useThree()

  useEffect(() => {
    const isExr = extension === 'exr'
    const isImage = IMAGE_ENV_EXTS.includes(extension)
    const loader = isExr ? new EXRLoader() : isImage ? new THREE.TextureLoader() : new RGBELoader()
    let envMap = null
    let disposed = false

    loader.load(
      url,
      (texture) => {
        if (disposed) { texture.dispose?.(); return }
        // LDR 이미지는 sRGB 로 읽어야 색이 정상. HDR/EXR 은 선형이라 그대로 둔다.
        if (isImage) texture.colorSpace = THREE.SRGBColorSpace
        texture.mapping = THREE.EquirectangularReflectionMapping
        scene.background = texture

        const pmrem = new THREE.PMREMGenerator(gl)
        pmrem.compileEquirectangularShader()
        envMap = pmrem.fromEquirectangular(texture).texture
        scene.environment = envMap
        pmrem.dispose()
      },
      undefined,
      (err) => console.error('[HdrEnvironment] 로딩 실패:', err)
    )

    return () => {
      disposed = true
      scene.environment = null
      scene.background = null
      if (envMap) envMap.dispose()
    }
  }, [url, extension, scene, gl])

  return null
}

function applyWireframe(obj, wireframe) {
  obj.traverse(child => {
    if (!child.isMesh) return

    if (wireframe) {
      if (!child.userData.assetboxSolidMaterial) {
        child.userData.assetboxSolidMaterial = child.material
      }

      if (child.userData.assetboxWireframeMaterial) {
        child.material = child.userData.assetboxWireframeMaterial
        return
      }

      const sourceMaterials = Array.isArray(child.userData.assetboxSolidMaterial)
        ? child.userData.assetboxSolidMaterial
        : [child.userData.assetboxSolidMaterial]

      const wireMaterials = sourceMaterials.map(material => new THREE.MeshBasicMaterial({
        color: 0x475569,
        wireframe: true,
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthWrite: true,
        side: material?.side ?? THREE.DoubleSide,
      }))

      child.material = Array.isArray(child.userData.assetboxSolidMaterial)
        ? wireMaterials
        : wireMaterials[0]
      child.userData.assetboxWireframeMaterial = child.material
      return
    }

    if (child.userData.assetboxSolidMaterial) {
      const wireMaterials = Array.isArray(child.userData.assetboxWireframeMaterial)
        ? child.userData.assetboxWireframeMaterial
        : [child.userData.assetboxWireframeMaterial]
      wireMaterials.forEach(material => {
        if (material?.wireframe) material.dispose?.()
      })
      child.material = child.userData.assetboxSolidMaterial
      delete child.userData.assetboxSolidMaterial
      delete child.userData.assetboxWireframeMaterial
    }
  })
}

// FBX 자체 재질/텍스처 바인딩을 그대로 존중한다.
// 이전에는 텍스처 역할을 파일명으로 추측해 재질을 재구성했으나(applyViewerTextures),
// 그 2차 로직이 정상 업로드 모델의 올바른 native 바인딩을 오히려 망가뜨렸다
// (주황 자동차가 검게 됨). 여기서는 winding 뒤집힘 대비 양면 렌더만 최소 보정한다.
function relaxFbxCulling(obj) {
  obj.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true

    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach(material => {
      if (!material) return
      // FBX(Blender/기타 DCC export)는 winding 이 뒤집힌 메시가 있어
      // FrontSide culling 이면 통째로 사라진다. 양면 렌더로만 보정.
      material.side = THREE.DoubleSide
      material.needsUpdate = true
    })
  })
}

function normalizeModelObject(obj) {
  if (!obj || obj.userData?.assetboxNormalized) return false

  obj.updateWorldMatrix?.(true, true)
  const box = new THREE.Box3().setFromObject(obj)
  if (box.isEmpty()) return false

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(maxDim) || maxDim <= 0) return false

  const scale = 2.8 / maxDim
  obj.scale.multiplyScalar(scale)
  obj.position.addScaledVector(center, -scale)
  obj.updateWorldMatrix?.(true, true)
  obj.userData.assetboxNormalized = true
  return true
}

function hasEmbeddedLights(scene) {
  let found = false
  scene.traverse(child => { if (child.isLight) found = true })
  return found
}

function GltfModel({ url, wireframe, onLoaded, onLightsDetected }) {
  const { scene } = useGLTF(url)
  useEffect(() => {
    if (!scene) return
    normalizeModelObject(scene)
    // GLB 보수적 폴백: 색·텍스처·버텍스컬러·emissive 가 전부 없어 검게 뜰 머티리얼만
    // 중립 클레이로 구제. authored 머티리얼은 절대 건드리지 않는다. 예외 시 원본 유지.
    try { neutralizeEmptyMaterials(scene) } catch (e) { console.warn('[GltfModel] neutralizeEmptyMaterials 실패, 원본 유지:', e) }
    applyWireframe(scene, wireframe)
    onLightsDetected?.(hasEmbeddedLights(scene))
    onLoaded?.(scene)
  }, [scene])
  useEffect(() => { applyWireframe(scene, wireframe) }, [wireframe])
  return <primitive object={scene} />
}

function basenameOf(value = '') {
  const normalized = String(value).split('?')[0].replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
}

// 파일명에서 확장자를 뗀 stem. 예: foo_diff_1k.png → foo_diff_1k
function textureStem(basename) {
  const dot = basename.lastIndexOf('.')
  return dot > 0 ? basename.slice(0, dot) : basename
}

// 해상도 접미사(_1k/_2k/_4k/_2048 ...)까지 제거한 매칭 키.
// 텍스처는 1k/2k/4k 해상도, png/jpg/exr 포맷 등 "같은 텍스처의 변형"으로 배포되는 일이 많아,
// FBX 참조와 zip 파일의 확장자·해상도가 달라도 같은 텍스처로 보고 매칭하기 위한 것.
function textureMatchKey(basename) {
  return textureStem(basename).replace(/[_\-.]?(?:\d+k|1024|2048|4096|8192)$/i, '')
}

// 3단 매칭 맵: 정확(basename) → 확장자무시(stem) → 해상도+확장자무시(key)
function buildTextureUrlMap(textures = []) {
  const byBasename = new Map()
  const byStem = new Map()
  const byKey = new Map()
  textures.forEach(texture => {
    const url = texture?.url || texture?.accessUrl
    if (!url) return
    const resolvedUrl = resolveS3AssetUrl(url)
    const name = basenameOf(texture.originalName || url)
    if (!name) return

    byBasename.set(name, resolvedUrl)
    if (name.endsWith('.jpg')) byBasename.set(`${name.slice(0, -4)}.jpeg`, resolvedUrl)
    else if (name.endsWith('.jpeg')) byBasename.set(`${name.slice(0, -5)}.jpg`, resolvedUrl)

    const stem = textureStem(name)
    if (!byStem.has(stem)) byStem.set(stem, resolvedUrl)
    const key = textureMatchKey(name)
    if (key && !byKey.has(key)) byKey.set(key, resolvedUrl)
  })
  return { byBasename, byStem, byKey }
}

function resolveS3AssetUrl(url) {
  const s3Host = 'teabag-assetbox.s3.ap-northeast-2.amazonaws.com'
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.hostname === s3Host) return `/s3-assets${parsed.pathname}${parsed.search}`
  } catch {
    // keep original value below
  }
  return url
}

function resolveRelativeAssetUrl(assetUrl, modelUrl, textureMaps) {
  // FBX 내장(embedded) 텍스처는 FBXLoader 가 blob:/data: URL 로 로드한다.
  // 이걸 절대 건드리면 안 된다 — 아래 상대경로 해석에 걸려 pathname 만 남으면
  // 내장 텍스처가 통째로 깨진다(자동차 바디가 검게 나오던 진짜 원인).
  if (assetUrl.startsWith('blob:') || assetUrl.startsWith('data:')) return assetUrl

  // 정확 일치 → 확장자무시(stem) → 해상도+확장자무시(key) 순으로 매칭.
  // FBX가 diff_1k.jpg 를 참조해도 zip 의 diff_1k.png / diff.png 를 찾아 붙일 수 있게 한다.
  const name = basenameOf(assetUrl)
  const textureUrl = textureMaps.byBasename.get(name)
    || textureMaps.byStem.get(textureStem(name))
    || textureMaps.byKey.get(textureMatchKey(name))
  if (textureUrl) return textureUrl

  if (assetUrl.startsWith('/')) return assetUrl

  try {
    new URL(assetUrl, window.location.origin)
    const proxied = resolveS3AssetUrl(assetUrl)
    if (proxied !== assetUrl) return proxied
    if (assetUrl.startsWith('http://') || assetUrl.startsWith('https://')) return assetUrl
  } catch {
    // relative paths from FBX should be resolved against the model URL below
  }

  try {
    const resolved = new URL(assetUrl, new URL(modelUrl, window.location.href))
    return `${resolved.pathname}${resolved.search}`
  } catch {
    return assetUrl
  }
}

function FbxModel({ url, textureUrls, wireframe, onLoaded }) {
  const [fbx, setFbx] = useState(null)

  useEffect(() => {
    let cancelled = false

    // FBX 전용 LoadingManager 로 로드한다.
    // useLoader/new FBXLoader 는 기본적으로 전역 DefaultLoadingManager 를 공유하는데,
    // 앱 내 다른 로더(useGLTF·useProgress 등)와 얽히면 setURLModifier 가 유실돼
    // FBX 가 텍스처를 아예 요청하지 못하는 경우가 있었다(자동차가 검게 나오던 원인).
    // 로드마다 독립 매니저를 만들어 basename→presigned 매칭을 확실히 건다.
    const textureUrlMap = buildTextureUrlMap(textureUrls)
    const manager = new THREE.LoadingManager()
    manager.setURLModifier(assetUrl => resolveRelativeAssetUrl(assetUrl, url, textureUrlMap))

    const loader = new FBXLoader(manager)
    loader.load(
      url,
      obj => {
        if (cancelled) return
        // FBX 자체 재질/텍스처 바인딩을 그대로 존중한다(역할 추측·재질 재구성 없음).
        relaxFbxCulling(obj)
        normalizeModelObject(obj)
        // 관대화 보정: 색 텍스처가 없는(!material.map) 머티리얼만 형제 텍스처/중립 클레이로 보정.
        // 정상·내장 텍스처 머티리얼은 건드리지 않는다. 예외 시 원래 결과 그대로.
        try { autoFixMaterials(obj, textureUrls) } catch (e) { console.warn('[FbxModel] autoFixMaterials 실패, 원본 유지:', e) }
        setFbx(obj)
        onLoaded?.(obj)
      },
      undefined,
      err => console.error('[FbxModel] FBX 로딩 실패:', err)
    )

    return () => { cancelled = true }
  }, [url])

  useEffect(() => { if (fbx) applyWireframe(fbx, wireframe) }, [fbx, wireframe])

  return fbx ? <primitive object={fbx} /> : null
}

function ObjModel({ url, textureUrls, wireframe, onLoaded }) {
  const obj = useLoader(OBJLoader, url)
  useEffect(() => {
    if (!obj) return
    normalizeModelObject(obj)
    // 관대화 보정: FBX 와 동일하게 색 텍스처 없는 머티리얼만 보정. 예외 시 원본 유지.
    try { autoFixMaterials(obj, textureUrls) } catch (e) { console.warn('[ObjModel] autoFixMaterials 실패, 원본 유지:', e) }
    applyWireframe(obj, wireframe)
    onLoaded?.(obj)
  }, [obj])
  useEffect(() => { applyWireframe(obj, wireframe) }, [wireframe])
  return <primitive object={obj} />
}

function ModelLoader({ url, extension, textureUrls, wireframe, onLoaded, onLightsDetected }) {
  if (extension === 'glb' || extension === 'gltf')
    return <GltfModel url={url} wireframe={wireframe} onLoaded={onLoaded} onLightsDetected={onLightsDetected} />
  if (extension === 'fbx') return <FbxModel url={url} textureUrls={textureUrls} wireframe={wireframe} onLoaded={onLoaded} />
  if (extension === 'obj') return <ObjModel url={url} textureUrls={textureUrls} wireframe={wireframe} onLoaded={onLoaded} />
  return null
}

function ViewerControls({ autoRotate, wireframe, capturing, onToggleRotate, onToggleWireframe, onReset, onCapture }) {
  const btn = (active, onClick, label, title, extra = '') => (
    <button onClick={onClick} title={title} style={{
      padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14,
      background: active ? '#ede9fe' : 'transparent',
      color: active ? '#6d28d9' : extra === 'danger' ? '#ef4444' : '#475569',
    }}>{label}</button>
  )
  return (
    <div style={{
      position: 'absolute', bottom: 12, right: 12,
      display: 'flex', gap: 2, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(4px)', borderRadius: 10, padding: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      {btn(autoRotate, onToggleRotate, '↻', '자동 회전')}
      {btn(wireframe,  onToggleWireframe, '⬡', '와이어프레임')}
      {btn(false, onReset, '⌖', '카메라 초기화')}
      {btn(capturing, onCapture, capturing ? '⏹' : '🎬', capturing ? '녹화 중지' : '360° 프리뷰 캡처', capturing ? 'danger' : '')}
    </div>
  )
}

// 조명 프리셋 셀렉터 — 좌하단. MaterialPicker(우상단)·ViewerControls(우하단)와 안 겹침.
const LIGHTING_OPTIONS = [
  { id: 'studio', label: '💡', title: '스튜디오 조명' },
  { id: 'day',    label: '☀️', title: '낮 조명' },
  { id: 'night',  label: '🌙', title: '밤 조명' },
]

function LightingPicker({ value, onChange }) {
  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12,
      display: 'flex', gap: 2, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(4px)', borderRadius: 10, padding: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 10,
    }}>
      {LIGHTING_OPTIONS.map(opt => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            title={opt.title}
            style={{
              padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14,
              background: active ? '#ede9fe' : 'transparent',
              color: active ? '#6d28d9' : '#475569',
            }}
          >{opt.label}</button>
        )
      })}
    </div>
  )
}

// C. 머티리얼 실험실(MaterialLab) — 로드된 root 에 물리 재질을 실시간 조합해 입힌다.
// 색 + 표면 질감 + 마감 슬라이더 + 고급 속성(투명/유리·발광·클리어코트)을 한 패널에서.
// three 객체를 직접 수정하고, 리렌더가 필요하면 상태 토글로만 갱신한다.
// selectedMesh 가 있으면 그 파트에만, 없으면 전체에 적용한다.
function MaterialLab({
  root, config, onConfigChange,
  partSelect, onTogglePartSelect, selectedMesh, onClearSelection,
}) {
  const [open, setOpen] = useState(true)

  if (!root) return null

  // config 병합 후 즉시 적용(모든 호출은 이벤트 핸들러 안 → set-state-in-effect 위반 아님).
  const apply = (patch) => {
    const next = { ...config, ...patch }
    onConfigChange(next)
    try {
      applyMaterialConfig(root, next, selectedMesh || null)
    } catch (e) {
      console.warn('[MaterialLab] applyMaterialConfig 실패:', e)
    }
  }

  const pickBase = (preset) => {
    try {
      // 프리셋 params 로 config 의 물리 속성을 덮어쓴다(표면/발광 등 나머지는 유지).
      apply({
        color: preset.params.color ?? config.color,
        metalness: preset.params.metalness ?? config.metalness,
        roughness: preset.params.roughness ?? config.roughness,
        clearcoat: preset.params.clearcoat ?? config.clearcoat,
        transmission: preset.params.transmission ?? 0,
        ior: preset.params.ior ?? config.ior,
      })
    } catch (e) {
      console.warn('[MaterialLab] pickBase 실패:', e)
    }
  }

  const handleRestore = () => {
    try {
      restoreLab(root)
    } catch (e) {
      console.warn('[MaterialLab] restoreLab 실패:', e)
    }
    onConfigChange({ ...DEFAULT_CONFIG })
  }

  const chip = (active, onClick, label, key) => (
    <button key={key} onClick={onClick} style={{
      padding: '3px 8px', borderRadius: 6,
      border: active ? '1px solid #6d28d9' : '1px solid #e2e8f0',
      cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap',
      background: active ? '#ede9fe' : '#fff',
      color: active ? '#6d28d9' : '#475569',
    }}>{label}</button>
  )

  const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#334155', margin: '2px 0' }
  const sliderRow = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
      <span>{label}</span><span>{Number(value).toFixed(2)}</span>
    </div>
  )
  const slider = (key, min, max, step) => (
    <input
      type="range" min={min} max={max} step={step} value={config[key]}
      onChange={(e) => apply({ [key]: parseFloat(e.target.value) })}
      style={{ width: '100%' }}
    />
  )

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, bottom: 12, zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
      pointerEvents: 'none',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="머티리얼 실험실"
        style={{
          padding: '4px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600,
          background: 'rgba(255,255,255,0.92)', color: '#6d28d9',
          backdropFilter: 'blur(4px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          pointerEvents: 'auto', flex: '0 0 auto',
        }}
      >🧪 머티리얼 실험실</button>

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(4px)',
          borderRadius: 10, padding: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          width: 220, flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
          pointerEvents: 'auto',
        }}>
          {/* 베이스 재질 */}
          <div style={sectionTitle}>베이스 재질</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {chip(false, handleRestore, '↺ 오리지널', '__original__')}
            {BASE_PRESETS.map(p => chip(false, () => pickBase(p), p.label, p.id))}
          </div>

          {/* 표면 질감 */}
          <div style={sectionTitle}>표면 질감</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {SURFACE_TEXTURES.map(s => chip(
              config.surfaceId === s.id,
              () => apply({ surfaceId: s.id }),
              s.label, s.id,
            ))}
          </div>
          {config.surfaceId !== 'none' && (
            <>
              {sliderRow('강도', config.surfaceStrength)}
              {slider('surfaceStrength', 0, 1, 0.01)}
            </>
          )}

          {/* 마감 슬라이더 */}
          <div style={sectionTitle}>마감</div>
          {sliderRow('거칠기', config.roughness)}
          {slider('roughness', 0, 1, 0.01)}
          {sliderRow('금속성', config.metalness)}
          {slider('metalness', 0, 1, 0.01)}
          {sliderRow('클리어코트', config.clearcoat)}
          {slider('clearcoat', 0, 1, 0.01)}
          {sliderRow('발광', config.emissiveIntensity)}
          {slider('emissiveIntensity', 0, 2, 0.01)}
          {sliderRow('투명/유리', config.transmission)}
          {slider('transmission', 0, 1, 0.01)}

          {/* 색상 */}
          <div style={sectionTitle}>색상</div>
          <input
            type="color" value={config.color}
            onChange={(e) => apply({ color: e.target.value })}
            style={{ width: '100%', height: 28, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 0 }}
          />

          {/* 적용 범위 */}
          <div style={sectionTitle}>적용 범위</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {chip(!partSelect, () => { onClearSelection(); if (partSelect) onTogglePartSelect() }, '전체', 'scope-all')}
            {chip(partSelect, () => onTogglePartSelect(), '파트 선택', 'scope-part')}
          </div>
          {partSelect && (
            <div style={{ fontSize: 11, color: selectedMesh ? '#6d28d9' : '#94a3b8' }}>
              {selectedMesh
                ? `선택됨: ${selectedMesh.name || '(이름 없는 파트)'}`
                : '모델에서 파트를 클릭하세요'}
            </div>
          )}

          {/* 원본 복원 */}
          <button
            onClick={handleRestore}
            style={{
              marginTop: 2, padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
              cursor: 'pointer', fontSize: 12, background: '#fff', color: '#475569', fontWeight: 600,
            }}
          >↺ 원본 복원</button>
        </div>
      )}
    </div>
  )
}

// 마우스로 끌어 이동하는 인터랙티브 키라이트.
// 낮/밤/스튜디오 프리셋 위에 얹히는 추가 광원이라 어느 조명에서도 하이라이트/그림자 각도 변화가 보인다.
// angle: { az(방위각), el(고도각) } 라디안. 원점(0,0,0)을 향하는 구면좌표로 배치.
function MovableKeyLight({ angle, active }) {
  if (!active) return null

  let position = [6, 5, 5]
  try {
    const r = 8
    const az = angle?.az ?? 0
    const el = angle?.el ?? 0
    position = [
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      r * Math.cos(el) * Math.cos(az),
    ]
  } catch (e) {
    console.warn('[MovableKeyLight] 각도 계산 실패, 기본 위치 사용:', e)
  }

  return (
    <>
      {/* 강한 키라이트 — 기본 target 이 원점(0,0,0)이라 그대로 모델을 비춘다. */}
      <directionalLight position={position} intensity={1.8} color={0xfff4e6} castShadow />
      {/* 광원 위치 시각화용 작은 발광 구 — "빛이 여기 있다"를 보여준다. */}
      <mesh position={position}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshBasicMaterial color={0xfff4e6} />
      </mesh>
    </>
  )
}

// 썸네일 캡처 헬퍼 — Canvas 내부에서 useThree 로 gl 에 접근해 capture() 함수를 부모에 등록만 한다.
// setState 가 아니라 콜백 등록(부모가 넘긴 registerCapture 를 effect 에서 호출)이라 set-state-in-effect 위반 아님.
// capture(): 현재 프레임을 한 번 렌더한 뒤 canvas.toBlob 으로 PNG Blob 을 Promise 로 반환. 실패 시 null.
// registerCapture 가 없으면(상세페이지 등) 아무 것도 하지 않아 기존 뷰어 동작에 영향 없음.
function CaptureHelper({ registerCapture }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    if (typeof registerCapture !== 'function') return

    const capture = () => new Promise((resolve) => {
      try {
        // 캡처 직전 현재 상태로 한 번 강제 렌더(preserveDrawingBuffer 여도 최신 프레임 보장).
        gl.render(scene, camera)
        const canvas = gl.domElement
        if (canvas.toBlob) {
          canvas.toBlob((blob) => resolve(blob || null), 'image/png')
        } else {
          // toBlob 미지원 폴백 — dataURL → Blob 변환.
          try {
            const dataUrl = canvas.toDataURL('image/png')
            const binary = atob(dataUrl.split(',')[1])
            const arr = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i)
            resolve(new Blob([arr], { type: 'image/png' }))
          } catch (err) {
            console.warn('[CaptureHelper] toDataURL 폴백 실패:', err)
            resolve(null)
          }
        }
      } catch (err) {
        console.warn('[CaptureHelper] 캡처 실패:', err)
        resolve(null)
      }
    })

    registerCapture(capture)
    return () => registerCapture(null)
  }, [gl, scene, camera, registerCapture])

  return null
}

function ViewerFallback({ thumbnailUrl, modelUrl, message = '미리보기를 불러올 수 없습니다' }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#f1f5f9', borderRadius: 12,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
      {thumbnailUrl ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <img src={thumbnailUrl} alt="thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: 12,
            background: 'rgba(15,23,42,0.78)', color: '#fff',
            borderRadius: 10, padding: '10px 12px', fontSize: 12,
          }}>
            <div>{message}</div>
            {modelUrl && <a href={modelUrl} target="_blank" rel="noreferrer" style={{ color: '#bfdbfe' }}>모델 파일 열기</a>}
          </div>
        </div>
      ) : (
        <>
          <span style={{ fontSize: 48 }}>📦</span>
          <p style={{ fontSize: 13, marginTop: 8 }}>{message}</p>
          {modelUrl && <a href={modelUrl} target="_blank" rel="noreferrer" style={{ color: '#64748b', fontSize: 12 }}>모델 파일 열기</a>}
        </>
      )}
    </div>
  )
}

// D. 모델 스탯 — 로드된 THREE 객체를 순회하며 폴리 예산 지표를 집계한다.
// 테크니컬 아티스트가 삼각형/버텍스/메시/머티리얼/텍스처 수를 바로 확인하도록.
// 모든 계산은 useMemo(순수 계산) 안에서만 → set-state-in-effect 규칙과 무관.

// 삼각형 100k 이상이면 폴리 예산 경고(모바일/실시간 기준 대략적인 임계치).
const TRI_WARN_THRESHOLD = 100000

// 머티리얼에서 텍스처가 들어갈 수 있는 슬롯 — 존재하는 THREE.Texture 만 Set 에 모은다.
const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap',
]

// 천단위 콤마 포맷.
function formatNum(n) {
  try {
    return Number(n || 0).toLocaleString('en-US')
  } catch {
    return String(n)
  }
}

// loadedObj 순회 → 스탯 집계. 예외가 나도 뷰어를 죽이지 않도록 try/catch 로 감싼다.
function computeModelStats(obj) {
  if (!obj) return null
  try {
    let triangles = 0
    let vertices  = 0
    let meshCount = 0
    const materials = new Set()
    const textures  = new Set()

    obj.traverse((node) => {
      if (!node.isMesh || !node.geometry) return
      meshCount += 1

      const geo = node.geometry
      const pos = geo.attributes && geo.attributes.position
      if (pos) vertices += pos.count
      if (geo.index) triangles += geo.index.count / 3
      else if (pos) triangles += pos.count / 3

      // 머티리얼은 단일/배열 모두 가능 — 배열로 펼쳐 고유 집합에 모은다.
      const mats = Array.isArray(node.material) ? node.material : [node.material]
      mats.forEach((mat) => {
        if (!mat) return
        materials.add(mat)
        TEXTURE_SLOTS.forEach((slot) => {
          const tex = mat[slot]
          if (tex && tex.isTexture) textures.add(tex)
        })
      })
    })

    // 바운딩 비율 — 모델은 정규화(크기 2.8)돼 있어 실치수는 무의미. 최대변 기준 상대비만.
    let ratio = null
    try {
      const box = new THREE.Box3().setFromObject(obj)
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3())
        const max  = Math.max(size.x, size.y, size.z) || 1
        ratio = {
          x: size.x / max,
          y: size.y / max,
          z: size.z / max,
        }
      }
    } catch (err) {
      console.warn('[모델스탯] 바운딩 계산 실패:', err)
    }

    return {
      triangles: Math.round(triangles),
      vertices,
      meshCount,
      materialCount: materials.size,
      textureCount: textures.size,
      ratio,
    }
  } catch (err) {
    console.warn('[모델스탯] 집계 실패:', err)
    return null
  }
}

// 스탯 표시 UI — 좌상단. MaterialLab(우상단)·ViewerControls(우하단)·LightingPicker(좌하단)와
// 안 겹치게 좌상단에 둔다. 기본은 작은 📊 토글, 클릭하면 스탯 패널을 펼친다.
function ModelStats({ obj }) {
  const [open, setOpen] = useState(false)
  // obj 가 바뀔 때만 재계산(순수 useMemo).
  const stats = useMemo(() => computeModelStats(obj), [obj])

  if (!stats) return null

  const heavy = stats.triangles >= TRI_WARN_THRESHOLD

  const rows = [
    { label: '삼각형', value: formatNum(stats.triangles), emphasize: true },
    { label: '버텍스', value: formatNum(stats.vertices) },
    { label: '메시', value: formatNum(stats.meshCount) },
    { label: '머티리얼', value: formatNum(stats.materialCount) },
    { label: '텍스처', value: formatNum(stats.textureCount) },
  ]
  if (stats.ratio) {
    const r = stats.ratio
    rows.push({
      label: '비율 (W:H:D)',
      value: `${r.x.toFixed(2)} : ${r.y.toFixed(2)} : ${r.z.toFixed(2)}`,
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="모델 스탯 — 폴리 예산 보기"
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
          padding: '4px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 600,
          background: 'rgba(255,255,255,0.92)',
          color: heavy ? '#ef4444' : '#6d28d9',
          backdropFilter: 'blur(4px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
      >📊</button>
    )
  }

  return (
    <div style={{
      position: 'absolute', top: 10, left: 10, zIndex: 10,
      minWidth: 200, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(4px)', borderRadius: 10, padding: 10,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 12, color: '#475569',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{ fontWeight: 700, color: '#6d28d9' }}>📊 모델 스탯</span>
        <button
          onClick={() => setOpen(false)}
          title="접기"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: 0,
          }}
        >✕</button>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td style={{ padding: '2px 8px 2px 0', color: '#64748b', whiteSpace: 'nowrap' }}>
                {row.label}
              </td>
              <td style={{
                padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap',
                fontWeight: row.emphasize ? 700 : 500,
                fontSize: row.emphasize ? 14 : 12,
                color: row.emphasize ? (heavy ? '#ef4444' : '#6d28d9') : '#334155',
              }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {heavy && (
        <div style={{
          marginTop: 8, padding: '4px 8px', borderRadius: 6,
          background: 'rgba(239,68,68,0.12)', color: '#ef4444',
          fontSize: 11, fontWeight: 600,
        }}>⚠ 폴리곤 예산 초과 주의 (100k+)</div>
      )}
    </div>
  )
}

const SUPPORTED = ['glb', 'gltf', 'fbx', 'obj']

export default function AssetViewer360({
  modelUrl, fileExtension, textureUrls = [], thumbnailUrl, hdrUrl, hdrExtension,
  autoRotate: initRotate = true, className = '', onCaptureReady
}) {
  const [autoRotate, setAutoRotate] = useState(initRotate)
  const [wireframe, setWireframe]   = useState(false)
  const [lighting, setLighting]     = useState('studio')  // 'studio' | 'day' | 'night'
  const [loadedObj, setLoadedObj]   = useState(null)
  const [modelCenter, setModelCenter] = useState(null)
  const [embeddedLights, setEmbeddedLights] = useState(false)
  const [capturing, setCapturing]   = useState(false)
  const [lightMove, setLightMove]   = useState(false)  // 조명 이동 모드 on/off
  const [lightAngle, setLightAngle] = useState({ az: 0.7, el: 0.9 })  // 방위각/고도각(라디안)
  const [labConfig, setLabConfig]   = useState({ ...DEFAULT_CONFIG })  // 실험실 재질 config
  const [partSelect, setPartSelect] = useState(false)  // 파트 선택 모드 on/off
  const [selectedMesh, setSelectedMesh] = useState(null)  // 선택된 파트(THREE.Mesh|null)
  const [customEnv, setCustomEnv] = useState(null)  // 로컬 드롭 환경맵 { url, extension, name } | null
  const [envDragging, setEnvDragging] = useState(false)  // 환경맵 파일 드래그 중(오버레이 표시용)
  const controlsRef = useRef()
  const dragRef = useRef(null)  // 드래그 시작점 { x, y, az, el }
  const envFileInputRef = useRef(null)  // 환경맵 파일 선택 input
  const customEnvUrlRef = useRef(null)  // 현재 커스텀 환경맵 blob URL(언마운트 정리용, 항상 최신값 유지)

  const ext = fileExtension?.toLowerCase()

  const ENV_EXTS = ['hdr', 'exr', 'jpg', 'jpeg', 'png', 'webp']

  // 로컬 환경맵 파일을 blob URL 로 적용. 이전 blob URL 은 정리한다.
  function applyEnvFile(file) {
    if (!file) return false
    const name = file.name || 'env'
    const dot = name.lastIndexOf('.')
    const fileExt = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
    if (!ENV_EXTS.includes(fileExt)) return false
    const url = URL.createObjectURL(file)
    customEnvUrlRef.current = url
    setCustomEnv(prev => {
      if (prev?.url) { try { URL.revokeObjectURL(prev.url) } catch { /* 무시 */ } }
      return { url, extension: fileExt, name }
    })
    return true
  }

  function clearCustomEnv() {
    customEnvUrlRef.current = null
    setCustomEnv(prev => {
      if (prev?.url) { try { URL.revokeObjectURL(prev.url) } catch { /* 무시 */ } }
      return null
    })
  }

  // 드래그된 것이 "파일"인지 확인. types 는 최신 브라우저에선 배열, 구형에선 DOMStringList 라
  // Array.from 으로 통일해서 검사한다.
  function isFileDrag(e) {
    const types = e.dataTransfer?.types
    return !!types && Array.from(types).includes('Files')
  }

  // 드래그앤드롭: 뷰어 위에 환경맵 파일을 떨구면 즉시 적용.
  function handleEnvDragOver(e) {
    // 파일 드래그일 때만 관여(모델 파트 클릭/조명 드래그 등과 무관).
    if (isFileDrag(e)) {
      e.preventDefault()
      if (!envDragging) setEnvDragging(true)
    }
  }
  function handleEnvDragLeave(e) {
    // 컨테이너 밖으로 나갈 때만 해제(자식 위로 이동하는 leave 는 무시).
    if (e.currentTarget.contains(e.relatedTarget)) return
    setEnvDragging(false)
  }
  function handleEnvDrop(e) {
    if (!isFileDrag(e)) return
    e.preventDefault()
    setEnvDragging(false)
    const file = e.dataTransfer.files?.[0]
    applyEnvFile(file)
  }

  // 언마운트 시 남은 환경맵 blob URL 정리(ref 로 항상 최신 URL 을 읽는다).
  useEffect(() => {
    return () => {
      if (customEnvUrlRef.current) { try { URL.revokeObjectURL(customEnvUrlRef.current) } catch { /* 무시 */ } }
    }
  }, [])

  function handleLoaded(obj) {
    setLoadedObj(obj)
    const box    = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    setModelCenter({ x: center.x, y: center.y, z: center.z })
  }

  function handleCaptureDone(blob) {
    setCapturing(false)
    setAutoRotate(true)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'preview-360.webm'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // 조명 드래그 핸들러 — 모두 이벤트 핸들러 안에서 setState 하므로 lint OK.
  // el 은 모델 아래로 너무 안 내려가게 [-1.3, 1.4] 라디안으로 clamp.
  const EL_MIN = -1.3, EL_MAX = 1.4
  function handleLightPointerDown(e) {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      dragRef.current = { x: e.clientX, y: e.clientY, az: lightAngle.az, el: lightAngle.el }
    } catch (err) {
      console.warn('[조명이동] pointerDown 실패:', err)
    }
  }
  function handleLightPointerMove(e) {
    try {
      const start = dragRef.current
      if (!start || e.buttons === 0) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      const az = start.az + dx * 0.01
      let el = start.el - dy * 0.01
      el = Math.max(EL_MIN, Math.min(EL_MAX, el))
      setLightAngle({ az, el })
    } catch (err) {
      console.warn('[조명이동] pointerMove 실패:', err)
    }
  }
  function handleLightPointerUp() {
    dragRef.current = null
  }

  // 파트 선택: partSelect 모드일 때만 모델 클릭으로 클릭된 메시를 선택.
  // R3F onClick 은 이벤트 핸들러라 setState 안전. stopPropagation 으로 하위 전파 차단.
  function handleModelClick(e) {
    try {
      if (!partSelect) return
      e.stopPropagation?.()
      const mesh = e.object && e.object.isMesh ? e.object : null
      setSelectedMesh(mesh)
    } catch (err) {
      console.warn('[파트선택] 클릭 처리 실패:', err)
    }
  }

  if (!SUPPORTED.includes(ext) || !modelUrl) {
    return <ViewerFallback thumbnailUrl={thumbnailUrl} modelUrl={modelUrl} />
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      className={className}
      onDragOver={handleEnvDragOver}
      onDragLeave={handleEnvDragLeave}
      onDrop={handleEnvDrop}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {capturing && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239,68,68,0.9)', color: '#fff', fontSize: 12, fontWeight: 600,
          padding: '4px 12px', borderRadius: 99, zIndex: 10, pointerEvents: 'none'
        }}>● REC 6초 회전 캡처 중</div>
      )}

      {/* 환경맵 드롭 오버레이 — 파일 드래그 중에만 표시. pointerEvents:none 이라 드롭은 컨테이너가 받는다. */}
      {envDragging && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
          borderRadius: 12, border: '2px dashed #869B7E',
          background: 'rgba(134,155,126,0.14)', backdropFilter: 'blur(1px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#3f5238', fontWeight: 700, gap: 6,
        }}>
          <span style={{ fontSize: 34 }}>🌅</span>
          <span style={{ fontSize: 14 }}>환경맵을 여기에 놓으세요</span>
          <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.75 }}>.hdr · .exr · .jpg · .png (등장방형)</span>
        </div>
      )}

      <ErrorBoundary fallback={<ViewerFallback thumbnailUrl={thumbnailUrl} modelUrl={modelUrl} message="3D 미리보기 로딩에 실패했습니다" />}>
        <Canvas
          camera={{ position: [5, 3, 5], fov: 50 }}
          // preserveDrawingBuffer: 썸네일 자동생성(캔버스 → PNG 캡처)을 위해 드로잉 버퍼 유지.
          // 캡처 기능이 안 쓰여도(상세페이지 등) 동작에 영향 없고 성능 영향도 미미하다.
          gl={{ preserveDrawingBuffer: true }}
          style={{ borderRadius: 12, width: '100%', height: '100%' }}
        >
          {/* GLB 내장 조명이 없는 경우에만 프리셋 조명 리그 추가 */}
          {!embeddedLights && <LightingRig preset={lighting} />}

          {/* 마우스로 끌어 이동하는 인터랙티브 키라이트(조명 이동 모드일 때만) */}
          <MovableKeyLight angle={lightAngle} active={lightMove} />

          {/* 환경맵 우선순위: 로컬 드롭 환경맵 > 에셋 업로드 HDR > '낮' 프리셋 HDR(실제 하늘) > RoomEnvironment.
              드롭한 환경맵이 있으면 그것이 배경+반사를 담당한다.
              '낮'을 고르면 번들된 실사 HDR(/hdr/day.hdr)이 사진처럼 보인다(6MB라 낮 선택 시에만 로드). */}
          {customEnv
            ? <HdrEnvironment url={customEnv.url} extension={customEnv.extension} />
            : hdrUrl
              ? <HdrEnvironment url={hdrUrl} extension={hdrExtension} />
              : lighting === 'day'
                ? <HdrEnvironment url="/hdr/day.hdr" extension="hdr" />
                : <DefaultEnvironment />}

          <Suspense fallback={<Loader />}>
            <Center>
              {/* 파트 선택 모드일 때만 모델 클릭을 파트 선택으로 처리. */}
              <group onClick={partSelect ? handleModelClick : undefined}>
                <ModelLoader
                  url={modelUrl}
                  extension={ext}
                  textureUrls={textureUrls}
                  wireframe={wireframe}
                  onLoaded={handleLoaded}
                  onLightsDetected={setEmbeddedLights}
                />
              </group>
            </Center>
          </Suspense>

          <AutoFitCamera target={loadedObj} />
          <CaptureController
            capturing={capturing}
            modelCenter={modelCenter}
            onDone={handleCaptureDone}
          />
          {/* 썸네일 캡처 함수 등록 — onCaptureReady 가 주어질 때만 부모에 capture() 를 넘긴다. */}
          {onCaptureReady && <CaptureHelper registerCapture={onCaptureReady} />}

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enabled={!lightMove}
            autoRotate={autoRotate && !capturing}
            autoRotateSpeed={1.5}
            enablePan={false}
            minDistance={0.5}
            maxDistance={50}
          />
        </Canvas>
      </ErrorBoundary>

      {/* 조명 이동 드래그 오버레이 — 뷰어 전체를 덮되 피커/컨트롤(zIndex 10)보다는 아래(zIndex 5). */}
      {lightMove && (
        <div
          onPointerDown={handleLightPointerDown}
          onPointerMove={handleLightPointerMove}
          onPointerUp={handleLightPointerUp}
          onPointerLeave={handleLightPointerUp}
          style={{
            position: 'absolute', inset: 0, zIndex: 5,
            cursor: 'move', touchAction: 'none', borderRadius: 12,
          }}
        >
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(109,40,217,0.85)', color: '#fff', fontSize: 12, fontWeight: 600,
            padding: '4px 12px', borderRadius: 99, pointerEvents: 'none',
          }}>🔦 드래그해서 조명 이동</div>
        </div>
      )}

      <ViewerControls
        autoRotate={autoRotate}
        wireframe={wireframe}
        capturing={capturing}
        onToggleRotate={() => setAutoRotate(v => !v)}
        onToggleWireframe={() => setWireframe(v => !v)}
        onReset={() => { controlsRef.current?.reset(); setLoadedObj(prev => prev) }}
        onCapture={() => {
          if (capturing) { setCapturing(false) }
          else { setAutoRotate(false); setCapturing(true) }
        }}
      />

      <LightingPicker value={lighting} onChange={setLighting} />

      {/* 조명 이동 토글 버튼 — LightingPicker(좌하단 bottom 12) 바로 위. zIndex 10 로 오버레이보다 위. */}
      <button
        onClick={() => setLightMove(v => {
          const next = !v
          // 조명 이동을 켜면 파트 선택을 끈다(상호 배타, 클릭 충돌 방지).
          if (next) setPartSelect(false)
          return next
        })}
        title="조명 이동 모드 — 드래그로 광원 이동"
        style={{
          position: 'absolute', bottom: 52, left: 12, zIndex: 10,
          padding: '4px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600,
          background: lightMove ? '#6d28d9' : 'rgba(255,255,255,0.92)',
          color: lightMove ? '#fff' : '#6d28d9',
          backdropFilter: 'blur(4px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
      >🔦 조명 이동{lightMove ? ' ON' : ''}</button>

      {/* 환경맵 불러오기 — 조명 이동 버튼(bottom 52) 위. 드래그앤드롭 대체 수단 + 현재 커스텀 환경맵 표시/해제. */}
      <input
        ref={envFileInputRef}
        type="file"
        accept=".hdr,.exr,.jpg,.jpeg,.png,.webp,image/*"
        style={{ display: 'none' }}
        onChange={e => { applyEnvFile(e.target.files?.[0]); e.target.value = '' }}
      />
      <div style={{ position: 'absolute', bottom: 92, left: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => envFileInputRef.current?.click()}
          title={customEnv ? `내 환경맵: ${customEnv.name}` : '환경맵 불러오기 — 또는 .hdr/.exr/.jpg 파일을 뷰어에 끌어다 놓으세요'}
          style={{
            padding: '4px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: customEnv ? '#869B7E' : 'rgba(255,255,255,0.92)',
            color: customEnv ? '#fff' : '#3f5238',
            backdropFilter: 'blur(4px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >🌅 {customEnv ? '내 환경맵' : '환경맵'}</button>
        {customEnv && (
          <button
            onClick={clearCustomEnv}
            title="환경맵 해제 (프리셋으로 복귀)"
            style={{
              padding: '4px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: '#3f5238',
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >✕</button>
        )}
      </div>

      {loadedObj && (
        <MaterialLab
          root={loadedObj}
          config={labConfig}
          onConfigChange={setLabConfig}
          partSelect={partSelect}
          onTogglePartSelect={() => setPartSelect(v => {
            const next = !v
            // 파트 선택과 조명 이동은 상호 배타 — 조명 오버레이(zIndex 5)가 파트 클릭을
            // 삼키지 않도록 파트 선택을 켜면 조명 이동을 끈다.
            if (next) setLightMove(false)
            return next
          })}
          selectedMesh={selectedMesh}
          onClearSelection={() => setSelectedMesh(null)}
        />
      )}

      {loadedObj && <ModelStats obj={loadedObj} />}

      {/* 내장 조명 배지 — 좌상단 ModelStats(top 10) 아래로 내려 겹침 방지. */}
      {embeddedLights && (
        <div style={{
          position: 'absolute', top: 44, left: 10,
          background: 'rgba(109,40,217,0.85)', color: '#fff',
          fontSize: 11, padding: '3px 8px', borderRadius: 99
        }}>💡 블렌더 내장 조명</div>
      )}
    </div>
  )
}
