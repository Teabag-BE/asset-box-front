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

  return (
    <div>
      <PortfolioView profile={user} isMe onAvatarChange={onAvatarChange} />
      <div className="max-w-5xl mx-auto px-4 -mt-2 pb-8 flex items-center gap-3">
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
        <Button variant="secondary" size="sm" className="ml-auto"
          onClick={() => { logout(); navigate('/login') }}>로그아웃</Button>
      </div>
    </div>
  )
}
