import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Spinner from '../components/Spinner'

export default function ProtectedRoute({ children, roles }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex justify-center items-center h-screen"><Spinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (roles?.length && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}
