import { cn } from '../utils/cn'

// shrink-0: flex 컨테이너 안에서 옆 텍스트(닉네임 등)가 길어도 원형 아바타가 눌려 찌그러지지 않도록 고정
const sizeClass = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-16 h-16 text-2xl', xl: 'w-24 h-24 text-4xl' }

export default function Avatar({ src, nickname = '', size = 'md', className }) {
  if (src) {
    return <img src={src} alt={nickname} className={cn('shrink-0 rounded-full object-cover', sizeClass[size], className)} />
  }
  return (
    <div className={cn('shrink-0 rounded-full bg-[#869B7E] text-white font-bold flex items-center justify-center', sizeClass[size], className)}>
      {(nickname || '?').charAt(0).toUpperCase()}
    </div>
  )
}
