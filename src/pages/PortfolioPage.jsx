import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { userApi } from '../api/userApi'
import { useAuth } from '../auth/AuthContext'
import PortfolioView from '../features/post/PortfolioView'
import Spinner from '../components/Spinner'

export default function PortfolioPage() {
  const { userId } = useParams()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    userApi.getById(userId)
      .then(p => active && setProfile(p))
      .catch(e => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [userId])

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-7 h-7" /></div>
  if (error) return <p className="text-center text-crimson-600 py-20 text-sm">{error}</p>
  if (!profile) return null

  const isMe = user && String(user.id) === String(profile.id)

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Link to="/directory" className="text-sm text-slate-400 hover:text-slate-600">← 크리에이터 디렉토리</Link>
      </div>
      <PortfolioView profile={profile} isMe={isMe} />
    </>
  )
}
