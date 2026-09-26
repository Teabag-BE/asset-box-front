import { lazy } from 'react'

// 라우트 단위 코드 스플리팅.
// 홈·로그인·회원가입은 첫 진입 화면이라 App.jsx 에서 정적 import 로 남기고(첫 화면 워터폴 방지),
// 나머지 페이지는 방문할 때 청크를 받는다.
// 로더를 한곳에 모아 두는 이유: lazy() 와 유휴 시간 프리페치가 같은 import() 를 공유해야
// 브라우저가 같은 청크를 한 번만 받는다.
const loaders = {
  InboxPage:         () => import('./InboxPage'),
  ConversationPage:  () => import('./ConversationPage'),
  RequestBoardPage:  () => import('./RequestBoardPage'),
  RequestDetailPage: () => import('./RequestDetailPage'),
  CreateRequestPage: () => import('./CreateRequestPage'),
  AssetBoardPage:    () => import('./AssetBoardPage'),
  AssetDetailPage:   () => import('./AssetDetailPage'),
  CreateAssetPage:   () => import('./CreateAssetPage'),
  EditAssetPage:     () => import('./EditAssetPage'),
  ProfilePage:       () => import('./ProfilePage'),
  PortfolioPage:     () => import('./PortfolioPage'),
  DirectoryPage:     () => import('./DirectoryPage'),
  HallOfFamePage:    () => import('./HallOfFamePage'),
  SearchResultsPage: () => import('./SearchResultsPage'),
  GamesPage:         () => import('./GamesPage'),
  UpdatesPage:       () => import('./UpdatesPage'),
}

export const InboxPage         = lazy(loaders.InboxPage)
export const ConversationPage  = lazy(loaders.ConversationPage)
export const RequestBoardPage  = lazy(loaders.RequestBoardPage)
export const RequestDetailPage = lazy(loaders.RequestDetailPage)
export const CreateRequestPage = lazy(loaders.CreateRequestPage)
export const AssetBoardPage    = lazy(loaders.AssetBoardPage)
export const AssetDetailPage   = lazy(loaders.AssetDetailPage)
export const CreateAssetPage   = lazy(loaders.CreateAssetPage)
export const EditAssetPage     = lazy(loaders.EditAssetPage)
export const ProfilePage       = lazy(loaders.ProfilePage)
export const PortfolioPage     = lazy(loaders.PortfolioPage)
export const DirectoryPage     = lazy(loaders.DirectoryPage)
export const HallOfFamePage    = lazy(loaders.HallOfFamePage)
export const SearchResultsPage = lazy(loaders.SearchResultsPage)
export const GamesPage         = lazy(loaders.GamesPage)
export const UpdatesPage       = lazy(loaders.UpdatesPage)

// 로그인 직후 유휴 시간에 페이지 청크(수 KB씩)를 미리 받아 둔다.
// BrowserRouter 는 내비게이션을 startTransition 으로 감싸므로, 청크가 아직 없으면
// 링크를 눌러도 이전 화면이 그대로 멈춰 보인다 — 프리페치로 그 공백을 없앤다.
// three.js 뷰어 청크는 여기서 받지 않는다(상세/등록 페이지 안의 lazy 가 필요할 때만 받음).
let prefetched = false
export function prefetchPages() {
  if (prefetched) return
  prefetched = true
  const run = () => {
    for (const load of Object.values(loaders)) {
      // 실패는 여기서 삼킨다 — 실제 방문 때 lazy 의 import 도 실패하면 RouteBoundary 가
      // (배포로 옛 해시 청크가 사라진 경우) 새로고침으로 복구한다.
      load().catch(() => {})
    }
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 1500)
  }
}
