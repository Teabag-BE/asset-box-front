/* eslint-disable react-refresh/only-export-components */
import { Component, Suspense } from 'react'
import Spinner from './Spinner'

// 동적 import(청크) 로드 실패 판별 — 브라우저마다 메시지가 다르다.
//  Chrome: "Failed to fetch dynamically imported module"
//  Firefox: "error loading dynamically imported module"
//  Safari: "Importing a module script failed"
//  Vite 프리로드 헬퍼(CSS): "Unable to preload CSS"
const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

export function isChunkLoadError(error) {
  return CHUNK_ERROR_RE.test(String(error?.message ?? error ?? ''))
}

// 배포(컨테이너 교체) 뒤에는 옛 해시 청크가 서버에서 사라져 404 가 난다.
// 이미 열려 있던 탭은 옛 index.js 를 들고 있으므로 새로고침 한 번이면 새 청크를 받는다.
// 청크가 진짜로 깨진 경우의 무한 새로고침을 막기 위해 30초에 한 번만 자동 새로고침한다.
const RELOAD_KEY = 'assetbox:chunk-reload-at'
const RELOAD_GUARD_MS = 30_000

function tryAutoReload() {
  let last = 0
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0 } catch { /* 저장소 차단 — 가드 없이 1회 */ }
  if (Date.now() - last < RELOAD_GUARD_MS) return false
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* 무시 */ }
  window.location.reload()
  return true
}

// 청크 로드 실패·렌더 예외를 잡는 경계. 없으면 React 19 는 루트 전체를 언마운트(흰 화면)한다.
export class ChunkErrorBoundary extends Component {
  state = { error: null, reloading: false }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    if (this.props.autoReload && isChunkLoadError(error)) {
      if (tryAutoReload()) this.setState({ reloading: true })
      return
    }
    console.error('[ChunkErrorBoundary]', error)
  }

  componentDidUpdate(prevProps) {
    // 다른 경로로 이동하면 에러 화면을 거두고 새 페이지를 그린다.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, reloading: false })
    }
  }

  render() {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback
    if (reloading) {
      return <div className="flex justify-center py-24"><Spinner className="w-7 h-7" /></div>
    }
    const chunk = isChunkLoadError(error)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <span className="text-5xl mb-4">{chunk ? '🔄' : '⚠️'}</span>
        <p className="text-slate-700 font-semibold text-lg mb-1">
          {chunk ? '새 버전이 배포됐어요' : '화면을 그리는 중 문제가 생겼어요'}
        </p>
        <p className="text-slate-400 text-sm mb-4">
          {chunk ? '페이지를 새로고침하면 최신 화면을 불러옵니다.' : '새로고침 후에도 반복되면 관리자에게 알려주세요.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-[#869B7E] text-white text-sm px-4 py-2 hover:bg-[#6b7d64] transition-colors"
        >
          새로고침
        </button>
      </div>
    )
  }
}

// 라우트용: 에러 경계 + 청크 로딩 중 스피너. 헤더(Layout)는 그대로 두고 본문만 대체한다.
export default function RouteBoundary({ resetKey, children }) {
  return (
    <ChunkErrorBoundary autoReload resetKey={resetKey}>
      <Suspense fallback={<div className="flex justify-center py-24"><Spinner className="w-7 h-7" /></div>}>
        {children}
      </Suspense>
    </ChunkErrorBoundary>
  )
}
