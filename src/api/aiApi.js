import { request, BASE_URL } from './client'

// AI 태그·카테고리 추천 API.
// 백엔드가 아직 배포 전이거나(엔드포인트 없음) 서버에 OPENAI 키가 없으면 기능을 조용히 감춘다.
export const aiApi = {
  // 사용 가능 여부만 확인하는 프로브. 공유 request() 를 쓰지 않는 이유:
  // 엔드포인트 미배포 시 백엔드 denyAll 이 403 을 주는데, request() 는 403 에서
  // 로그아웃+로그인 리다이렉트를 유발한다. 프로브는 어떤 응답에도 부수효과가 없어야 하므로
  // 토큰만 실어 직접 fetch 하고, 2xx 가 아니면 조용히 비활성으로 간주한다.
  status: async () => {
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(BASE_URL + '/ai/status', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return { enabled: false }
      const json = await res.json().catch(() => ({}))
      return { enabled: !!json?.data?.enabled }
    } catch {
      return { enabled: false }
    }
  },

  // { title, filenames:[], thumbnailBase64? } → { tags:[], categoryId, categoryPath }
  suggest: ({ title, filenames, thumbnailBase64 }) =>
    request('/ai/suggest', {
      method: 'POST',
      body: JSON.stringify({ title, filenames, thumbnailBase64 }),
    }),
}
