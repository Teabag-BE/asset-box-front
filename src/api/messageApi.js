import { request } from './client'

export const messageApi = {
  // 대화방 목록 (상대별 최신 메시지 + 안 읽은 수)
  getInbox:        ()          => request('/messages/inbox'),

  // 특정 상대와의 대화 (백엔드는 최신순 DESC로 반환)
  getConversation: (partnerId) => request(`/messages/conversation/${partnerId}`),

  // 메시지 전송 — 보내는 사람은 토큰에서 결정, 받는 사람만 지정
  send:            (toUserId, content) => request('/messages', {
    method: 'POST',
    body: JSON.stringify({ toUserId, content }),
  }),

  // 대화 읽음 처리 (상대가 보낸 안 읽은 메시지)
  markRead:        (partnerId) => request(`/messages/conversation/${partnerId}/read`, {
    method: 'PATCH',
  }),

  // 안 읽은 메시지 총 개수 (폴링)
  getUnread:       ()          => request('/messages/unread'),
}
