import { Logo, WordMark } from './Logo'
import { useToast as useToastHook } from '../hooks/useToast'
import { useState, useEffect } from 'react'

// ── MOBILE MENU HOOK ──────────────────────────────────────────
export function useMobileMenu() {
  const [open, setOpen] = useState(false)
  const toggle = () => setOpen(p => !p)
  const close = () => setOpen(false)
  useEffect(() => {
    const handler = () => { if (window.innerWidth > 768) setOpen(false) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  return { open, toggle, close }
}

// ── NAV ───────────────────────────────────────────────────────
export function Nav({ profile, onLogout, onMenuToggle, menuOpen }) {
  const roleClass = profile?.role === 'admin' ? 'admin' : profile?.role === 'venue' ? 'venue' : ''
  const roleLabel = profile?.role === 'admin' ? '👑 Admin' : profile?.role === 'venue' ? '🏢 Venue' : '🏃 Player'
  return (
    <nav className="nav">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {onMenuToggle && (
          <button className={`hamburger ${menuOpen ? 'open' : ''}`} onClick={onMenuToggle} aria-label="Toggle menu">
            <span /><span /><span />
          </button>
        )}
        <Logo height={32} />
      </div>
      <div className="nav-right">
        {profile && (
          <>
            <span className="nav-user">{profile.full_name || 'User'}</span>
            <span className={`nav-role ${roleClass}`}>{roleLabel}</span>
            <button className="btn btn-ghost btn-sm nav-signout" onClick={onLogout}>Sign Out</button>
          </>
        )}
      </div>
    </nav>
  )
}

// ── MOBILE SIDEBAR WRAPPER ────────────────────────────────────
export function MobileSidebarWrapper({ open, onClose, profile, onLogout, children }) {
  const roleClass = profile?.role === 'admin' ? 'admin' : profile?.role === 'venue' ? 'venue' : ''
  const roleLabel = profile?.role === 'admin' ? '👑 Admin' : profile?.role === 'venue' ? '🏢 Venue' : '🏃 Player'
  const initial = (profile?.full_name || 'U')[0].toUpperCase()
  const avatarBg = profile?.role === 'admin' ? 'var(--amber)' : profile?.role === 'venue' ? 'var(--blue)' : 'var(--brand)'
  const avatarColor = profile?.role === 'venue' ? 'white' : '#000'
  return (
    <>
      <div className={`sidebar-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'mobile-open' : ''}`}>
        {/* Mobile-only top bar */}
        <div className="sidebar-mobile-header">
          <Logo height={28} />
          <button onClick={onClose} style={{ background: 'var(--bg-4)', border: '1px solid var(--border)', color: 'var(--text-2)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', lineHeight: 1 }}>
            ×
          </button>
        </div>
        {/* Scrollable nav items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
        {/* User info + sign out pinned to bottom */}
        {profile && (
          <div className="sidebar-user-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: avatarBg, color: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>
                {initial}
              </div>
              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.full_name || 'User'}
                </div>
                <span className={`nav-role ${roleClass}`} style={{ marginTop: 3, display: 'inline-block', fontSize: '0.62rem' }}>
                  {roleLabel}
                </span>
              </div>
            </div>
            <button
              onClick={() => { onClose(); onLogout?.() }}
              style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontFamily: 'Inter, sans-serif' }}
            >
              Sign Out
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

// ── TOAST CONTAINER ──────────────────────────────────────────
export function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

// ── SPINNER ──────────────────────────────────────────────────
export function Spinner({ size = 'md' }) {
  return <div className={size === 'sm' ? 'inline-spinner' : 'spinner'} />
}

export function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div style={{ textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '1rem', color: 'var(--text-2)', fontSize: '0.875rem' }}>Loading…</p>
      </div>
    </div>
  )
}

// ── MODAL ────────────────────────────────────────────────────
export function Modal({ title, onClose, footer, children, maxWidth = 560 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── STAT CARD ────────────────────────────────────────────────
export function StatCard({ icon, num, label, change }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-num">{num}</div>
      <div className="stat-label">{label}</div>
      {change && <div className="stat-change">{change}</div>}
    </div>
  )
}

// ── STATUS BADGE ─────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    confirmed: ['badge-green', 'Confirmed'],
    pending:   ['badge-amber', 'Pending'],
    cancelled: ['badge-red',   'Cancelled'],
    refunded:  ['badge-blue',  'Refunded'],
    approved:  ['badge-green', 'Approved'],
    rejected:  ['badge-red',   'Rejected'],
    suspended: ['badge-red',   'Suspended'],
    available: ['badge-green', 'Available'],
    booked:    ['badge-red',   'Booked'],
    blocked:   ['badge-grey',  'Blocked'],
    paid:      ['badge-green', 'Paid'],
    failed:    ['badge-red',   'Failed'],
  }
  const [cls, label] = map[status] || ['badge-grey', status]
  return <span className={`badge ${cls}`}>{label}</span>
}

// ── EMPTY STATE ──────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      {title && <div className="empty-title">{title}</div>}
      {text && <p className="empty-text">{text}</p>}
      {action && <div style={{ marginTop: '1.25rem' }}>{action}</div>}
    </div>
  )
}

// ── SECTION HEADER ───────────────────────────────────────────
export function SectionHeader({ title, sub, action }) {
  return (
    <div className="flex-between mb-4">
      <div>
        <h1 className="section-title">{title}</h1>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ── ALERT ────────────────────────────────────────────────────
export function Alert({ type = 'info', children }) {
  const icons = { info: 'ℹ', warn: '⚠', error: '✕', success: '✓' }
  return (
    <div className={`alert alert-${type}`}>
      <span>{icons[type]}</span>
      <span>{children}</span>
    </div>
  )
}
