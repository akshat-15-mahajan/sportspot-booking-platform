import { useAuth } from '../hooks/useAuth'
import { LoadingOverlay } from '../components/UI'

// Requires any authenticated user
export function RequireAuth({ children, fallback }) {
  const { session, loading } = useAuth()
  if (loading) return <LoadingOverlay />
  if (!session) return fallback
  return children
}

// Requires a specific role
export function RequireRole({ role, children, fallback }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <LoadingOverlay />
  if (!session || !profile) return fallback
  if (profile.role !== role) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', background: 'var(--bg)' }}>
      <div style={{ fontSize: '3rem' }}>🚫</div>
      <div style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>Access Denied</div>
      <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>This portal requires <strong style={{ color: 'var(--text-2)' }}>{role}</strong> access. You are signed in as <strong style={{ color: 'var(--text-2)' }}>{profile.role}</strong>.</p>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        <a href="/play" style={{ textDecoration: 'none' }} className="btn btn-secondary">Player Portal</a>
        <a href="/venue" style={{ textDecoration: 'none' }} className="btn btn-secondary">Venue Portal</a>
        <a href="/admin" style={{ textDecoration: 'none' }} className="btn btn-secondary">Admin Portal</a>
      </div>
    </div>
  )
  return children
}
