import { request, requestMultipart } from './client'

// 백엔드(team) 현행:
//  - 생성: POST /requests (multipart: request JSON + thumbnail? + references?[]) — requesterId는 토큰
//  - 목록(pageable), 단건, 삭제, 수락(assign)
export const requestApi = {
  getList: ({ page = 0, size = 50 } = {}) =>
    request(`/requests?page=${page}&size=${size}`),
  getDetail: (id) => request(`/requests/${id}`),
  create: ({ thumbnail, references, ...body }) => {
    const fd = new FormData()
    fd.append('request', new Blob([JSON.stringify(body)], { type: 'application/json' }))
    if (thumbnail) fd.append('thumbnail', thumbnail)
    ;(references ?? []).forEach(f => fd.append('references', f))
    return requestMultipart('/requests', fd)
  },
  remove: (id) => request(`/requests/${id}`, { method: 'DELETE' }),
  assign: (id) => request(`/requests/${id}/assign`, { method: 'PATCH' }),
}
