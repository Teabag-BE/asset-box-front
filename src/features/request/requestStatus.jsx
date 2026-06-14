/* eslint-disable react-refresh/only-export-components */
// 상태 상수 + StatusBadge 를 함께 두는 공용 모듈 (board/detail 공유)
import Badge from '../../components/Badge'

// RequestStatus enum: REQUESTED, IN_REVIEW, IN_PROGRESS, COMPLETED, REJECTED
// 라벨/흐름은 기획 04_api/06_명세서_Request.md 기준.
export const STATUS = {
  REQUESTED:   { label: '요청됨', variant: 'violet' },
  IN_REVIEW:   { label: '검토중', variant: 'yellow' },  // enum에만 존재 · v1.1 도입 검토 (M1 미사용)
  IN_PROGRESS: { label: '제작중', variant: 'blue' },
  COMPLETED:   { label: '완료',   variant: 'green' },
  REJECTED:    { label: '반려',   variant: 'red' },      // reject/reopen API는 M1 미구현
}

// M1 MVP 상태 흐름 (직행 3단계): 요청됨 → 제작중 → 완료
//   요청됨→제작중 = PATCH /assign,  제작중→완료 = post 작성 시 자동(완료 버튼 없음)
export const STATUS_FLOW = ['REQUESTED', 'IN_PROGRESS', 'COMPLETED']

// M1 필터 탭: 전체 + 3단계 (IN_REVIEW=v1.1, REJECTED=M1 미발생 → 탭 제외, '전체'에는 노출)
export const STATUS_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'REQUESTED', label: '요청됨' },
  { key: 'IN_PROGRESS', label: '제작중' },
  { key: 'COMPLETED', label: '완료' },
]

export function StatusBadge({ status }) {
  const s = STATUS[status]
  return <Badge variant={s?.variant ?? 'default'}>{s?.label ?? status}</Badge>
}
