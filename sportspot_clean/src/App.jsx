import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider, AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { AuthProvider } from './hooks/useAuth'
import { CLERK_PUBLISHABLE_KEY, clerkAppearance } from './lib/clerk'

// Portals
import UserAuth from './pages/UserAuth'
import VenueAuth from './pages/VenueAuth'
import AdminAuth from './pages/AdminAuth'
import UserDashboard from './pages/UserDashboard'
import VenueDashboard from './pages/VenueDashboard'
import AdminDashboard from './pages/AdminDashboard'

// Public pages
import LandingPage from './pages/LandingPage'
import SearchResults from './pages/SearchResults'
import VenueDetail from './pages/VenueDetail'
import { PrivacyPolicy, TermsConditions, RefundPolicy, ContactUs, AboutPage } from './pages/LegalPages'

// Guards
import { RequireAuth, RequireRole } from './components/RouteGuards'

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ fontSize: '4rem' }}>🏟️</div>
      <div style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.5rem', fontWeight: 800 }}>Page not found</div>
      <a href="/" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}>← Go to Rabonna</a>
    </div>
  )
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={clerkAppearance}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* ── LANDING PAGE ── */}
            <Route path="/" element={<LandingPage />} />

            {/* ── PUBLIC SEARCH & VENUE DETAIL (no auth required) ── */}
            <Route path="/search" element={<SearchResults />} />
            <Route path="/venue/:id" element={<VenueDetail />} />

            {/* ── SSO OAuth callback ── */}
            <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />

          {/* ── USER PORTAL ── */}
          <Route path="/play" element={
            <RequireAuth fallback={<UserAuth />}>
              <RequireRole role="user" fallback={<UserAuth />}>
                <UserDashboard />
              </RequireRole>
            </RequireAuth>
          } />

          {/* ── VENUE PORTAL ── */}
          <Route path="/venue" element={
            <RequireAuth fallback={<VenueAuth />}>
              <RequireRole role="venue" fallback={<VenueAuth />}>
                <VenueDashboard />
              </RequireRole>
            </RequireAuth>
          } />

          {/* ── ADMIN PORTAL ── */}
          <Route path="/admin" element={
            <RequireAuth fallback={<AdminAuth />}>
              <RequireRole role="admin" fallback={<AdminAuth />}>
                <AdminDashboard />
              </RequireRole>
            </RequireAuth>
          } />

          {/* ── PUBLIC / LEGAL PAGES ── */}
          <Route path="/privacy"  element={<PrivacyPolicy />} />
          <Route path="/terms"    element={<TermsConditions />} />
          <Route path="/refunds"  element={<RefundPolicy />} />
          <Route path="/contact"  element={<ContactUs />} />
          <Route path="/about"    element={<AboutPage />} />

          {/* ── 404 ── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ClerkProvider>
  )
}
