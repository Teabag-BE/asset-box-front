import { userApi } from '../api/userApi'

// 메시지 등에서 상대가 "유저 #번호"로만 보이지 않도록, id로 프로필을 받아 표시 이름을 만든다.
// 같은 id 중복 조회를 막기 위해 Promise 를 캐시한다.
const cache = new Map() // id -> Promise<string>

export function displayName(profile, id) {
  return profile?.nickname || profile?.name || `유저 #${id}`
}

export function resolveUserName(id) {
  if (id == null) return Promise.resolve('유저')
  const key = String(id)
  if (!cache.has(key)) {
    cache.set(
      key,
      userApi.getById(id)
        .then(p => displayName(p, id))
        .catch(() => {
          cache.delete(key) // 실패는 캐시하지 않아 다음에 재시도
          return `유저 #${id}`
        }),
    )
  }
  return cache.get(key)
}
