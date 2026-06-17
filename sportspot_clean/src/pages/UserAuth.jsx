import { Logo } from '../components/Logo'
import { useState, useEffect } from 'react'
import { useSignIn, useSignUp, useAuth as useClerkAuth } from '@clerk/clerk-react'
import { useAuth } from '../hooks/useAuth'

export default function UserAuth() {
  const { isSignedIn } = useClerkAuth()
  const { refreshProfile, needsProfileCompletion, createProfile, clerkUser, api, profileError, signOut } = useAuth()
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn()
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp()
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '', fullName: '', phone: '', city: '' })
  const [pendingVerification, setPendingVerification] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [pendingSecondFactor, setPendingSecondFactor] = useState(false)
  const [secondFactorCode, setSecondFactorCode] = useState('')
  const [secondFactorStrategy, setSecondFactorStrategy] = useState('')
  const [secondFactorHint, setSecondFactorHint] = useState('')
  const [justVerified, setJustVerified] = useState(false)
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '', city: '' })
  const update = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError('') }
  const updateProfile = (k, v) => { setProfileForm(p => ({ ...p, [k]: v })); setError('') }

  // Pre-fill profile form from Clerk user data
  useEffect(() => {
    if (needsProfileCompletion && clerkUser) {
      setProfileForm(p => ({
        ...p,
        fullName: p.fullName || [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || '',
      }))
    }
  }, [needsProfileCompletion, clerkUser])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (mode === 'login') {
        if (!signInLoaded) return
        const result = await signIn.create({ identifier: form.email, password: form.password })
        if (result.status === 'complete') {
          await setSignInActive({ session: result.createdSessionId })
          // Don't set loading=false here — let Clerk's state propagation
          // trigger AuthProvider's useEffect which will fetch the profile
          // and then the RouteGuards will render the dashboard.
          // The refreshProfile call below is a best-effort attempt;
          // the AuthProvider useEffect is the reliable path.
          refreshProfile().catch(() => {})
          return // skip finally's setLoading(false)
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
      } else {
        if (!signUpLoaded) return
        if (!form.fullName || !form.phone || !form.city) throw new Error('Please fill in all fields')
        await signUp.create({
          emailAddress: form.email,
          password: form.password,
          firstName: form.fullName.split(' ')[0],
          lastName: form.fullName.split(' ').slice(1).join(' ') || '',
          unsafeMetadata: { role: 'user', phone: form.phone, city: form.city },
        })
        // Send email verification
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
        setPendingVerification(true)
      }
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
      await setSignInActive({ session: result.createdSessionId })
      setPendingSecondFactor(false)
      setSecondFactorCode('')
      await refreshProfile()
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: verificationCode })
      if (result.status === 'complete') {
        setJustVerified(true)
        await setSignUpActive({ session: result.createdSessionId })
        // Create profile via Express API
        try {
          await api.post('/profile', {
            email: form.email,
            full_name: form.fullName,
            phone: form.phone,
            city: form.city,
            role: 'user',
          })
        } catch (dbError) { console.error('Profile creation error:', dbError) }
        await refreshProfile()
      }
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    if (!signInLoaded) return
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/play',
      })
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Google sign-in failed')
    }
  }

  async function handleGoogleSignUp() {
    if (!signUpLoaded) return
    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/play',
        unsafeMetadata: { role: 'user' },
      })
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Google sign-up failed')
    }
  }

  return (
    <div className="auth-screen">
      {/* Background glow */}
      <div className="auth-bg" />

      {/* Desktop hero — hidden on mobile */}
      <div className="auth-hero">
        <Logo height={52} style={{ marginBottom: '1.5rem' }} />
        <div className="auth-hero-title">
          Book sports<br />
          <span style={{ color: 'var(--brand)' }}>venues</span> near<br />
          you.
        </div>
        <p className="auth-hero-sub">
          Turfs, courts, tracks, and more — hourly bookings, instant confirmation.
        </p>
        <div className="auth-hero-sports">
          {[['⚽','Football'],['🏏','Cricket'],['🏎️','Go-Kart'],['🎱','Pool']].map(([icon, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Auth card */}
      <div className="auth-card">
        {/* Mobile-only logo */}
        <Logo height={36} style={{ marginBottom: "1.25rem" }} />

        <div className="auth-portal-badge" style={{ color: 'var(--brand)', borderColor: 'var(--green-bg)', background: 'var(--green-bg)' }}>
          🏃 Player Portal
        </div>

        <h1 className="auth-title">
          {needsProfileCompletion ? 'Complete Your Profile' : pendingSecondFactor ? 'Verify Sign-In' : pendingVerification ? 'Verify Email' : mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="auth-subtitle">
          {needsProfileCompletion ? 'Just a few more details to get started' : pendingSecondFactor ? secondFactorHint : pendingVerification ? 'Enter the code sent to your email' : mode === 'login' ? 'Sign in to book your next game' : 'Start booking sports venues today'}
        </p>

        {/* Complete profile form for Google OAuth users without a profile */}
        {needsProfileCompletion ? (
          <form onSubmit={async (e) => {
            e.preventDefault()
            if (!profileForm.fullName || !profileForm.phone || !profileForm.city) { setError('Please fill in all fields'); return }
            setLoading(true); setError('')
            try {
              await createProfile({ fullName: profileForm.fullName, phone: profileForm.phone, city: profileForm.city, role: 'user' })
            } catch (err) { setError(err.message || 'Failed to create profile') }
            finally { setLoading(false) }
          }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" placeholder="Rahul Sharma" value={profileForm.fullName}
                onChange={e => updateProfile('fullName', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" placeholder="+91 98765 43210"
                inputMode="tel" value={profileForm.phone} onChange={e => updateProfile('phone', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-input" placeholder="New Delhi"
                value={profileForm.city} onChange={e => updateProfile('city', e.target.value)} required />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading && <span className="inline-spinner" style={{ borderTopColor: '#000' }} />}
              {loading ? 'Saving…' : 'Continue →'}
            </button>
          </form>
        ) : isSignedIn && !pendingVerification && !profileError ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <span className="inline-spinner" style={{ width: 28, height: 28, borderTopColor: 'var(--brand)' }} />
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginTop: '1rem' }}>Loading your profile…</p>
          </div>
        ) : isSignedIn && profileError ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div className="auth-error" style={{ marginBottom: '0.9rem' }}>{profileError}</div>
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              We could not load your account profile on this device.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button type="button" className="btn btn-primary btn-full" onClick={() => refreshProfile().catch(() => {})}>
                Retry
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => signOut().catch(() => {})}>
                Sign Out
              </button>
            </div>
          </div>
        ) : pendingSecondFactor ? (
          <form onSubmit={handleSecondFactor}>
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input className="form-input" placeholder="Enter verification code" value={secondFactorCode}
                onChange={e => setSecondFactorCode(e.target.value)} required />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading && <span className="inline-spinner" style={{ borderTopColor: '#000' }} />}
              {loading ? 'Verifying…' : 'Verify & Sign In →'}
            </button>
          </form>
        ) : pendingVerification ? (
          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input className="form-input" placeholder="Enter 6-digit code" value={verificationCode}
                onChange={e => setVerificationCode(e.target.value)} required />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading && <span className="inline-spinner" style={{ borderTopColor: '#000' }} />}
              {loading ? 'Verifying…' : 'Verify Email →'}
            </button>
          </form>
        ) : (
          <>
            {/* Google OAuth button */}
            <button type="button" className="btn btn-full btn-lg" onClick={mode === 'login' ? handleGoogleSignIn : handleGoogleSignUp}
              style={{ background: '#12121e', border: '1px solid rgba(255,255,255,0.1)', color: '#e0e0e0', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0 1rem' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            </div>

            <form onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" placeholder="Rahul Sharma" value={form.fullName}
                    onChange={e => update('fullName', e.target.value)} required />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" placeholder="you@example.com"
                  autoComplete="email" inputMode="email"
                  value={form.email} onChange={e => update('email', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={form.password} onChange={e => update('password', e.target.value)} required minLength={6} />
              </div>
              {mode === 'signup' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-input" type="tel" placeholder="+91 98765 43210"
                      inputMode="tel" value={form.phone} onChange={e => update('phone', e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input className="form-input" placeholder="New Delhi"
                      value={form.city} onChange={e => update('city', e.target.value)} required />
                  </div>
                </>
              )}

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                {loading && <span className="inline-spinner" style={{ borderTopColor: '#000' }} />}
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
              </button>
            </form>

            <div className="auth-switch">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button className="auth-switch-btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
                {mode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
