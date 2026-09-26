import { describe, it, expect, vi, beforeEach } from 'vitest'
import { request } from './client'
import { decodeJwt } from '../auth/jwt'

// node 환경에서 브라우저 전역만 최소 스텁(jsdom 불필요)
const store = new Map()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k),
  })
  vi.stubGlobal('location', { pathname: '/assets', assign: vi.fn() })
})
const respond = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))

describe('request — ApiResponse{success,data,error} 언랩', () => {
  it('success → data', async () => {
    respond(200, JSON.stringify({ success: true, data: { id: 1 } }))
    expect(await request('/posts/1', { skipAuth: true })).toEqual({ id: 1 })
  })
  it('success:false → error.message 를 그대로 사용자에게', async () => {
    respond(400, JSON.stringify({ success: false, error: { code: 'F001', message: '허용되지 않은 확장자입니다.' } }))
    await expect(request('/posts', { skipAuth: true })).rejects.toThrow('허용되지 않은 확장자입니다.')
  })
  it('nginx 413(HTML) → 50MB 안내', async () => {
    respond(413, '<html>413 Request Entity Too Large</html>')
    await expect(request('/posts', { skipAuth: true })).rejects.toThrow('50MB')
  })
  it('401 → 토큰 삭제 + /login?expired=1', async () => {
    store.set('accessToken', 'x.eyJzdWIiOiIxIn0.y') // exp 없음 → 만료 아님
    respond(401, '')
    await expect(request('/users/me')).rejects.toThrow('세션이 만료')
    expect(store.has('accessToken')).toBe(false)
    expect(location.assign).toHaveBeenCalledWith('/login?expired=1')
  })
})

describe('decodeJwt', () => {
  it('base64url + 패딩 누락 + UTF-8 한글 클레임', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'a@b.c', nickname: '티오' })).toString('base64url')
    expect(decodeJwt(`h.${payload}.s`)).toEqual({ email: 'a@b.c', nickname: '티오' })
  })
  it('깨진 토큰 → null', () => {
    expect(decodeJwt('garbage')).toBeNull()
    expect(decodeJwt(null)).toBeNull()
  })
})
