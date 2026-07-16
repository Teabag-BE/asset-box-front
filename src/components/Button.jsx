import { cn } from '../utils/cn'

const variantClass = {
  primary:   'bg-[#869B7E] text-white hover:bg-[#6b7d64] shadow-sm',
  secondary: 'bg-white text-slate-700 hover:bg-linen-100 border border-[#C9CAAC]/60 hover:border-[#869B7E]/40',
  ghost:     'bg-transparent text-slate-600 hover:bg-linen-100',
  danger:    'bg-crimson-50 text-crimson-600 hover:bg-crimson-100 border border-crimson-200',
}
const sizeClass = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export default function Button({ children, variant = 'primary', size = 'md', loading = false, className, disabled, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {loading && (
        // 브랜드 스피너 — currentColor 라 버튼 텍스트색을 따른다.
        <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
