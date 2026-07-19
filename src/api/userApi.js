import { request, requestMultipart } from './client'

export const userApi = {
  // 현재 토큰의 사용자 정보 (id, nickname, role, avatarUrl 등)
  me: () => request('/users/me'),
  // 특정 유저 프로필
  getById: (id) => request(`/users/${id}`),
  // 닉네임으로 유저 검색 — 백엔드 GET /users/directory (dev에 구현됨, 릴리스 전이면 실패 → 호출부에서 안내).
  // 응답: { items: [{ id, name, nickname, imageUrl, postCount, totalLikes }], ... } → items 로 언랩.
  search: (query) =>
    request(`/users/directory?q=${encodeURIComponent(query)}&size=20`)
      .then(res => (res?.items ?? []).map(u => ({ ...u, avatarUrl: u.imageUrl ?? u.avatarUrl }))),
  // 내 프로필 수정 (닉네임/소개/전공/공개이메일) — 백엔드 PUT /users/me
  updateMe: ({ nickname, description, major, publicEmail }) =>
    request('/users/me', {
      method: 'PUT',
      body: JSON.stringify({ nickname, description, major, publicEmail }),
    }),
  // 내 아바타 업로드
  uploadAvatar: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return requestMultipart('/users/me/avatar', fd)
  },
}
