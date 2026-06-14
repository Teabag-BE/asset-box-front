import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Layout from './components/Layout'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import InboxPage from './pages/InboxPage'
import ConversationPage from './pages/ConversationPage'
import RequestBoardPage from './pages/RequestBoardPage'
import RequestDetailPage from './pages/RequestDetailPage'
import CreateRequestPage from './pages/CreateRequestPage'
import AssetBoardPage from './pages/AssetBoardPage'
import AssetDetailPage from './pages/AssetDetailPage'
import CreateAssetPage from './pages/CreateAssetPage'
import ProfilePage from './pages/ProfilePage'
import PortfolioPage from './pages/PortfolioPage'
import DirectoryPage from './pages/DirectoryPage'
import SearchResultsPage from './pages/SearchResultsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/"       element={<HomePage />} />
            <Route path="/login"  element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />

            {/* 요청 게시판 (백엔드 GET이 인증 필요) */}
            <Route path="/requests"     element={<ProtectedRoute><RequestBoardPage /></ProtectedRoute>} />
            <Route path="/requests/new" element={<ProtectedRoute><CreateRequestPage /></ProtectedRoute>} />
            <Route path="/requests/:id" element={<ProtectedRoute><RequestDetailPage /></ProtectedRoute>} />

            {/* 에셋 게시판 */}
            <Route path="/assets"     element={<ProtectedRoute><AssetBoardPage /></ProtectedRoute>} />
            <Route path="/assets/new" element={<ProtectedRoute><CreateAssetPage /></ProtectedRoute>} />
            <Route path="/assets/:id" element={<ProtectedRoute><AssetDetailPage /></ProtectedRoute>} />

            {/* 메시지 */}
            <Route path="/inbox"               element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
            <Route path="/messages/:partnerId" element={<ProtectedRoute><ConversationPage /></ProtectedRoute>} />

            {/* TA 디렉토리 / 검색 */}
            <Route path="/directory" element={<ProtectedRoute><DirectoryPage /></ProtectedRoute>} />
            <Route path="/search"    element={<ProtectedRoute><SearchResultsPage /></ProtectedRoute>} />

            {/* 프로필 / 포트폴리오 */}
            <Route path="/profile"            element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/portfolio/:userId"  element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
