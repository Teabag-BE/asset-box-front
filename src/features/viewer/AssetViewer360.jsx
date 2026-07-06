/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps */
// react-three-fiber 뷰어: useFrame/useThree 안에서 camera·scene 을 직접 변경하는 건
// r3f 의 정상 관용구라 react-hooks lint 규칙을 이 파일에 한해 끈다.
import { Suspense, useState, useRef, useEffect, Component } from 'react'
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, useProgress, Html, Center } from '@react-three/drei'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import * as THREE from 'three'

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

function HdrEnvironment({ url, extension }) {
  const { scene, gl } = useThree()

  useEffect(() => {
    const loader = extension === 'exr' ? new EXRLoader() : new RGBELoader()
    let envMap = null

    loader.load(
      url,
      (texture) => {
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

function textureNameAliases(name = '') {
  const basename = basenameOf(name)
  if (!basename) return []

  const aliases = new Set([basename])
  if (basename.endsWith('.jpg')) {
    aliases.add(`${basename.slice(0, -4)}.jpeg`)
  } else if (basename.endsWith('.jpeg')) {
    aliases.add(`${basename.slice(0, -5)}.jpg`)
  }

  return [...aliases]
}

function buildTextureUrlMap(textures = []) {
  const map = new Map()
  textures.forEach(texture => {
    const url = texture?.url || texture?.accessUrl
    if (!url) return
    const resolvedUrl = resolveS3AssetUrl(url)
    const originalName = texture.originalName || basenameOf(url)
    textureNameAliases(originalName).forEach(alias => map.set(alias, resolvedUrl))
    textureNameAliases(url).forEach(alias => map.set(alias, resolvedUrl))
  })
  return map
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

function resolveRelativeAssetUrl(assetUrl, modelUrl, textureUrlMap) {
  // FBX 내장(embedded) 텍스처는 FBXLoader 가 blob:/data: URL 로 로드한다.
  // 이걸 절대 건드리면 안 된다 — 아래 상대경로 해석에 걸려 pathname 만 남으면
  // 내장 텍스처가 통째로 깨진다(자동차 바디가 검게 나오던 진짜 원인).
  if (assetUrl.startsWith('blob:') || assetUrl.startsWith('data:')) return assetUrl

  const textureUrl = textureUrlMap.get(basenameOf(assetUrl))
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

function ObjModel({ url, wireframe, onLoaded }) {
  const obj = useLoader(OBJLoader, url)
  useEffect(() => {
    if (!obj) return
    normalizeModelObject(obj)
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
  if (extension === 'obj') return <ObjModel url={url} wireframe={wireframe} onLoaded={onLoaded} />
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

const SUPPORTED = ['glb', 'gltf', 'fbx', 'obj']

export default function AssetViewer360({
  modelUrl, fileExtension, textureUrls = [], thumbnailUrl, hdrUrl, hdrExtension,
  autoRotate: initRotate = true, className = ''
}) {
  const [autoRotate, setAutoRotate] = useState(initRotate)
  const [wireframe, setWireframe]   = useState(false)
  const [loadedObj, setLoadedObj]   = useState(null)
  const [modelCenter, setModelCenter] = useState(null)
  const [embeddedLights, setEmbeddedLights] = useState(false)
  const [capturing, setCapturing]   = useState(false)
  const controlsRef = useRef()

  const ext = fileExtension?.toLowerCase()

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

  if (!SUPPORTED.includes(ext) || !modelUrl) {
    return <ViewerFallback thumbnailUrl={thumbnailUrl} modelUrl={modelUrl} />
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} className={className}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {capturing && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239,68,68,0.9)', color: '#fff', fontSize: 12, fontWeight: 600,
          padding: '4px 12px', borderRadius: 99, zIndex: 10, pointerEvents: 'none'
        }}>● REC 6초 회전 캡처 중</div>
      )}

      <ErrorBoundary fallback={<ViewerFallback thumbnailUrl={thumbnailUrl} modelUrl={modelUrl} message="3D 미리보기 로딩에 실패했습니다" />}>
        <Canvas
          camera={{ position: [5, 3, 5], fov: 50 }}
          style={{ borderRadius: 12, width: '100%', height: '100%' }}
        >
          {/* GLB 내장 조명이 없는 경우에만 기본 조명 추가 */}
          {!embeddedLights && (
            <>
              <ambientLight intensity={0.8} />
              <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
              <directionalLight position={[-5, 5, -5]} intensity={0.3} />
            </>
          )}

          {/* 환경맵: HDR이 있으면 직접 로드, 없으면 기본 조명만 사용 */}
          {hdrUrl
            ? <HdrEnvironment url={hdrUrl} extension={hdrExtension} />
            : <DefaultEnvironment />}

          <Suspense fallback={<Loader />}>
            <Center>
              <ModelLoader
                url={modelUrl}
                extension={ext}
                textureUrls={textureUrls}
                wireframe={wireframe}
                onLoaded={handleLoaded}
                onLightsDetected={setEmbeddedLights}
              />
            </Center>
          </Suspense>

          <AutoFitCamera target={loadedObj} />
          <CaptureController
            capturing={capturing}
            modelCenter={modelCenter}
            onDone={handleCaptureDone}
          />

          <OrbitControls
            ref={controlsRef}
            makeDefault
            autoRotate={autoRotate && !capturing}
            autoRotateSpeed={1.5}
            enablePan={false}
            minDistance={0.5}
            maxDistance={50}
          />
        </Canvas>
      </ErrorBoundary>

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

      {embeddedLights && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(109,40,217,0.85)', color: '#fff',
          fontSize: 11, padding: '3px 8px', borderRadius: 99
        }}>💡 블렌더 내장 조명</div>
      )}
    </div>
  )
}
