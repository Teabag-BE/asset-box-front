// JWT payload 디코드 (검증 없이 클레임만 읽음 — 서버가 진짜 검증함)
// Safari의 atob는 base64url(-, _)과 padding 누락에 엄격해서 보정 필요.
export function decodeJwt(token) {
  try {
    if (!token || typeof token !== 'string') return null
    let b64 = token.split('.')[1]
    if (!b64) return null
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4) // padding 보정
    const bin = atob(b64)
    // UTF-8 안전 디코드
    const json = decodeURIComponent(
      Array.from(bin, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

// 토큰에서 현재 사용자 정보 추출 (백엔드 JWT에는 email, role만 담김)
export function userFromToken(token) {
  const claims = decodeJwt(token)
  if (!claims) return null
  if (claims.exp && claims.exp * 1000 < Date.now()) return null // 만료
  return { email: claims.email, role: claims.role }
}
