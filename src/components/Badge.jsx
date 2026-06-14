import { cn } from '../utils/cn'

const variantClass = {
  default: 'bg-[#C9CAAC]/30 text-slate-700',
  violet:  'bg-sage-100 text-sage-700',
  blue:    'bg-blue-100 text-blue-700',
  green:   'bg-emerald-100 text-emerald-700',
  yellow:  'bg-amber-100 text-amber-800',
  red:     'bg-rose-100 text-rose-700',
}

export default function Badge({ children, variant = 'default', className, onRemove }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', variantClass[variant], className)}>
      {children}
      {onRemove && <button onClick={onRemove} className="hover:opacity-70 leading-none">×</button>}
    </span>
  )
}
