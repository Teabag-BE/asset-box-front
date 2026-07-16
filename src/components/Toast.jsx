import { createContext, useContext, useState, useCallback, useRef } from 'react'

// 가벼운 토스트(성공/에러/안내). useToast() 로 어디서든 호출.
//   const toast = useToast()
//   toast('저장되었습니다')                // 성공(기본)
//   toast('오류가 발생했어요', 'error')
//   toast('처리 중…', 'info')
const ToastCtx = createContext(() => {})
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastCtx)

let counter = 0
// AssetBox 브랜드 팔레트 — 리넨 화이트 카드 + 세이지/크림슨 아이콘 배지.
const KIND = {
  success: { badgeBg: '#e2e9df', badgeFg: '#556350', icon: '✓' },
  error:   { badgeBg: '#fde6e6', badgeFg: '#a32828', icon: '✕' },
  info:    { badgeBg: '#edeadb', badgeFg: '#6b7d64', icon: 'ℹ' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
  }, [])

  const toast = useCallback((message, type = 'success', ms = 3000) => {
    const id = ++counter
    setToasts((list) => [...list, { id, message, type }])
    timers.current[id] = setTimeout(() => dismiss(id), ms)
  }, [dismiss])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <style>{`@keyframes abx-toast-in{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}`}</style>
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', pointerEvents: 'none',
      }}>
        {toasts.map((t) => {
          const k = KIND[t.type] ?? KIND.success
          return (
            <div key={t.id} role="status" onClick={() => dismiss(t.id)}
              style={{
                pointerEvents: 'auto', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 11,
                background: '#ffffff', color: '#42503d', border: '1px solid #edeadb',
                borderRadius: 13, padding: '11px 16px 11px 12px', minWidth: 200, maxWidth: '92vw',
                fontSize: 14, fontWeight: 600, letterSpacing: '-.01em',
                boxShadow: '0 10px 30px rgba(44,56,41,0.18), 0 2px 6px rgba(44,56,41,0.06)',
                animation: 'abx-toast-in .24s cubic-bezier(.2,.7,.2,1)',
              }}>
              <span aria-hidden="true" style={{
                flex: '0 0 auto', width: 24, height: 24, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: k.badgeBg, color: k.badgeFg, fontSize: 14, fontWeight: 800,
              }}>{k.icon}</span>
              <span>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
