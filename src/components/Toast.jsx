import { createContext, useContext, useState, useCallback, useRef } from 'react'

// 가벼운 토스트(성공/에러/안내) 시스템. useToast() 로 어디서든 호출.
//   const toast = useToast()
//   toast('저장되었습니다')                // 성공(기본)
//   toast('오류가 발생했어요', 'error')
//   toast('처리 중…', 'info')
const ToastCtx = createContext(() => {})
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastCtx)

let counter = 0
const STYLE = {
  success: { bg: '#4b7d45', icon: '✅' },
  error:   { bg: '#dc2626', icon: '⚠️' },
  info:    { bg: '#475569', icon: 'ℹ️' },
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
      <style>{`@keyframes abx-toast-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none',
      }}>
        {toasts.map((t) => {
          const s = STYLE[t.type] ?? STYLE.success
          return (
            <div key={t.id} role="status" onClick={() => dismiss(t.id)}
              style={{
                pointerEvents: 'auto', cursor: 'pointer', minWidth: 220, maxWidth: '90vw',
                padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff',
                background: s.bg, boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                display: 'flex', alignItems: 'center', gap: 8,
                animation: 'abx-toast-in .22s cubic-bezier(.2,.7,.2,1)',
              }}>
              <span aria-hidden="true">{s.icon}</span>
              <span>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
