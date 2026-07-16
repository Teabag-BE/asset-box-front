import { createContext, useContext, useState, useCallback, useRef } from 'react'

// 스타일 확인 모달. window.confirm() 대체. Promise 로 결과를 준다.
//   const confirm = useConfirm()
//   if (!(await confirm({ title:'삭제', message:'되돌릴 수 없어요.', confirmText:'삭제', danger:true }))) return
const ConfirmCtx = createContext(() => Promise.resolve(false))
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current = resolve
    setState({
      title: opts.title ?? '확인',
      message: opts.message ?? '',
      confirmText: opts.confirmText ?? '확인',
      cancelText: opts.cancelText ?? '취소',
      danger: !!opts.danger,
    })
  }), [])

  const close = useCallback((result) => {
    setState(null)
    if (resolver.current) { resolver.current(result); resolver.current = null }
  }, [])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div role="dialog" aria-modal="true" onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(20,22,27,0.5)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'abx-cf-fade .15s',
          }}>
          <style>{`@keyframes abx-cf-fade{from{opacity:0}to{opacity:1}}@keyframes abx-cf-pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, maxWidth: 340, width: '100%', padding: '22px 22px 18px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'abx-cf-pop .18s cubic-bezier(.2,.7,.2,1)',
            }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{state.title}</h3>
            {state.message && <p style={{ margin: '0 0 18px', fontSize: 14, color: '#64748b', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{state.message}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => close(false)}
                style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{state.cancelText}</button>
              <button type="button" onClick={() => close(true)}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: state.danger ? '#dc2626' : '#4b7d45' }}>{state.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
