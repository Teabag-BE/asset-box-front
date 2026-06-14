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

export default function Button({ children, variant = 'primary', size = 'md', className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
