import { request, requestMultipart } from './client'

export const userApi = {
  // 현재 토큰의 사용자 정보 (id, nickname, role, avatarUrl 등)
  me: () => request('/users/me'),
  // 특정 유저 프로필
  getById: (id) => request(`/users/${id}`),
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
