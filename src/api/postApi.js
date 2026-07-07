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
  // 게시글 메타데이터 수정 (제목/설명/카테고리/태그) — 백엔드 PUT /posts/{id}
  update: (id, { title, content, categoryId, tags }) =>
    request(`/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, content, categoryId, tags: tags ?? [] }),
    }),
}
