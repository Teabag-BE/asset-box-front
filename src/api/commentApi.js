import { request } from './client'

// 백엔드(team)에 맞춤. GET 응답 data 는 CommentListResponse({ comments: [...] }) 라서
// 배열만 넘겨주도록 언랩한다. (Mock 은 배열을 바로 줬음)
export const commentApi = {
  getComments:   (postId)            => request(`/posts/${postId}/comments`).then(res => res?.comments ?? res ?? []),
  createComment: (postId, body)      => request(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteComment: (postId, commentId) => request(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' }),
}

export const requestCommentApi = {
  getComments:   (requestId)            => request(`/requests/${requestId}/comments`).then(res => res?.comments ?? res ?? []),
  createComment: (requestId, body)      => request(`/requests/${requestId}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteComment: (requestId, commentId) => request(`/requests/${requestId}/comments/${commentId}`, { method: 'DELETE' }),
}
