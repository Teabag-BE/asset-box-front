const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

export async function request(path, options = {}) {
  const { skipAuth, ...fetchOptions } = options
  // 로그인/회원가입은 익명 전용 엔드포인트라 토큰을 붙이면 안 됨(붙으면 302/403)
  const token = skipAuth ? null : localStorage.getItem('accessToken')
  const res = await fetch(BASE_URL + path, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    // JSON이 아닌 응답(예: 302 → 로그인 HTML)일 때 Safari의 난해한 SyntaxError 대신 명확히
    throw new Error(`서버 응답을 해석할 수 없습니다 (HTTP ${res.status})`)
  }
  if (!json.success) throw new Error(json.error?.message ?? json.message ?? `요청 실패 (HTTP ${res.status})`)
  return json.data
}

export async function requestMultipart(path, formData) {
  const token = localStorage.getItem('accessToken')
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? json.message ?? '요청 실패')
  return json.data
}
