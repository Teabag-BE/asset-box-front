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

// 프로필 전체(닉네임·전공·아바타 등)가 필요한 곳용 — UserChip 등. 이름 캐시와 별도로 캐시.
const profileCache = new Map() // id -> Promise<profile|null>

export function resolveUserProfile(id) {
  if (id == null) return Promise.resolve(null)
  const key = String(id)
  if (!profileCache.has(key)) {
    profileCache.set(
      key,
      userApi.getById(id).catch(() => {
        profileCache.delete(key) // 실패는 캐시하지 않음
        return null
      }),
    )
  }
  return profileCache.get(key)
}
