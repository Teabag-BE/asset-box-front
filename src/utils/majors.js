// 백엔드 Major enum(BACK_END, TA, UNREAL, UNITY, AI)과 1:1. 목록 밖 값을 보내면 서버가 Major.valueOf 에서 500 을 낸다.
export const MAJORS = [
  { value: 'TA', label: '3D 아티스트' },
  { value: 'UNITY', label: 'Unity 크리에이터' },
  { value: 'UNREAL', label: 'Unreal 크리에이터' },
  { value: 'BACK_END', label: '개발자' },
  { value: 'AI', label: 'AI 크리에이터' },
]

export function majorLabel(value) {
  return MAJORS.find(m => m.value === value)?.label ?? value ?? ''
}
