import { decodeJwt } from '../auth/jwt'

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

// 토큰 만료 여부 (30초 여유). 만료된 토큰을 그대로 보내면 백엔드 JwtFilter가
// 예외를 던져 302 → /login → CORS("load fail")로 둔갑한다. 그래서 보내기 전에 거른다.
function isExpired(token) {
  const claims = decodeJwt(token)
  if (!claims?.exp) return false
  return claims.exp * 1000 < Date.now() + 30_000
}

// 만료/인증 실패 시 처리: refresh 1회 시도 → 실패하면 토큰 비우고 로그인으로.
// (http localhost에선 refresh 쿠키가 Secure라 저장 안 돼 보통 실패 → 로그인 유도)
let refreshing = null
async function tryRefresh() {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const res = await fetch(BASE_URL + '/users/refresh', {
        method: 'POST',
        credentials: 'include', // RT 쿠키 전송
      })
      const json = await res.json().catch(() => ({}))
      const next = json?.data?.accessToken
      if (next) {
        localStorage.setItem('accessToken', next)
        return next
      }
    } catch {
      /* noop */
    }
    return null
  })()
  const result = await refreshing
  refreshing = null
  return result
}

function redirectToLogin() {
  localStorage.removeItem('accessToken')
  if (!location.pathname.startsWith('/login')) {
    location.assign('/login?expired=1')
  }
}

function nonJsonError(status) {
  if (status === 413) return new Error('파일 크기가 너무 큽니다. 50MB 이하 파일로 다시 시도해주세요.')
  return new Error(`서버 응답을 해석할 수 없습니다 (HTTP ${status})`)
}

// 인증이 필요한 요청 전에 토큰이 살아있도록 보장. null이면 호출자가 중단해야 함.
async function ensureToken() {
  let token = localStorage.getItem('accessToken')
  if (token && isExpired(token)) {
    token = await tryRefresh()
    if (!token) { redirectToLogin(); return null }
  }
  return token
}

export async function request(path, options = {}) {
  const { skipAuth, ...fetchOptions } = options
  // 로그인/회원가입은 익명 전용 엔드포인트라 토큰을 붙이면 안 됨(붙으면 302/403)
  const token = skipAuth ? null : await ensureToken()
  if (!skipAuth && localStorage.getItem('accessToken') && !token) {
    // 만료됐고 갱신도 실패 → redirectToLogin이 이미 처리. 요청 중단.
    throw new Error('세션이 만료되어 다시 로그인해야 합니다.')
  }
  const res = await fetch(BASE_URL + path, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  })
  if (!skipAuth && (res.status === 401 || res.status === 403)) {
    redirectToLogin()
    throw new Error('세션이 만료되어 다시 로그인해야 합니다.')
  }
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw nonJsonError(res.status)
  }
  if (!json.success) throw new Error(json.error?.message ?? json.message ?? `요청 실패 (HTTP ${res.status})`)
  return json.data
}

export async function requestMultipart(path, formData) {
  const token = await ensureToken()
  if (localStorage.getItem('accessToken') && !token) {
    throw new Error('세션이 만료되어 다시 로그인해야 합니다.')
  }
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (res.status === 401 || res.status === 403) {
    redirectToLogin()
    throw new Error('세션이 만료되어 다시 로그인해야 합니다.')
  }
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw nonJsonError(res.status)
  }
  if (!json.success) throw new Error(json.error?.message ?? json.message ?? '요청 실패')
  return json.data
}
