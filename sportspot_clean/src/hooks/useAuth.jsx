import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useUser, useClerk, useAuth as useClerkAuth } from '@clerk/clerk-react'
import { createApi } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { user, isLoaded: clerkLoaded } = useUser()
  const { signOut: clerkSignOut } = useClerk()
  const { isSignedIn, getToken } = useClerkAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false)
  const [profileError, setProfileError] = useState('')
  const fetchProfileInFlightRef = useRef(null)

  const getTokenRef = useRef(getToken)
  const userRef = useRef(user)

  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  useEffect(() => {
    userRef.current = user
  }, [user])

  // Keep API client stable; token resolver reads latest Clerk function from ref.
  const api = useMemo(() => createApi(() => getTokenRef.current?.()), [])

  const fetchProfile = useCallback(async () => {
    if (fetchProfileInFlightRef.current) {
      return fetchProfileInFlightRef.current
    }

    const run = (async () => {
    try {
      const data = await api.get('/profile')

      if (data) {
        setProfile(data)
        setNeedsProfileCompletion(false)
        setProfileError('')
      } else {
        // Profile doesn't exist yet — check if we have enough data to auto-create
        const clerkUser = userRef.current
        const meta = clerkUser?.unsafeMetadata || {}

        if (meta.phone) {
          // Has required fields (came from normal email signup fallback) — auto-create
          const created = await api.post('/profile', {
            email: clerkUser?.primaryEmailAddress?.emailAddress || '',
            full_name: [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || '',
            phone: meta.phone || '',
            city: meta.city || '',
            role: meta.role || 'user',
          })
          setProfile(created)
          setProfileError('')
        } else {
          // Missing required fields (e.g. Google OAuth without signup form)
          setProfile(null)
          setNeedsProfileCompletion(true)
          setProfileError('')
        }
      }
    } catch (err) {
      console.error('Profile fetch error:', err)
      setProfile(null)
      setProfileError(err?.message || 'Failed to load profile')
    } finally {
      setLoading(false)
      fetchProfileInFlightRef.current = null
    }
    })()

    fetchProfileInFlightRef.current = run
    return run
  }, [api])

  useEffect(() => {
    if (!clerkLoaded) return
    if (isSignedIn && user?.id) {
      setLoading(true)
      fetchProfile()
    } else {
      setProfile(null)
      setNeedsProfileCompletion(false)
      setProfileError('')
      setLoading(false)
    }
  }, [clerkLoaded, isSignedIn, user?.id, fetchProfile])

  // Build a session-like object so RouteGuards & dashboards keep working
  const session = isSignedIn && user ? { user: { id: user.id, email: user.primaryEmailAddress?.emailAddress } } : null

  async function signOut() {
    await clerkSignOut()
    setProfile(null)
    setNeedsProfileCompletion(false)
    setProfileError('')
  }

  async function refreshProfile() {
    // Always attempt to fetch — don't guard on user?.id
    // because after setSignInActive the Clerk user object
    // may not have propagated to React state yet.
    setLoading(true)
    try {
      // Small delay to let Clerk's session token become available
      await new Promise(r => setTimeout(r, 300))
      await fetchProfile()
    } catch {
      // fetchProfile handles its own errors; this is a safety net
      setLoading(false)
    }
  }

  // Create profile for OAuth users who skipped the signup form
  async function createProfile({ fullName, phone, city, role }) {
    if (!user?.id) throw new Error('Not signed in')
    const data = await api.post('/profile', {
      email: user.primaryEmailAddress?.emailAddress || '',
      full_name: fullName,
      phone,
      city,
      role,
    })
    setProfile(data)
    setNeedsProfileCompletion(false)
    setProfileError('')
    return data
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, refreshProfile, clerkUser: user, api, needsProfileCompletion, createProfile, profileError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
