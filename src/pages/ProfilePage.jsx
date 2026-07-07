import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { userApi } from '../api/userApi'
import PortfolioView from '../features/post/PortfolioView'
import Button from '../components/Button'

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('')
  if (!user) return null

  async function onAvatarChange(file) {
    setMsg('')
    try {
      await userApi.uploadAvatar(file)
      await refresh?.()           // 컨텍스트 갱신(있으면)
      setMsg('아바타가 변경되었습니다. 새로고침 시 반영돼요.')
    } catch (e) {
      setMsg(e.message)
    }
  }

  async function onSaveProfile(data) {
    setMsg('')
    try {
      await userApi.updateMe(data)
      await refresh?.()           // 갱신된 프로필을 컨텍스트에 반영
      setMsg('프로필이 저장되었습니다.')
    } catch (e) {
      setMsg(e.message)
      throw e                     // 실패 시 PortfolioView가 편집 모드 유지하도록 재던짐
    }
  }

  return (
    <div>
      <PortfolioView profile={user} isMe onAvatarChange={onAvatarChange} onSaveProfile={onSaveProfile} />
      <div className="max-w-5xl mx-auto px-4 -mt-2 pb-8 flex items-center gap-3">
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
        <Button variant="secondary" size="sm" className="ml-auto"
          onClick={() => { logout(); navigate('/login') }}>로그아웃</Button>
      </div>
    </div>
  )
}
