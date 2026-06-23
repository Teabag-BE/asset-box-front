/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps */
// react-three-fiber 뷰어: useFrame/useThree 안에서 camera·scene 을 직접 변경하는 건
// r3f 의 정상 관용구라 react-hooks lint 규칙을 이 파일에 한해 끈다.
import { Suspense, useState, useRef, useEffect, Component } from 'react'
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, useFBX, useProgress, Html, Center } from '@react-three/drei'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
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
    const box = new THREE.Box3().setFromObject(target)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const dist = maxDim * 2.0
    camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist)
    camera.lookAt(center)
    camera.near = dist / 100
    camera.far = dist * 100
    camera.updateProjectionMatrix()
    if (controls) { controls.target.copy(center); controls.update() }
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
    if (child.isMesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach(m => { if (m) m.wireframe = wireframe })
    }
  })
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
    applyWireframe(scene, wireframe)
    onLightsDetected?.(hasEmbeddedLights(scene))
    onLoaded?.(scene)
  }, [scene])
  useEffect(() => { applyWireframe(scene, wireframe) }, [wireframe])
  return <primitive object={scene} />
}

function FbxModel({ url, wireframe, onLoaded }) {
  const fbx = useFBX(url)
  useEffect(() => { if (fbx) { applyWireframe(fbx, wireframe); onLoaded?.(fbx) } }, [fbx])
  useEffect(() => { applyWireframe(fbx, wireframe) }, [wireframe])
  return <primitive object={fbx} />
}

function ObjModel({ url, wireframe, onLoaded }) {
  const obj = useLoader(OBJLoader, url)
  useEffect(() => { if (obj) { applyWireframe(obj, wireframe); onLoaded?.(obj) } }, [obj])
  useEffect(() => { applyWireframe(obj, wireframe) }, [wireframe])
  return <primitive object={obj} />
}

function ModelLoader({ url, extension, wireframe, onLoaded, onLightsDetected }) {
  if (extension === 'glb' || extension === 'gltf')
    return <GltfModel url={url} wireframe={wireframe} onLoaded={onLoaded} onLightsDetected={onLightsDetected} />
  if (extension === 'fbx') return <FbxModel url={url} wireframe={wireframe} onLoaded={onLoaded} />
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
  modelUrl, fileExtension, thumbnailUrl, hdrUrl, hdrExtension,
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
          {hdrUrl && <HdrEnvironment url={hdrUrl} extension={hdrExtension} />}

          <Suspense fallback={<Loader />}>
            <Center>
              <ModelLoader
                url={modelUrl}
                extension={ext}
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
          <gridHelper args={[20, 20, '#cbd5e1', '#e2e8f0']} />
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
