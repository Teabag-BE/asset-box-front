/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { authApi } from '../api/authApi'
import { userApi } from '../api/userApi'
import { decodeJwt } from './jwt'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // 토큰이 있으면 복원 시도(로딩), 없으면 바로 로딩 종료 — 초기값으로 결정해 effect 내 동기 setState 회피
  const [isLoading, setIsLoading] = useState(() => !!localStorage.getItem('accessToken'))

  // 새로고침 시 토큰으로 사용자 복원 (/users/me 호출 → id/nickname/role 등)
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) return
    let active = true
    userApi.me()
      .then(u => active && setUser(u))
      // 진짜 인증 실패(401·만료·갱신 불가)는 client.js 가 이미 토큰을 지우고 로그인으로 보낸다.
      // 여기서 또 지우면 배포 재시작 502 같은 일시 오류에도 로그아웃되고, 다른 탭까지 따라 로그아웃된다.
      .catch(() => {})
      .finally(() => active && setIsLoading(false))
    return () => { active = false }
  }, [])

  // 다른 탭에서 로그아웃하거나 다른 계정으로 로그인하면 이 탭도 따라간다.
  // (안 그러면 이 탭은 이전 사용자 화면인데 요청은 새 토큰으로 나가 남의 프로필을 덮어쓸 수 있다)
  // storage 이벤트는 값을 바꾼 탭이 아닌 다른 탭에서만 발생한다.
  //  - 같은 계정의 토큰 갱신(refresh)은 무시한다 — 반응하면 탭끼리 갱신·조회가 핑퐁할 수 있다.
  //  - 다른 탭의 login() 은 옛 토큰을 지운 직후 새 토큰을 쓰므로, 잠깐 기다렸다 최종 상태로 판단한다.
  const userRef = useRef(null)
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => {
    let timer = null
    function onStorage(e) {
      if (e.key !== 'accessToken') return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const token = localStorage.getItem('accessToken')
        if (!token) { setUser(null); return }
        const current = userRef.current
        if (current?.email && decodeJwt(token)?.email === current.email) return
        userApi.me().then(setUser).catch(() => {})
      }, 800)
    }
    window.addEventListener('storage', onStorage)
    return () => { clearTimeout(timer); window.removeEventListener('storage', onStorage) }
  }, [])

  async function login({ email, password }) {
    // 옛/무효 토큰이 Authorization으로 끼면 백엔드가 302/403 → 로그인 전 제거
    localStorage.removeItem('accessToken')
    const data = await authApi.login({ email, password })
    localStorage.setItem('accessToken', data.accessToken)
    const me = await userApi.me()
    setUser(me)
  }

  async function signup(body) {
    await authApi.signup(body)
  }

  function logout() {
    localStorage.removeItem('accessToken')
    setUser(null)
  }

  // 프로필/아바타 변경 후 사용자 정보 재조회
  async function refresh() {
    const me = await userApi.me()
    setUser(me)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, signup, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
