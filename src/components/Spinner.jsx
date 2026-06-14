import { cn } from '../utils/cn'

export default function Spinner({ className }) {
  return (
    <div
      className={cn('w-5 h-5 border-2 border-linen-200 border-t-[#869B7E] rounded-full animate-spin', className)}
    />
  )
}
