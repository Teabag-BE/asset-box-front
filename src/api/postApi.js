import { request, requestMultipart } from './client'

// 백엔드(team) /api/posts 에 맞춤
//  - 목록: Slice 기반 (items/page/size/hasNext)
//  - 생성: multipart (request=JSON 파트 + thumbnail/assetZip 파일 파트)
export const postApi = {
  getList: ({ page = 0, size = 20 } = {}) =>
    request(`/posts?page=${page}&size=${size}`),
  getDetail: (id) => request(`/posts/${id}`),
  create: ({ title, content, categoryId, tags, linkedRequestId, thumbnail, assetZip }) => {
    const fd = new FormData()
    // request 파트는 JSON 이라 Blob 으로 Content-Type 을 지정해줘야 @RequestPart 가 받음
    const payload = {
      title,
      content,
      categoryId: categoryId || null,
      tags: tags ?? [],
      linkedRequestId: linkedRequestId || null,
    }
    fd.append('request', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
    fd.append('thumbnail', thumbnail)
    fd.append('assetZip', assetZip)
    return requestMultipart('/posts', fd)
  },
  remove: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  // 좋아요 토글 → { likeCount, liked }
  toggleLike: (id) => request(`/posts/${id}/like`, { method: 'POST' }),
}
