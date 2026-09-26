import { describe, it, expect, vi, beforeEach } from 'vitest'
import { request, requestMultipart } from './client'

// 오류 경로 규칙(#174):
//  - 401, 본문 없는 403 → 세션 만료(토큰 삭제 + 로그인 이동)
//  - 403 + ApiResponse 오류 본문 → 업무상 거부: 서버 메시지만, 세션 유지
//  - 302→/login 추종(운영 백엔드 Asset-Box#196) → refresh 1회, GET만 자동 재시도, 쓰기는 재전송 안 함
const store = new Map()
const TOKEN = 'x.eyJzdWIiOiIxIn0.y' // exp 없음 → 로컬 기준 만료 아님(ensureToken 통과), 단 '살아 있는 토큰'으로도 안 봄
const b64url = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
// 만료 1시간 전의 정상 JWT 모양 토큰
const LIVE = `h.${b64url({ email: 'ta@assetbox.cloud', exp: Math.floor(Date.now() / 1000) + 3600 })}.s`

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k),
  })
  vi.stubGlobal('location', { pathname: '/requests/1', assign: vi.fn() })
})

const json = (status, body) => ({
  status, ok: status >= 200 && status < 300, redirected: false, url: 'http://localhost:8080/api/x',
  text: async () => JSON.stringify(body),
  json: async () => body,
})
const toLogin = (status = 200) => ({
  status, ok: status >= 200 && status < 300, redirected: true, url: 'https://assetbox.cloud/login',
  text: async () => '<!doctype html><html>login</html>',
  json: async () => { throw new SyntaxError('Unexpected token <') },
})
// URL 별 응답 큐: /users/refresh 는 refreshRes, 그 외는 queue 에서 순서대로
function mockFetch(queue, refreshRes = json(401, { success: false })) {
  const fn = vi.fn(async (url) => (String(url).endsWith('/users/refresh') ? refreshRes : queue.shift()))
  vi.stubGlobal('fetch', fn)
  return fn
}
const apiCalls = (fn) => fn.mock.calls.filter(([u]) => !String(u).endsWith('/users/refresh')).length

describe('401 / 403 구분', () => {
  it('403 + ApiResponse 본문은 서버 메시지만 보여주고 로그아웃시키지 않는다', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([json(403, { success: false, error: { code: 'REQUEST_ASSIGN_FORBIDDEN', message: 'TA 전공 사용자만 요청글을 수락할 수 있습니다.' } })])
    await expect(request('/requests/1/assign', { method: 'PATCH' })).rejects.toThrow('TA 전공 사용자만')
    expect(store.get('accessToken')).toBe(TOKEN)
    expect(location.assign).not.toHaveBeenCalled()
  })
  it('본문 없는 403은 기존대로 세션 만료 처리', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([{ ...json(403, {}), text: async () => '' }])
    await expect(request('/admin')).rejects.toThrow('세션이 만료')
    expect(store.has('accessToken')).toBe(false)
    expect(location.assign).toHaveBeenCalledWith('/login?expired=1')
  })
  it('401은 ApiResponse 본문이 있어도 세션 만료(EXPIRED_TOKEN 등)', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([json(401, { success: false, error: { code: 'EXPIRED_TOKEN', message: '해당 토큰은 만료된 토큰입니다.' } })])
    await expect(request('/users/me')).rejects.toThrow('세션이 만료')
    expect(store.has('accessToken')).toBe(false)
  })
  it('requestMultipart 도 업무상 403은 메시지만', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([json(403, { success: false, error: { code: 'REQUEST_ASSIGNEE_MISMATCH', message: '해당 요청글의 담당자만 처리할 수 있습니다.' } })])
    await expect(requestMultipart('/posts', new FormData())).rejects.toThrow('담당자만')
    expect(store.get('accessToken')).toBe(TOKEN)
  })
})

describe('302 → /login 추종(HTML 200) 감지', () => {
  it('GET: refresh 성공 → 새 토큰으로 1회 재시도해 데이터 반환', async () => {
    store.set('accessToken', TOKEN)
    const fn = mockFetch(
      [toLogin(), json(200, { success: true, data: { id: 7 } })],
      json(200, { success: true, data: { accessToken: 'new.eyJzdWIiOiIxIn0.t' } }),
    )
    await expect(request('/users/me')).resolves.toEqual({ id: 7 })
    expect(apiCalls(fn)).toBe(2)
    expect(fn.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer new.eyJzdWIiOiIxIn0.t')
  })
  it('GET: 새 토큰으로도 또 302면 서버 오류로 보고 로그아웃시키지 않는다', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([toLogin(), toLogin()], json(200, { success: true, data: { accessToken: 'new.eyJzdWIiOiIxIn0.t' } }))
    await expect(request('/posts')).rejects.toThrow('서버가 요청을 처리하지 못했어요')
    expect(store.has('accessToken')).toBe(true)
    expect(location.assign).not.toHaveBeenCalled()
  })
  it('refresh 도 실패 + 토큰이 만료 전이면 서버 장애로 보고 로그아웃시키지 않는다(DB 장애 때 전원 로그아웃 방지)', async () => {
    store.set('accessToken', LIVE)
    mockFetch([toLogin()], toLogin())   // 원 요청·갱신 요청 둘 다 302 — 운영 DB 장애 모양
    await expect(request('/posts')).rejects.toThrow('서버가 요청을 처리하지 못했어요')
    expect(store.get('accessToken')).toBe(LIVE)
    expect(location.assign).not.toHaveBeenCalled()
  })
  it('refresh 실패 + 만료 정보가 없는(깨진) 토큰이면 세션 만료 → 로그인으로', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([toLogin()])
    await expect(request('/posts')).rejects.toThrow('세션이 만료')
    expect(location.assign).toHaveBeenCalledWith('/login?expired=1')
  })
  it('쓰기 요청(POST)은 refresh 뒤에도 자동 재전송하지 않는다(중복 생성 방지)', async () => {
    store.set('accessToken', TOKEN)
    const fn = mockFetch([toLogin(), json(200, { success: true, data: 'dup' })], json(200, { success: true, data: { accessToken: 'n.eyJ9.t' } }))
    await expect(request('/posts/1/comments', { method: 'POST', body: '{}' })).rejects.toThrow('다시 시도해 주세요')
    expect(apiCalls(fn)).toBe(1)
  })
  it('okOnNonJson 이어도 /login HTML 은 성공으로 보지 않는다(수정이 "저장됨"으로 보이던 문제)', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([toLogin(405)], json(401, { success: false }))
    await expect(request('/posts/1', { method: 'PUT', body: '{}', okOnNonJson: true })).rejects.toThrow('세션이 만료')
  })
  it('토큰 없이 보호 API가 302면 "로그인이 필요해요"(HTML 200 해석 불가 대신)', async () => {
    mockFetch([toLogin()])
    await expect(request('/users/me')).rejects.toThrow('로그인이 필요해요')
    expect(location.assign).not.toHaveBeenCalled()
  })
  it('리다이렉트가 아닌 2xx 비JSON + okOnNonJson 은 기존대로 성공', async () => {
    store.set('accessToken', TOKEN)
    mockFetch([{ ...json(200, {}), text: async () => 'not json' }])
    await expect(request('/posts/1', { method: 'PUT', body: '{}', okOnNonJson: true })).resolves.toBeNull()
  })
})
