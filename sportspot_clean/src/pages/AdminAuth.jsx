import { Logo } from '../components/Logo'
import { useState } from 'react'
import { useSignIn, useAuth as useClerkAuth } from '@clerk/clerk-react'
import { useAuth } from '../hooks/useAuth'

export default function AdminAuth() {
  const { isSignedIn } = useClerkAuth()
  const { refreshProfile, profileError, signOut } = useAuth()
  const { signIn, setActive, isLoaded } = useSignIn()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingSecondFactor, setPendingSecondFactor] = useState(false)
  const [secondFactorCode, setSecondFactorCode] = useState('')
  const [secondFactorStrategy, setSecondFactorStrategy] = useState('')
  const [secondFactorHint, setSecondFactorHint] = useState('')
  const [form, setForm] = useState({ email: '', password: '' })
  const update = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isLoaded) return
    setLoading(true); setError('')
    try {
      const result = await signIn.create({ identifier: form.email, password: form.password })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        // Don't set loading=false — let Clerk state propagation handle it
        refreshProfile().catch(() => {})
        return
      }

      if (result.status === 'needs_client_trust' || result.status === 'needs_second_factor') {
        const factors = result.supportedSecondFactors || []
        const emailFactor = factors.find(f => f.strategy === 'email_code')
        const phoneFactor = factors.find(f => f.strategy === 'phone_code')
        const totpFactor = factors.find(f => f.strategy === 'totp')

        if (emailFactor) {
          await signIn.prepareSecondFactor({ strategy: 'email_code' })
          setSecondFactorStrategy('email_code')
          setSecondFactorHint('Enter the verification code sent to your email.')
          setPendingSecondFactor(true)
          return
        }

        if (phoneFactor) {
          const phoneNumberId = phoneFactor.phoneNumberId || phoneFactor.phone_number_id
          if (phoneNumberId) {
            await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId })
          } else {
            await signIn.prepareSecondFactor({ strategy: 'phone_code' })
          }
          setSecondFactorStrategy('phone_code')
          setSecondFactorHint('Enter the verification code sent to your phone.')
          setPendingSecondFactor(true)
          return
        }

        if (totpFactor) {
          setSecondFactorStrategy('totp')
          setSecondFactorHint('Enter the code from your authenticator app.')
          setPendingSecondFactor(true)
          return
        }

        throw new Error('Additional verification is required, but no second-factor method is available for this account.')
      }

      throw new Error(`Sign in requires an unsupported step: ${result.status}`)
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleSecondFactor(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const result = await signIn.attemptSecondFactor({ strategy: secondFactorStrategy, code: secondFactorCode })
      if (result.status !== 'complete') throw new Error('Verification not completed. Please try again.')
      await setActive({ session: result.createdSessionId })
      setPendingSecondFactor(false)
      setSecondFactorCode('')
      await refreshProfile()
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen" style={{ background: '#050508' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 40% at 50% 40%, rgba(255,184,48,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />

      <div className="auth-card" style={{ border: '1px solid rgba(255,184,48,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👑</div>
          <Logo height={40} style={{ margin: '0 auto 0.25rem' }} />
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: '1rem', fontWeight: 700, fontStyle: 'italic', background: 'linear-gradient(135deg, #FFB830 0%, #FFD980 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '0.08em' }}>
            ADMIN PORTAL
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Restricted Access
          </p>
        </div>

        {isSignedIn && !profileError ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <span className="inline-spinner" style={{ width: 28, height: 28, borderTopColor: '#FFB830' }} />
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginTop: '1rem' }}>Loading admin profile…</p>
          </div>
        ) : isSignedIn && profileError ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div className="auth-error" style={{ marginBottom: '0.9rem' }}>{profileError}</div>
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Admin profile could not be loaded on this device.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button type="button" className="btn btn-full" style={{ background: 'linear-gradient(135deg, #FFB830 0%, #FFD980 100%)', color: '#000', fontWeight: 700 }} onClick={() => refreshProfile().catch(() => {})}>
                Retry
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => signOut().catch(() => {})}>
                Sign Out
              </button>
            </div>
          </div>
        ) : pendingSecondFactor ? (
        <form onSubmit={handleSecondFactor}>
          <div style={{ marginBottom: '1rem', color: 'var(--text-3)', fontSize: '0.85rem' }}>{secondFactorHint}</div>
          <div className="form-group">
            <label className="form-label">Verification Code</label>
            <input className="form-input" placeholder="Enter verification code"
              value={secondFactorCode} onChange={e => setSecondFactorCode(e.target.value)} required />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-full btn-lg" disabled={loading}
            style={{ background: 'linear-gradient(135deg, #FFB830 0%, #FFD980 100%)', color: '#000', fontWeight: 700 }}>
            {loading && <span className="inline-spinner" style={{ borderTopColor: '#000' }} />}
            {loading ? 'Verifying…' : 'Verify & Continue →'}
          </button>
        </form>
        ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Admin Email</label>
            <input className="form-input" type="email" placeholder="admin@sportspot.com"
              autoComplete="email" inputMode="email"
              value={form.email} onChange={e => update('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••"
              autoComplete="current-password"
              value={form.password} onChange={e => update('password', e.target.value)} required />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-full btn-lg" disabled={loading}
            style={{ background: 'linear-gradient(135deg, #FFB830 0%, #FFD980 100%)', color: '#000', fontWeight: 700 }}>
            {loading && <span className="inline-spinner" style={{ borderTopColor: '#000' }} />}
            {loading ? 'Authenticating…' : 'Access Admin Panel →'}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
