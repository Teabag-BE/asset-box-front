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
            className="bg-white w-full max-w-[340px] rounded-2xl p-6 border border-linen-200"
            style={{ boxShadow: '0 24px 64px rgba(44,56,41,0.28)', animation: 'abx-cf-pop .18s cubic-bezier(.2,.7,.2,1)' }}>
            {/* 아이콘 헤더: danger 는 크림슨, 일반은 세이지 */}
            <div className="flex items-start gap-3 mb-4">
              <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg ${state.danger ? 'bg-crimson-100 text-crimson-500' : 'bg-sage-100 text-[#556350]'}`} aria-hidden="true">
                {state.danger ? '🗑️' : '💬'}
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-[#42503d] leading-snug">{state.title}</h3>
                {state.message && <p className="text-[13.5px] text-slate-500 mt-1 leading-relaxed whitespace-pre-line">{state.message}</p>}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => close(false)}
                className="px-4 py-2 rounded-lg border border-[#C9CAAC]/70 bg-white text-[#556350] text-sm font-semibold hover:bg-linen-100 transition-colors">{state.cancelText}</button>
              <button type="button" onClick={() => close(true)}
                className={`px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors ${state.danger ? 'bg-crimson-500 hover:bg-crimson-600' : 'bg-[#869B7E] hover:bg-[#6b7d64]'}`}>{state.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
