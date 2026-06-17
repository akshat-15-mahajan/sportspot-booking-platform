import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { SPORTS, getSport, generateVenueSlots, slotTimeLabel, getNextDays, formatDateShort, formatDateFull, formatCurrency } from '../lib/constants'
import Footer from '../components/Footer'
import { Nav, Modal, StatCard, StatusBadge, EmptyState, SectionHeader, Alert, ToastContainer, MobileSidebarWrapper, useMobileMenu } from '../components/UI'

// legacy helper for old hour_start slots
function legacyHourLabel(h) {
  return slotTimeLabel(h * 60, 60)
}

export default function AdminDashboard() {
  const { profile, signOut, api } = useAuth()
  const toast = useToast()
  const { open: menuOpen, toggle: toggleMenu, close: closeMenu } = useMobileMenu()
  const [tab, _setTab] = useState('overview')

  // ── Browser back-button support for tab navigation ──
  function setTab(newTab) {
    if (newTab === tab) return
    window.history.pushState({ tab: newTab }, '')
    _setTab(newTab)
  }
  useEffect(() => {
    const onPop = (e) => {
      const prevTab = e.state?.tab || 'overview'
      _setTab(prevTab)
    }
    // Replace initial history entry with current tab state
    window.history.replaceState({ tab: 'overview' }, '')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const [venues, setVenues] = useState([])
  const [bookings, setBookings] = useState([])
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({})

  // Slot manager state
  const [slotVenue, setSlotVenue] = useState(null)
  const [slotDate, setSlotDate] = useState(getNextDays(1)[0])
  const [slotData, setSlotData] = useState([])
  const [slotUpdating, setSlotUpdating] = useState(null)

  // Filters
  const [venueFilter, setVenueFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [searchVenue, setSearchVenue] = useState('')
  const [searchUser, setSearchUser] = useState('')

  // ── Fetch All Data ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [venueData, bookingData, userData] = await Promise.all([
        api.get('/admin/venues'),
        api.get('/admin/bookings'),
        api.get('/admin/users'),
      ])

      const vs = venueData || []
      const bs = bookingData || []
      const us = userData || []

      setVenues(vs)
      setBookings(bs)
      setUsers(us)

      const today = new Date().toISOString().split('T')[0]
      setStats({
        totalVenues: vs.length,
        pendingVenues: vs.filter(v => v.status === 'pending').length,
        approvedVenues: vs.filter(v => v.status === 'approved').length,
        totalBookings: bs.length,
        todayBookings: bs.filter(b => b.booking_date === today).length,
        totalRevenue: bs.filter(b => b.payment_status === 'paid').reduce((s, b) => s + b.total_amount, 0),
        totalUsers: us.filter(u => u.role === 'user').length,
        totalOwners: us.filter(u => u.role === 'venue').length,
      })
    } catch (err) { console.error('fetchAll:', err) }
  }, [api])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Venue Actions ───────────────────────────────────────────
  async function setVenueStatus(venueId, status) {
    try {
      await api.patch(`/venues/${venueId}/status`, { status })
      const labels = { approved: 'Venue approved ✓', rejected: 'Venue rejected', suspended: 'Venue suspended', pending: 'Set to pending' }
      toast.show(labels[status] || 'Status updated', 'success')
      fetchAll()
    } catch (err) { toast.show('Failed: ' + err.message, 'error') }
  }

  async function deleteVenue(venue) {
    const ok = window.confirm(`Delete venue "${venue.name}"? This will permanently remove bookings, slots, reviews, and gaming setup data for this venue.`)
    if (!ok) return
    try {
      await api.del(`/venues/${venue.id}`)
      toast.show('Venue deleted', 'success')
      if (slotVenue?.id === venue.id) setSlotVenue(null)
      fetchAll()
    } catch (err) {
      toast.show('Failed: ' + err.message, 'error')
    }
  }

  // ── Admin Slot Manager — uses venue's new config ────────────
  const fetchAdminSlots = useCallback(async () => {
    if (!slotVenue) return
    try {
      const data = await api.get(`/slots?venue_id=${slotVenue.id}&date=${slotDate}`)
      const byKey = {}
      ;(data || []).forEach(s => {
        const mins = s.slot_start_minutes ?? (s.hour_start != null ? s.hour_start * 60 : null)
        const court = s.court_number ?? 1
        if (mins != null) byKey[`${court}:${mins}`] = s
      })
      setSlotData(byKey)
    } catch (err) { console.error('fetchAdminSlots:', err) }
  }, [slotVenue, slotDate, api])

  useEffect(() => { fetchAdminSlots() }, [fetchAdminSlots])

  async function adminToggleSlot(court, tSlot, newStatus) {
    const key = `${court}:${tSlot.slotStartMinutes}`
    const existing = slotData[key]
    setSlotUpdating(key)
    try {
      if (existing?.id) {
        await api.patch(`/slots/${existing.id}`, { status: newStatus })
      } else {
        await api.post('/slots', {
          venue_id: slotVenue.id, slot_date: slotDate,
          court_number: court, slot_start_minutes: tSlot.slotStartMinutes,
          slot_duration_minutes: slotVenue.slot_duration_minutes || 60,
          status: newStatus, total_capacity: 1, booked_count: 0,
          ...(tSlot.slotStartMinutes % 60 === 0 ? { hour_start: tSlot.slotStartMinutes / 60 } : {})
        })
      }
      toast.show('Slot updated', 'info')
      fetchAdminSlots()
    } catch (err) { toast.show('Failed: ' + err.message, 'error') }
    finally { setSlotUpdating(null) }
  }

  const filteredVenues = venues.filter(v => {
    if (venueFilter !== 'all' && v.status !== venueFilter) return false
    if (searchVenue && !v.name.toLowerCase().includes(searchVenue.toLowerCase()) && !v.city?.toLowerCase().includes(searchVenue.toLowerCase())) return false
    return true
  })

  const filteredUsers = users.filter(u => {
    if (userFilter !== 'all' && u.role !== userFilter) return false
    if (searchUser && !u.full_name?.toLowerCase().includes(searchUser.toLowerCase())) return false
    return true
  })

  const pendingVenues = venues.filter(v => v.status === 'pending')

  const sidebarItems = [
    { key: 'overview', icon: '📊', label: 'Overview' },
    { key: 'pending',  icon: '⏳', label: 'Pending Approval', badge: stats.pendingVenues },
    { key: 'venues',   icon: '🏢', label: 'All Venues' },
    { key: 'bookings', icon: '📋', label: 'All Bookings' },
    { key: 'users',    icon: '👥', label: 'Users & Owners' },
    { key: 'slots',    icon: '🕐', label: 'Slot Override' },
  ]

  return (
    <div className="app">
      <Nav profile={profile} onLogout={() => signOut()} onMenuToggle={toggleMenu} menuOpen={menuOpen} />
      <div className="dashboard">
        <MobileSidebarWrapper open={menuOpen} onClose={closeMenu} profile={profile} onLogout={() => signOut()}>
          <div className="sidebar-section">Admin Panel</div>
          {sidebarItems.map(item => (
            <div key={item.key} className={`sidebar-item ${tab === item.key ? 'active' : ''}`} onClick={() => { setTab(item.key); closeMenu() }}>
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge > 0 && <span className="sidebar-badge">{item.badge}</span>}
            </div>
          ))}
        </MobileSidebarWrapper>

        <main className="main">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <>
              <SectionHeader title="Admin Overview" sub="Platform health at a glance" />
              <div className="stat-grid mb-4">
                <StatCard icon="🏢" num={stats.totalVenues}       label="Total Venues" />
                <StatCard icon="⏳" num={stats.pendingVenues}     label="Pending Approval" />
                <StatCard icon="✅" num={stats.approvedVenues}    label="Approved" />
                <StatCard icon="📅" num={stats.totalBookings}     label="Total Bookings" />
                <StatCard icon="📍" num={stats.todayBookings}     label="Today's Bookings" />
                <StatCard icon="💰" num={formatCurrency(stats.totalRevenue || 0)} label="Platform Revenue" />
                <StatCard icon="🏃" num={stats.totalUsers}        label="Players" />
                <StatCard icon="🏢" num={stats.totalOwners}       label="Venue Owners" />
              </div>

              {pendingVenues.length > 0 && (
                <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 'var(--r)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ color: 'var(--amber)', fontWeight: 700, marginBottom: '0.75rem' }}>⚠️ {pendingVenues.length} venue(s) awaiting approval</div>
                  {pendingVenues.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid rgba(255,184,48,0.2)' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{getSport(v.sport_type).icon} {v.name}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginLeft: '0.5rem' }}>by {v.profiles?.full_name} · {v.city}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-success btn-sm" onClick={() => setVenueStatus(v.id, 'approved')}>Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setVenueStatus(v.id, 'rejected')}>Reject</button>
                        <button className="btn btn-sm" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => deleteVenue(v)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Recent Bookings</div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>User</th><th>Venue</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {bookings.slice(0, 8).map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 600 }}>{b.profiles?.full_name || '—'}</td>
                          <td>{b.venues?.sport_icon} {b.venues?.name}</td>
                          <td>{formatDateFull(b.booking_date)}</td>
                          <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{formatCurrency(b.total_amount)}</td>
                          <td><StatusBadge status={b.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── PENDING ── */}
          {tab === 'pending' && (
            <>
              <SectionHeader title="Pending Approval" sub="Review and approve new venue listings" />
              {pendingVenues.length === 0
                ? <EmptyState icon="✅" title="All clear!" text="No venues waiting for approval." />
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {pendingVenues.map(v => {
                      const sp = getSport(v.sport_type)
                      return (
                        <div key={v.id} className="card card-pad">
                          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                            <div style={{ width: 60, height: 60, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', background: 'var(--bg-3)', flexShrink: 0 }}>{sp.icon}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{v.name}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 2 }}>
                                📍 {v.address}, {v.city} · {sp.label} · {formatCurrency(v.price_per_hour)}/hr · 👥 {v.capacity}
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 4 }}>
                                Owner: <strong style={{ color: 'var(--text-2)' }}>{v.profiles?.full_name}</strong> ({v.profiles?.phone})
                              </div>
                              {v.num_courts > 1 && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--brand)', marginTop: 4 }}>
                                  {v.num_courts} {v.court_label || 'Court'}(s) · {v.slot_duration_minutes || 60}min slots
                                </div>
                              )}
                              {v.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>{v.description}</p>}
                              {v.amenities?.length > 0 && (
                                <div style={{ marginTop: 8, display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  {v.amenities.map(a => <span key={a} className="chip" style={{ cursor: 'default', fontSize: '0.7rem', padding: '3px 8px' }}>{a}</span>)}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
                              <button className="btn btn-success" onClick={() => setVenueStatus(v.id, 'approved')}>✓ Approve</button>
                              <button className="btn btn-danger" onClick={() => setVenueStatus(v.id, 'rejected')}>✕ Reject</button>
                              <button className="btn btn-sm" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => deleteVenue(v)}>🗑 Delete</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </>
          )}

          {/* ── ALL VENUES ── */}
          {tab === 'venues' && (
            <>
              <SectionHeader title="All Venues" sub={`${venues.length} total venues on platform`} />
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, maxWidth: 260, position: 'relative' }}>
                  <span className="search-icon">🔍</span>
                  <input className="form-input" placeholder="Search venues…" value={searchVenue} onChange={e => setSearchVenue(e.target.value)} style={{ paddingLeft: 36 }} />
                </div>
                {['all', 'pending', 'approved', 'rejected'].map(s => (
                  <button key={s} className={`chip ${venueFilter === s ? 'active' : ''}`} onClick={() => setVenueFilter(s)} style={{ textTransform: 'capitalize' }}>{s === 'all' ? 'All' : s}</button>
                ))}
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Venue</th><th>Owner</th><th>Sport</th><th>Config</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {filteredVenues.map(v => {
                        const sp = getSport(v.sport_type)
                        return (
                          <tr key={v.id}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{v.name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>📍 {v.city}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{v.profiles?.full_name || '—'}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{v.profiles?.phone}</div>
                            </td>
                            <td><span className="sport-tag">{sp.icon} {sp.label}</span></td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                              {v.num_courts || 1} {v.court_label || 'Court'}(s) · {v.slot_duration_minutes || 60}min
                            </td>
                            <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{formatCurrency(v.price_per_hour)}/hr</td>
                            <td><StatusBadge status={v.status} /></td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {v.status !== 'approved'  && <button className="btn btn-success btn-sm" onClick={() => setVenueStatus(v.id, 'approved')}>Approve</button>}
                                {v.status !== 'rejected'  && <button className="btn btn-danger btn-sm"  onClick={() => setVenueStatus(v.id, 'rejected')}>Reject</button>}
                                {v.status !== 'suspended' && <button className="btn btn-sm" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber)' }} onClick={() => setVenueStatus(v.id, 'suspended')}>Suspend</button>}
                                <button className="btn btn-sm" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => deleteVenue(v)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── ALL BOOKINGS ── */}
          {tab === 'bookings' && (
            <>
              <SectionHeader title="All Bookings" sub={`${bookings.length} total bookings`} />
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>User</th><th>Venue</th><th>Date</th><th>Slots</th><th>Amount</th><th>Status</th><th>Payment</th></tr></thead>
                    <tbody>
                      {bookings.map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 600 }}>{b.profiles?.full_name || '—'}</td>
                          <td>{b.venues?.sport_icon} {b.venues?.name}</td>
                          <td>{formatDateFull(b.booking_date)}</td>
                          <td style={{ fontSize: '0.78rem', maxWidth: 200 }}>{b.slots_label?.join(', ')}</td>
                          <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{formatCurrency(b.total_amount)}</td>
                          <td><StatusBadge status={b.status} /></td>
                          <td><StatusBadge status={b.payment_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── USERS ── */}
          {tab === 'users' && (
            <>
              <SectionHeader title="Users & Owners" sub={`${users.length} total accounts`} />
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, maxWidth: 260, position: 'relative' }}>
                  <span className="search-icon">🔍</span>
                  <input className="form-input" placeholder="Search users…" value={searchUser} onChange={e => setSearchUser(e.target.value)} style={{ paddingLeft: 36 }} />
                </div>
                {['all', 'user', 'venue', 'admin'].map(r => (
                  <button key={r} className={`chip ${userFilter === r ? 'active' : ''}`} onClick={() => setUserFilter(r)} style={{ textTransform: 'capitalize' }}>{r === 'all' ? 'All Roles' : r}</button>
                ))}
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Role</th><th>Joined</th></tr></thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.role === 'admin' ? 'var(--amber-bg)' : u.role === 'venue' ? 'var(--blue-bg)' : 'var(--green-bg)', color: u.role === 'admin' ? 'var(--amber)' : u.role === 'venue' ? 'var(--blue)' : 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                                {(u.full_name || '?')[0].toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 600 }}>{u.full_name || '—'}</span>
                            </div>
                          </td>
                          <td>{u.phone || '—'}</td>
                          <td>{u.city || '—'}</td>
                          <td><span className={`badge ${u.role === 'admin' ? 'badge-amber' : u.role === 'venue' ? 'badge-blue' : 'badge-green'}`} style={{ textTransform: 'capitalize' }}>{u.role}</span></td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── SLOT OVERRIDE ── */}
          {tab === 'slots' && (
            <>
              <SectionHeader title="Slot Override" sub="Admin control over any venue's time slots" />
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="form-input form-select" style={{ width: 300 }}
                  value={slotVenue?.id || ''}
                  onChange={e => setSlotVenue(venues.find(v => v.id === e.target.value) || null)}>
                  <option value="">Select a venue…</option>
                  {venues.filter(v => v.status === 'approved').map(v => (
                    <option key={v.id} value={v.id}>{getSport(v.sport_type).icon} {v.name} — {v.city}</option>
                  ))}
                </select>
                {slotVenue && (
                  <input type="date" className="form-input calendar-input" style={{ width: 180 }}
                    value={slotDate} min={getNextDays(1)[0]} max={getNextDays(14)[13]}
                    onChange={e => setSlotDate(e.target.value)} />
                )}
              </div>

              {!slotVenue
                ? <EmptyState icon="🕐" title="Select a venue" text="Choose an approved venue to manage its slots" />
                : (() => {
                    const numCourts  = slotVenue.num_courts  || 1
                    const courtLabel = slotVenue.court_label || getSport(slotVenue.sport_type).courtLabel || 'Court'
                    const tSlots     = generateVenueSlots(slotVenue.open_time ?? 6, slotVenue.close_time ?? 22, slotVenue.slot_duration_minutes || 60)
                    const courts     = Array.from({ length: numCourts }, (_, i) => i + 1)

                    return (
                      <div className="card card-pad">
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>{getSport(slotVenue.sport_type).icon}</span>
                          <div>
                            <div style={{ fontWeight: 700 }}>{slotVenue.name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                              {numCourts} {courtLabel}(s) · {slotVenue.slot_duration_minutes || 60}min slots · {formatCurrency(slotVenue.price_per_hour)}/hr
                            </div>
                          </div>
                        </div>

                        {courts.map(court => (
                          <div key={court} style={{ marginBottom: '1.5rem' }}>
                            {numCourts > 1 && (
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--brand)', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
                                {courtLabel} {court}
                              </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                              {tSlots.map(tSlot => {
                                const key = `${court}:${tSlot.slotStartMinutes}`
                                const s = slotData[key]
                                const status = s?.status || 'available'
                                const isBooked  = status === 'booked' || status === 'partial'
                                const isBlocked = status === 'blocked'
                                const isUpdating = slotUpdating === key
                                return (
                                  <div key={key} style={{
                                    border: `1.5px solid ${isBooked ? 'var(--green)' : isBlocked ? 'var(--red)' : 'var(--border-2)'}`,
                                    borderRadius: 8, padding: '0.6rem',
                                    background: isBooked ? 'var(--green-bg)' : isBlocked ? 'var(--red-bg)' : 'var(--bg-3)',
                                  }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: 4 }}>{tSlot.label}</div>
                                    <div style={{ fontSize: '0.65rem', color: isBooked ? 'var(--green)' : isBlocked ? 'var(--red)' : 'var(--text-3)', marginBottom: 6 }}>
                                      {isBooked ? `✓ Booked${s?.booked_count > 1 ? ` (${s.booked_count})` : ''}` : isBlocked ? '🔒 Blocked' : '○ Available'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                      {!isBlocked && <button className="btn btn-sm" disabled={isUpdating} onClick={() => adminToggleSlot(court, tSlot, 'blocked')} style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }}>Block</button>}
                                      {isBlocked && <button className="btn btn-sm" disabled={isUpdating} onClick={() => adminToggleSlot(court, tSlot, 'available')} style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green)' }}>Unblock</button>}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()
              }
            </>
          )}
        </main>
      </div>
      <ToastContainer toasts={toast.toasts} />
      <Footer />
    </div>
  )
}
