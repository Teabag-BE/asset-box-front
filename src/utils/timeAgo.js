// 백엔드는 createdAt 을 LocalDateTime(타임존 정보 없는 문자열, 예: "2026-07-16T01:00:00")으로 준다.
// 서버(EC2)는 UTC 라 이 값은 UTC 기준인데, JS new Date()는 타임존 없는 문자열을 '로컬(KST)'로 해석해
// KST에서 9시간 어긋난다("방금" → "9시간 전"). → 타임존 정보가 없으면 UTC('Z')로 간주해 파싱한다.
function parseServerDate(iso) {
  if (!iso) return null
  // 이미 타임존(Z 또는 ±HH:MM offset)이 있으면 그대로, 없으면 UTC 로 간주.
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  const d = new Date(hasTz ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function timeAgo(iso) {
  const d = parseServerDate(iso)
  if (!d) return ''
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1)  return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24)  return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}일 전`
  return d.toLocaleDateString('ko-KR')
}

// 절대 시각(정확한 업로드 시간) — 뷰어 로컬 타임존(KST 등)으로 표시.
// 예: "2026년 7월 16일 오후 3:24"
export function formatDateTime(iso) {
  const d = parseServerDate(iso)
  if (!d) return ''
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
