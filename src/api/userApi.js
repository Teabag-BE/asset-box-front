import { request, requestMultipart } from './client'

export const userApi = {
  // 현재 토큰의 사용자 정보 (id, nickname, role, avatarUrl 등)
  me: () => request('/users/me'),
  // 특정 유저 프로필
  getById: (id) => request(`/users/${id}`),
  // 내 아바타 업로드 (텍스트 정보 수정 API는 아직 없음 → 닉네임/소개 수정은 보류)
  uploadAvatar: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return requestMultipart('/users/me/avatar', fd)
  },
}
