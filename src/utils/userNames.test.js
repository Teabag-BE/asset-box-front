import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/userApi', () => ({ userApi: { getById: vi.fn() } }))

// userNames 는 모듈 전역 캐시(Map)를 쓰므로 테스트마다 모듈을 새로 로드한다
let mod, getById
beforeEach(async () => {
  vi.resetModules()
  ;({ userApi: { getById } } = await import('../api/userApi'))
  getById.mockReset()
  mod = await import('./userNames')
})

describe('displayName', () => {
  it('nickname > name > "유저 #id"', () => {
    expect(mod.displayName({ nickname: '티오', name: '김' }, 1)).toBe('티오')
    expect(mod.displayName({ nickname: '', name: '김' }, 1)).toBe('김')
    expect(mod.displayName(null, 7)).toBe('유저 #7')
  })
})

describe('resolveUserName', () => {
  it('같은 id(숫자/문자) 동시 요청은 한 번만 조회(인박스 대화 목록)', async () => {
    getById.mockResolvedValue({ nickname: '티오' })
    const names = await Promise.all([mod.resolveUserName(5), mod.resolveUserName('5'), mod.resolveUserName(5)])
    expect(names).toEqual(['티오', '티오', '티오'])
    expect(getById).toHaveBeenCalledTimes(1)
  })
  it('실패는 "유저 #id" 폴백이고 캐시하지 않아 다음에 재시도', async () => {
    getById.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({ nickname: '복구' })
    expect(await mod.resolveUserName(9)).toBe('유저 #9')
    expect(await mod.resolveUserName(9)).toBe('복구')
    expect(getById).toHaveBeenCalledTimes(2)
  })
  it('id 가 없으면 조회하지 않고 "유저"', async () => {
    expect(await mod.resolveUserName(null)).toBe('유저')
    expect(getById).not.toHaveBeenCalled()
  })
})

describe('resolveUserProfile', () => {
  it('실패 시 null, 캐시하지 않음', async () => {
    getById.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce({ id: 3 })
    expect(await mod.resolveUserProfile(3)).toBeNull()
    expect(await mod.resolveUserProfile(3)).toEqual({ id: 3 })
  })
})
