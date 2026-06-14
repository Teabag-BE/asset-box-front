/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../api/authApi'
import { userApi } from '../api/userApi'

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
      .catch(() => localStorage.removeItem('accessToken'))
      .finally(() => active && setIsLoading(false))
    return () => { active = false }
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
