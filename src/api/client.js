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

const SESSION_EXPIRED = '세션이 만료되어 다시 로그인해야 합니다.'
const SERVER_UNHANDLED = '서버가 요청을 처리하지 못했어요. 잠시 후 다시 시도하고, 반복되면 알려주세요.'

// 운영 백엔드는 인증 실패와 처리되지 않은 서버 오류를 모두 302 → /login 으로 보낸다
// (/error 디스패치가 denyAll 에 걸림 — Asset-Box#196). fetch 는 이를 자동으로 따라가
// /login 의 index.html(200 text/html)을 받으므로, 상태코드가 아니라 최종 URL 로 감지해야 한다.
function redirectedToLogin(res) {
  if (!res.redirected || !res.url) return false
  try { return new URL(res.url).pathname.startsWith('/login') } catch { return false }
}

// request/requestMultipart 공통 응답 처리. { retry: true } 면 호출부가 새 토큰으로 1회 재시도한다.
async function handleResponse(res, { skipAuth, okOnNonJson, hadToken, retried, idempotent }) {
  if (redirectedToLogin(res)) {
    if (skipAuth || !hadToken) throw new Error(skipAuth ? SERVER_UNHANDLED : '로그인이 필요해요.')
    if (!retried) {
      // 로컬 exp 판단과 달리 서버가 토큰을 거부했을 수 있다 → 갱신해 본다. 갱신마저 실패하면 진짜 세션 만료.
      if (!(await tryRefresh())) { redirectToLogin(); throw new Error(SESSION_EXPIRED) }
      // 쓰기 요청은 서버 오류로 일부 처리됐을 수 있어 자동 재전송하지 않는다.
      if (idempotent) return { retry: true }
      throw new Error('요청을 처리하지 못했어요. 다시 시도해 주세요.')
    }
    // 새 토큰으로도 같으면 인증이 아니라 서버가 처리하지 못한 오류 — 로그아웃시키지 않는다.
    throw new Error(SERVER_UNHANDLED)
  }

  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = null }

  if (!skipAuth && (res.status === 401 || res.status === 403)) {
    // 403 + ApiResponse 오류 본문 = 업무상 권한 거부(예: TA 전공만 요청 수락 가능) → 메시지만 보여주고 세션은 유지.
    // 401(토큰 만료·위조)과 본문 없는 403 은 세션 문제로 보고 로그인으로 보낸다.
    if (res.status === 403 && json?.success === false && json.error?.message) {
      throw new Error(json.error.message)
    }
    redirectToLogin()
    throw new Error(SESSION_EXPIRED)
  }

  if (json === null) {
    if (okOnNonJson && res.ok) return { data: null }   // 2xx + 비JSON → 성공으로 간주
    throw nonJsonError(res.status)
  }
  if (!json.success) {
    if (okOnNonJson && res.ok) return { data: json.data ?? null }   // 2xx면 래핑이 달라도 성공
    throw new Error(json.error?.message ?? json.message ?? `요청 실패 (HTTP ${res.status})`)
  }
  return { data: json.data }
}

export async function request(path, options = {}) {
  // okOnNonJson: 2xx인데 본문이 JSON이 아니거나 ApiResponse 래핑이 아니어도 성공으로 처리한다.
  // (백엔드가 엔티티를 직접 반환해 직렬화가 깨지는 등으로 200+비JSON 이 오는, 응답 데이터가
  //  필요 없는 호출용 — 예: 게시글 수정. 백엔드가 DTO 로 고쳐지면 자연히 정상 경로를 탄다.)
  // 단 302→/login 추종으로 받은 HTML 은 성공으로 보지 않는다(handleResponse 가 먼저 거른다).
  const { skipAuth, okOnNonJson, ...fetchOptions } = options
  const idempotent = (fetchOptions.method ?? 'GET').toUpperCase() === 'GET'
  for (let attempt = 0; ; attempt++) {
    // 로그인/회원가입은 익명 전용 엔드포인트라 토큰을 붙이면 안 됨(붙으면 302/403)
    const token = skipAuth ? null : await ensureToken()
    if (!skipAuth && localStorage.getItem('accessToken') && !token) {
      // 만료됐고 갱신도 실패 → redirectToLogin이 이미 처리. 요청 중단.
      throw new Error(SESSION_EXPIRED)
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
    const out = await handleResponse(res, { skipAuth, okOnNonJson, hadToken: !!token, retried: attempt > 0, idempotent })
    if (!out.retry) return out.data
  }
}

export async function requestMultipart(path, formData, { method = 'POST' } = {}) {
  for (let attempt = 0; ; attempt++) {
    const token = await ensureToken()
    if (localStorage.getItem('accessToken') && !token) {
      throw new Error(SESSION_EXPIRED)
    }
    const res = await fetch(BASE_URL + path, {
      method,
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    const out = await handleResponse(res, { hadToken: !!token, retried: attempt > 0, idempotent: false })
    if (!out.retry) return out.data
  }
}
