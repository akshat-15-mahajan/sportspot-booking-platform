import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import {
  SPORTS, getSport, generateVenueSlots, slotTimeLabel,
  getNextDays, formatDateFull, formatCurrency,
  calcFees, calcFeesFromSlots, generatePaymentRef, calcDistance,
  todayIST, nowMinutesIST, isGamingVenue,
  getVenueCourts, getCourtByNumber, getLowestPrice, getVenueSports
} from '../lib/constants'
import { Nav, Modal, StatusBadge, EmptyState, SectionHeader, ToastContainer, MobileSidebarWrapper, useMobileMenu } from '../components/UI'
import { StarDisplay, StarPicker, PhotoCarousel, TimeSliderBookingPanel } from '../components/VenueComponents'
import { GamingBookingPanel } from '../components/GamingComponents'
import Footer from '../components/Footer'

const MAX_DISTANCE_KM = 50

// ── MAIN ─────────────────────────────────────────────────────
export default function UserDashboard() {
  const { profile, signOut, api } = useAuth()
  const toast = useToast()
  const { open: menuOpen, toggle: toggleMenu, close: closeMenu } = useMobileMenu()

  const [tab, setTab] = useState('explore')
  const [allVenues, setAllVenues] = useState([])
  const [venues, setVenues] = useState([])
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [selectedDate, setSelectedDate] = useState(getNextDays(1)[0])
  const [selectedSlots, setSelectedSlots] = useState([]) // [{courtNumber, slotStartMinutes, slotLabel, existingId, totalCapacity, bookedCount}]
  const [myBookedKeys, setMyBookedKeys] = useState(new Set()) // "court:mins" keys of slots booked by me
  const [userBookings, setUserBookings] = useState([])
  const [bookingModal, setBookingModal] = useState(null)
  const [successBooking, setSuccessBooking] = useState(null)
  const [paying, setPaying] = useState(false)
  const [sportFilter, setSportFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [gamingBooking, setGamingBooking] = useState(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletData, setWalletData] = useState(null)
  const [walletError, setWalletError] = useState('')

  // Review state
  const [reviewModal, setReviewModal] = useState(null)
  const [reviewStars, setReviewStars] = useState(0)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [myReviews, setMyReviews] = useState({})

  const days = getNextDays(14)

  // ── GPS ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLocation(null),
      { timeout: 8000 }
    )
  }, [])

  // ── Filter venues ─────────────────────────────────────────────
  useEffect(() => {
    let f = allVenues
    if (sportFilter !== 'all') f = f.filter(v =>
      v.sport_types?.includes(sportFilter) ||
      v.courts?.some(c => (c.sport_types || [c.sport_type]).includes(sportFilter)) ||
      v.sport_type === sportFilter
    )
    if (search) f = f.filter(v =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.city?.toLowerCase().includes(search.toLowerCase()) ||
      v.address?.toLowerCase().includes(search.toLowerCase())
    )
    // Sort by distance (nearest first) — but never hide venues by distance
    if (userLocation) {
      f = [...f].sort((a, b) => {
        const da = a.lat && a.lng ? parseFloat(calcDistance(userLocation.lat, userLocation.lng, a.lat, a.lng)) : 999
        const db = b.lat && b.lng ? parseFloat(calcDistance(userLocation.lat, userLocation.lng, b.lat, b.lng)) : 999
        return da - db
      })
    }
    setVenues(f)
  }, [allVenues, sportFilter, search, userLocation])

  // ── Fetch venues ──────────────────────────────────────────────
  const fetchVenues = useCallback(async () => {
    setLoadingVenues(true)
    try {
      const data = await api.get('/venues')
      setAllVenues(data || [])
    } catch (err) { console.error('Fetch venues error:', err) }
    setLoadingVenues(false)
  }, [api])

  useEffect(() => { fetchVenues() }, [fetchVenues])

  // ── Fetch my reviews ──────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    ;(async () => {
      try {
        const data = await api.get('/reviews/mine')
        setMyReviews(data || {})
      } catch (err) { console.error('Fetch reviews error:', err) }
    })()
  }, [profile, api])

  // ── Fetch user bookings ───────────────────────────────────────
  useEffect(() => {
    if (tab !== 'bookings' || !profile) return
    ;(async () => {
      try {
        const data = await api.get('/bookings')
        setUserBookings(data || [])
      } catch (err) { console.error('Fetch bookings error:', err) }
    })()
  }, [tab, profile, api])

  const fetchWallet = useCallback(async () => {
    if (!profile) return
    setWalletLoading(true)
    setWalletError('')
    try {
      const data = await api.get('/wallet/progress')
      setWalletData(data || null)
    } catch (err) {
      setWalletError(err.message || 'Failed to load wallet')
    } finally {
      setWalletLoading(false)
    }
  }, [profile, api])

  useEffect(() => {
    if (!profile) return
    if (tab === 'wallet' || tab === 'profile' || tab === 'explore') {
      fetchWallet()
    }
  }, [tab, profile, fetchWallet])

  // ── Load MY booked slots for current venue+date from bookings table ────────
  // This is the authoritative source for "Your booking" — uses the bookings
  // table slot_ids cross-referenced with the slots table, so it works even
  // when multiple users book the same multi-capacity slot.
  useEffect(() => {
    if (!selectedVenue || !selectedDate || !profile) { setMyBookedKeys(new Set()); return }

    ;(async () => {
      try {
        const keys = await api.get(`/bookings/my-slots?venue_id=${selectedVenue.id}&date=${selectedDate}`)
        setMyBookedKeys(new Set(keys || []))
      } catch (err) {
        console.error('Fetch my slots error:', err)
        setMyBookedKeys(new Set())
      }
    })()
  }, [selectedVenue, selectedDate, profile, api])

  // ── Open payment modal ────────────────────────────────────────
  async function precheckRegularBooking(venue, date, slots) {
    await api.post('/bookings/precheck', {
      venue_id: venue.id,
      date,
      slots: slots.map(s => ({
        courtNumber: s.courtNumber || 1,
        slotStartMinutes: s.slotStartMinutes,
        durationMinutes: s.durationMinutes || venue.slot_duration_minutes || 60,
        slotLabel: s.slotLabel,
      }))
    })
  }

  async function precheckGamingBooking(gb) {
    await api.post('/gaming/precheck', {
      venue_id: gb.venue_id,
      date: gb.date,
      setup_type: gb.setup_type,
      game_id: gb.game_id,
      slot_start_minutes_list: gb.slot_start_minutes_list,
    })
  }

  async function openPayment() {
    if (isGamingVenue(selectedVenue) && gamingBooking) {
      try {
        await precheckGamingBooking(gamingBooking)
        setBookingModal({ venue: selectedVenue, date: gamingBooking.date, isGaming: true, gamingBooking })
      } catch (err) {
        toast.show(err.message || 'Slot unavailable now. Please pick another time.', 'error')
      }
      return
    }
    if (!selectedSlots.length) { toast.show('Select at least one slot', 'error'); return }
    try {
      await precheckRegularBooking(selectedVenue, selectedDate, selectedSlots)
      setBookingModal({ venue: selectedVenue, date: selectedDate, slots: [...selectedSlots] })
    } catch (err) {
      toast.show(err.message || 'Slot unavailable now. Please pick another time.', 'error')
    }
  }

  // ── Save booking after payment ────────────────────────────────
  // Sends all booking data to the Express server which atomically:
  //   - Finds or creates slot rows with FOR UPDATE locks
  //   - Checks for blocks and capacity
  //   - Increments booked_count
  //   - Creates the booking record
  async function saveBookingAfterPayment(paymentId, snap) {
    const { venue, date, slots: bookedSlots } = snap
    const duration = venue.slot_duration_minutes || 60
    const fees = calcFeesFromSlots(bookedSlots, venue, duration)
    const payRef = paymentId || generatePaymentRef()

    const booking = await api.post('/bookings', {
      venue_id: venue.id,
      date,
      slots: bookedSlots.map(s => ({
        courtNumber: s.courtNumber || 1,
        slotStartMinutes: s.slotStartMinutes,
        slotLabel: s.slotLabel,
        durationMinutes: s.durationMinutes || duration,
        pricePerHour: s.pricePerHour || venue.price_per_hour,
      })),
      slots_label: bookedSlots.map(s => s.slotLabel),
      subtotal: fees.subtotal,
      platform_fee: fees.fee,
      total_amount: fees.total,
      payment_ref: payRef,
    })

    return booking
  }

  // ── Gaming booking save ───────────────────────────────────────
  async function saveGamingBooking(paymentId, snap) {
    const gb = snap.gamingBooking
    const payRef = paymentId || generatePaymentRef()
    return await api.post('/gaming/book', {
      venue_id: gb.venue_id,
      date: gb.date,
      setup_type: gb.setup_type,
      game_id: gb.game_id,
      player_count: gb.player_count,
      slot_start_minutes_list: gb.slot_start_minutes_list,
      payment_ref: payRef,
    })
  }

  // ── Razorpay / payment ────────────────────────────────────────
  async function confirmPayment() {
    if (!bookingModal) return
    const snap = bookingModal
    const isGaming = snap.isGaming
    const fees = isGaming
      ? { subtotal: snap.gamingBooking.price, fee: 0, total: snap.gamingBooking.price }
      : calcFeesFromSlots(snap.slots, snap.venue, snap.venue.slot_duration_minutes || 60)

    setPaying(true)

    const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID

    try {
      if (isGaming) {
        await precheckGamingBooking(snap.gamingBooking)
      } else {
        await precheckRegularBooking(snap.venue, snap.date, snap.slots)
      }
    } catch (err) {
      toast.show(err.message || 'Selected slot is no longer available. Please reselect.', 'error')
      setPaying(false)
      setBookingModal(null)
      return
    }

    if (!razorpayKey) {
      try {
        let booking
        if (isGaming) {
          booking = await saveGamingBooking(generatePaymentRef(), snap)
        } else {
          booking = await saveBookingAfterPayment(generatePaymentRef(), snap)
          const bookedKeys = snap.slots.map(s => `${s.courtNumber || 1}:${s.slotStartMinutes}`)
          setMyBookedKeys(prev => new Set([...prev, ...bookedKeys]))
        }
        fetchWallet().catch(() => {})
        setBookingModal(null); setSelectedSlots([]); setGamingBooking(null)
        setSuccessBooking(booking)
        toast.show('Booking confirmed! 🎉', 'success')
      } catch (err) {
        toast.show(err.message || 'Booking failed', 'error')
      } finally { setPaying(false) }
      return
    }

    if (!window.Razorpay) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = res; s.onerror = () => rej(new Error('Failed to load Razorpay'))
          document.head.appendChild(s)
        })
      } catch {
        toast.show('Could not load payment gateway. Check your connection.', 'error')
        setPaying(false); return
      }
    }

    const options = {
      key: razorpayKey,
      amount: Math.round(fees.total * 100),
      currency: 'INR',
      name: 'Rabonna',
      description: isGaming
        ? `${snap.venue.name} · Gaming · ${snap.gamingBooking.slotCount} slot${snap.gamingBooking.slotCount > 1 ? 's' : ''}`
        : `${snap.venue.name} · ${snap.slots.length} slot${snap.slots.length > 1 ? 's' : ''}`,
      image: '/rabonna-icon.png',
      handler: async (response) => {
        try {
          let booking
          if (isGaming) {
            booking = await saveGamingBooking(response.razorpay_payment_id, snap)
          } else {
            booking = await saveBookingAfterPayment(response.razorpay_payment_id, snap)
            const bookedKeys = snap.slots.map(s => `${s.courtNumber || 1}:${s.slotStartMinutes}`)
            setMyBookedKeys(prev => new Set([...prev, ...bookedKeys]))
          }
          fetchWallet().catch(() => {})
          setBookingModal(null); setSelectedSlots([]); setGamingBooking(null)
          setSuccessBooking(booking)
          toast.show('Booking confirmed! 🎉', 'success')
        } catch (err) {
          toast.show(`Payment received but booking save failed — contact support with ref: ${response.razorpay_payment_id}`, 'error')
        } finally { setPaying(false) }
      },
      prefill: { name: profile?.full_name || '', contact: profile?.phone || '' },
      theme: { color: '#00C37A' },
      modal: { ondismiss: () => setPaying(false) }
    }

    const rzp = new window.Razorpay(options)
    rzp.on('payment.failed', resp => {
      toast.show(resp.error?.description || 'Payment failed. Please try again.', 'error')
      setPaying(false)
    })
    rzp.open()
  }

  // ── Submit review ─────────────────────────────────────────────
  async function submitReview() {
    if (!reviewStars) { toast.show('Please select a star rating', 'error'); return }
    setSubmittingReview(true)
    try {
      await api.post('/reviews', {
        venue_id: reviewModal.venue.id,
        rating: reviewStars,
        booking_id: reviewModal.bookingId || null,
      })
      setMyReviews(p => ({ ...p, [reviewModal.venue.id]: reviewStars }))
      toast.show('Review submitted! ⭐', 'success')
      setReviewModal(null)
      fetchVenues()
    } catch (err) { toast.show(err.message || 'Failed to submit review', 'error') }
    finally { setSubmittingReview(false) }
  }

  // ── Browser back-button support for venue detail ──────────────
  async function selectVenue(v) {
    if (isGamingVenue(v) && !v.gaming_config) {
      try {
        const full = await fetch(`/api/venues/${v.id}/public`).then(r => r.json())
        setSelectedVenue(full)
      } catch {
        setSelectedVenue(v)
      }
    } else {
      setSelectedVenue(v)
    }
    window.history.pushState({ venueOpen: true }, '')
  }
  function closeVenueDetail() {
    setSelectedVenue(null); setSelectedSlots([]); setMyBookedKeys(new Set())
  }
  useEffect(() => {
    const onPop = () => {
      if (selectedVenue) {
        closeVenueDetail()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [selectedVenue])

  // ── Helpers ───────────────────────────────────────────────────
  const sport = getSport(selectedVenue?.sport_type)
  const duration = selectedVenue?.slot_duration_minutes || 60
  const fees = bookingModal
    ? bookingModal.isGaming
      ? { subtotal: bookingModal.gamingBooking.price, fee: 0, total: bookingModal.gamingBooking.price }
      : calcFeesFromSlots(bookingModal.slots, bookingModal.venue, bookingModal.venue.slot_duration_minutes || 60)
    : null
  const getNavUrl = v => v?.lat && v?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent((v?.name || '') + ' ' + (v?.city || ''))}`

  return (
    <div className="app">
      <Nav profile={profile} onLogout={() => signOut().catch(() => {})} onMenuToggle={toggleMenu} menuOpen={menuOpen} />
      <div className="dashboard">
        <MobileSidebarWrapper open={menuOpen} onClose={closeMenu} profile={profile} onLogout={() => signOut().catch(() => {})}>
          <div className="sidebar-section">Menu</div>
          {[
            { key: 'explore',  icon: '🔍', label: 'Explore Venues' },
            { key: 'bookings', icon: '📋', label: 'My Bookings' },
            { key: 'wallet',   icon: '🪙', label: 'Rabonna Coins' },
            { key: 'profile',  icon: '👤', label: 'Profile' },
          ].map(item => (
            <div key={item.key} className={`sidebar-item ${tab === item.key ? 'active' : ''}`}
              onClick={() => { setTab(item.key); if (selectedVenue) { closeVenueDetail(); window.history.back() } closeMenu() }}>
              <span className="sidebar-icon">{item.icon}</span><span>{item.label}</span>
            </div>
          ))}
        </MobileSidebarWrapper>

        <main className="main">

          {/* ── VENUE LIST ── */}
          {tab === 'explore' && !selectedVenue && (
            <>
              <div className="card card-pad" style={{ marginBottom: '1rem', background: 'linear-gradient(135deg, rgba(255,184,48,0.08) 0%, rgba(0,195,122,0.08) 100%)', borderColor: 'rgba(255,184,48,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontWeight: 700 }}>Rabonna Coins</div>
                    {walletLoading && !walletData ? (
                      <div style={{ marginTop: '0.3rem', color: 'var(--text-3)', fontSize: '0.85rem' }}>Loading your wallet…</div>
                    ) : walletError ? (
                      <div style={{ marginTop: '0.3rem', color: 'var(--red)', fontSize: '0.82rem' }}>{walletError}</div>
                    ) : (
                      <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--amber)' }}>{Number(walletData?.balance?.available_rc || 0).toFixed(2)} RC</div>
                        <div style={{ fontSize: '0.86rem', color: 'var(--text-2)' }}>
                          Worth {formatCurrency(Number(walletData?.balance?.available_rc || 0) * 0.1)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                          Level: <strong style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{walletData?.progress?.wallet_level || 'rookie'}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTab('wallet')}>Open Wallet</button>
                </div>
              </div>

              <div className="explore-header">
                <div className="search-wrap explore-search">
                  <span className="search-icon">🔍</span>
                  <input className="form-input" placeholder="Search venues, cities…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="sport-filter-row">
                  <button className={`sport-chip ${sportFilter === 'all' ? 'active' : ''}`} onClick={() => setSportFilter('all')}>
                    <span className="sport-chip-icon">🏟️</span>
                    <span className="sport-chip-label">All</span>
                  </button>
                  {SPORTS.map(s => (
                    <button key={s.key} className={`sport-chip ${sportFilter === s.key ? 'active' : ''}`} onClick={() => setSportFilter(s.key)}>
                      <span className="sport-chip-icon">{s.icon}</span>
                      <span className="sport-chip-label">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {loadingVenues
                ? <div className="flex-center" style={{ height: 200 }}><div className="spinner" /></div>
                : venues.length === 0
                  ? <EmptyState icon="🏟️" title="No venues found" text="Try a different filter or search." />
                  : (
                    <div className="venue-grid">
                      {venues.map(v => {
                        const sp = getSport(v.sport_type)
                        const vSports = getVenueSports(v)
                        const lowestPrice = getLowestPrice(v)
                        const hasDiffPrices = v.courts?.length > 1 && !v.courts.every(c => c.price_per_hour === v.courts[0].price_per_hour)
                        const dist = userLocation && v.lat && v.lng ? calcDistance(userLocation.lat, userLocation.lng, v.lat, v.lng) : null
                        const hasPhoto = v.images?.length > 0
                        const numCourts = v.num_courts || 1
                        const courtLbl  = v.court_label || sp.courtLabel || 'Court'
                        const slotDur   = v.slot_duration_minutes || 60
                        const isGaming  = isGamingVenue(v)
                        return (
                          <div key={v.id} className="venue-card" onClick={() => selectVenue(v)}>
                            <div className={`venue-card-hero ${sp.heroClass}`} style={hasPhoto ? { padding: 0 } : {}}>
                              {hasPhoto
                                ? <img src={v.images[0]} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: '4rem', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>{sp.icon}</span>}
                            </div>
                            <div className="venue-card-body">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                                {vSports.length > 0
                                  ? vSports.map(vs => <span key={vs.key} className="sport-tag">{vs.icon} {vs.label}</span>)
                                  : <span className="sport-tag">{sp.icon} {sp.label}</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: 4 }}>
                                <div className="venue-card-name" style={{ margin: 0 }}>{v.name}</div>
                                {v.rating > 0 && <StarDisplay rating={v.rating} count={v.total_reviews} size={12} />}
                              </div>
                              <div className="venue-card-addr">📍 {v.address}, {v.city}</div>
                              {isGaming ? (
                                <div style={{ fontSize: '0.72rem', color: 'var(--brand)', marginTop: 3, fontWeight: 600 }}>
                                  🎮 Gaming Venue
                                </div>
                              ) : numCourts > 1 ? (
                                <div style={{ fontSize: '0.72rem', color: 'var(--brand)', marginTop: 3, fontWeight: 600 }}>
                                  {numCourts} {courtLbl}s · {slotDur}min slots
                                </div>
                              ) : null}
                              {dist && (
                                <div style={{ fontSize: '0.72rem', color: parseFloat(dist) <= 5 ? 'var(--green)' : parseFloat(dist) <= 15 ? 'var(--brand)' : 'var(--text-3)', marginTop: 2 }}>
                                  🗺 {dist} km away
                                </div>
                              )}
                              <div className="venue-card-footer">
                                <div className="venue-price">
                                  {isGaming
                                    ? <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>🎮 {formatCurrency(v.price_per_hour)}<span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-3)' }}>/session</span></span>
                                    : <>{hasDiffPrices && <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-3)', marginRight: 2 }}>From </span>}{formatCurrency(lowestPrice)}<span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-3)' }}>/hr{hasDiffPrices ? ' onwards' : ''}</span></>}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>👥 {v.capacity}</span>
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

          {/* ── VENUE DETAIL ── */}
          {tab === 'explore' && selectedVenue && (
            <>
              <button className="btn btn-ghost btn-sm mb-3" onClick={() => { closeVenueDetail(); window.history.back() }}>
                ← Back to venues
              </button>

              <div className="venue-detail-grid">
                {/* Left: info */}
                <div>
                  <PhotoCarousel images={selectedVenue.images} sportHeroClass={sport.heroClass} sportIcon={sport.icon} />

                  <div style={{ marginBottom: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.3rem' }}>{selectedVenue.name}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <StarDisplay rating={selectedVenue.rating} count={selectedVenue.total_reviews} size={16} />
                      <button
                        onClick={() => { setReviewModal({ venue: selectedVenue }); setReviewStars(myReviews[selectedVenue.id] || 0) }}
                        style={{ background: 'none', border: '1px solid var(--border-2)', borderRadius: 'var(--r-sm)', padding: '3px 10px', color: 'var(--text-3)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
                        {myReviews[selectedVenue.id] ? '✏️ Edit review' : '⭐ Rate venue'}
                      </button>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>📍 {selectedVenue.address}, {selectedVenue.city}</p>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {userLocation && selectedVenue.lat && selectedVenue.lng && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                        🗺 {calcDistance(userLocation.lat, userLocation.lng, selectedVenue.lat, selectedVenue.lng)} km away
                      </div>
                    )}
                    <a href={getNavUrl(selectedVenue)} target="_blank" rel="noreferrer" className="btn btn-sm"
                      style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      🧭 Navigate on Google Maps
                    </a>
                  </div>

                  {selectedVenue.description && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '1rem' }}>{selectedVenue.description}</p>
                  )}

                  {/* Info grid */}
                  <div className="grid-2" style={{ gap: '0.6rem', marginBottom: '1rem' }}>
                    {(() => {
                      if (isGamingVenue(selectedVenue)) {
                        const gc = selectedVenue.gaming_config
                        const setupLabels = { ps5: '🎮 PS5', car_racing: '🏎️ Racing', ps_vr2: '🥽 VR' }
                        return [
                          ['Category', '🎮 Gaming'],
                          ['Setups', (gc?.setups || []).map(s => setupLabels[s.setup_type] || s.setup_type).join(', ') || 'Gaming'],
                          ['Consoles', (gc?.consoles || []).length + ' units'],
                          ['Games', (gc?.games || []).length + ' available'],
                        ]
                      }
                      const detailCourts = getVenueCourts(selectedVenue)
                      const detailSports = getVenueSports(selectedVenue)
                      const detailLowest = getLowestPrice(selectedVenue)
                      const hasDiffPrices = detailCourts.length > 1 && !detailCourts.every(c => c.price_per_hour === detailCourts[0].price_per_hour)
                      return [
                        ['Price', hasDiffPrices ? `From ${formatCurrency(detailLowest)}/hr` : formatCurrency(detailLowest) + '/hr'],
                        ['Slot', `${duration}min`],
                        ['Sports', detailSports.map(s => s.icon + ' ' + s.label).join(', ') || (sport.icon + ' ' + sport.label)],
                        [(selectedVenue.court_label || sport.courtLabel || 'Court') + 's', `${selectedVenue.num_courts || 1} available`],
                      ]
                    })().map(([label, val]) => (
                      <div key={label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.6rem 0.75rem' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                        <div style={{ fontWeight: 700, marginTop: 3, fontSize: '0.9rem' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {selectedVenue.amenities?.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Amenities</div>
                      <div className="filter-row">
                        {selectedVenue.amenities.map(a => <span key={a} className="chip" style={{ cursor: 'default', fontSize: '0.72rem' }}>{a}</span>)}
                      </div>
                    </div>
                  )}

                  {selectedVenue.rules && (
                    <div style={{ padding: '0.75rem 1rem', background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 'var(--r-sm)', fontSize: '0.82rem', color: 'var(--amber)' }}>
                      📋 <strong>Rules:</strong> {selectedVenue.rules}
                    </div>
                  )}
                </div>

                {/* Right: slot picker */}
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
                    {isGamingVenue(selectedVenue) ? 'Select Game & Time' : `Select ${selectedVenue.court_label || sport.courtLabel} & Time`}
                  </h3>

                  {/* Date picker */}
                  <div className="calendar-wrap mb-3">
                    <input type="date" className="form-input calendar-input"
                      value={selectedDate} min={days[0]} max={days[days.length - 1]}
                      onChange={e => { setSelectedDate(e.target.value); setSelectedSlots([]); setMyBookedKeys(new Set()); setGamingBooking(null) }} />
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '0.4rem' }}>
                      📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>

                  {isGamingVenue(selectedVenue) ? (
                    <>
                      <GamingBookingPanel
                        venue={selectedVenue}
                        selectedDate={selectedDate}
                        api={api}
                        profileId={profile?.id}
                        onBookingReady={(booking) => setGamingBooking(booking)}
                      />
                      {gamingBooking && (
                        <div className="payment-box mt-3">
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                            Booking Summary · {gamingBooking.slotCount} slot{gamingBooking.slotCount > 1 ? 's' : ''}
                          </div>
                          {gamingBooking.labels?.map((lbl, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-2)' }}>
                              <span>{lbl}</span>
                              <span>{formatCurrency(gamingBooking.price_per_slot)}</span>
                            </div>
                          ))}
                          {gamingBooking.game_name && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '0.3rem' }}>
                              🎮 {gamingBooking.game_name} · {gamingBooking.player_count}P
                            </div>
                          )}
                          <div className="payment-row" style={{ fontWeight: 700, marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            <span>Total</span>
                            <span className="payment-total">{formatCurrency(gamingBooking.price)}</span>
                          </div>
                          <button className="btn btn-primary btn-full btn-lg mt-2" onClick={openPayment}>
                            Proceed to Pay →
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <TimeSliderBookingPanel
                        venue={selectedVenue}
                        selectedDate={selectedDate}
                        selectedSlots={selectedSlots}
                        onSlotsChange={setSelectedSlots}
                        myBookedKeys={myBookedKeys}
                        api={api}
                      />

                  {selectedSlots.length > 0 && (
                    <div className="payment-box mt-3">
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                        Booking Summary
                      </div>
                      {selectedSlots.map((s, i) => {
                        const courtPrice = s.pricePerHour || getCourtByNumber(selectedVenue, s.courtNumber)?.price_per_hour || selectedVenue.price_per_hour
                        const slotDuration = s.durationMinutes || duration
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-2)' }}>
                            <span>{s.slotLabel}</span>
                            <span>{formatCurrency(courtPrice * (slotDuration / 60))}</span>
                          </div>
                        )
                      })}
                      <div className="payment-row" style={{ fontWeight: 700, marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                        <span>Total</span>
                        <span className="payment-total">{formatCurrency(selectedSlots.reduce((sum, s) => {
                          const cp = s.pricePerHour || getCourtByNumber(selectedVenue, s.courtNumber)?.price_per_hour || selectedVenue.price_per_hour
                          const slotDuration = s.durationMinutes || duration
                          return sum + cp * (slotDuration / 60)
                        }, 0))}</span>
                      </div>
                      <button className="btn btn-primary btn-full btn-lg mt-2" onClick={openPayment}>Proceed to Pay →</button>
                    </div>
                  )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── MY BOOKINGS ── */}
          {tab === 'bookings' && (
            <>
              <SectionHeader title="My Bookings" sub="All your sport venue reservations" />
              {userBookings.length === 0
                ? <EmptyState icon="🏟️" title="No bookings yet" text="Book a venue to get started!"
                    action={<button className="btn btn-primary" onClick={() => setTab('explore')}>Explore Venues</button>} />
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {userBookings.map(b => {
                      const sp = getSport(b.venues?.sport_type)
                      return (
                        <div key={b.id} className="card card-pad" style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', background: 'var(--bg-3)', flexShrink: 0 }}>
                            {sp.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{b.venues?.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 2 }}>
                              📅 {formatDateFull(b.booking_date)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 2 }}>
                              🕐 {b.slots_label?.join(' · ')}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                              Ref: <code style={{ background: 'var(--bg-3)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-2)' }}>{b.payment_ref}</code>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                              {(b.venues?.lat || b.venues?.city) && (
                                <a href={getNavUrl(b.venues)} target="_blank" rel="noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--blue)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', background: 'var(--blue-bg)', padding: '4px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--blue)' }}>
                                  🧭 Navigate
                                </a>
                              )}
                              <button
                                onClick={() => { setReviewModal({ venue: { id: b.venue_id, name: b.venues?.name }, bookingId: b.id }); setReviewStars(myReviews[b.venue_id] || 0) }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--amber)', fontSize: '0.75rem', fontWeight: 600, background: 'var(--amber-bg)', padding: '4px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--amber)', cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
                                {myReviews[b.venue_id] ? '✏️ Edit review' : '⭐ Rate venue'}
                              </button>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 800, color: 'var(--brand)', fontSize: '1.05rem' }}>{formatCurrency(b.total_amount)}</div>
                            <div style={{ marginTop: 6 }}><StatusBadge status={b.status} /></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </>
          )}

          {/* ── PROFILE ── */}
          {tab === 'profile' && (
            <>
              <SectionHeader title="My Profile" sub="Your account details" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', maxWidth: 900 }}>
                <div className="card">
                  <div className="card-pad">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#000' }}>
                        {(profile?.full_name || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{profile?.full_name}</div>
                        <span className="badge badge-green">Player</span>
                      </div>
                    </div>
                    {[
                      ['📞 Phone', profile?.phone || '—'],
                      ['🏙️ City', profile?.city || '—'],
                      ['📅 Member since', profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--text-3)' }}>{label}</span>
                        <span style={{ fontWeight: 600 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-pad">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                      <div style={{ fontWeight: 800, fontSize: '1rem' }}>Rabonna Coins</div>
                      <button className="btn btn-secondary btn-sm" onClick={() => setTab('wallet')}>Open Wallet</button>
                    </div>
                    {walletLoading ? (
                      <div style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Loading wallet…</div>
                    ) : walletError ? (
                      <div style={{ color: 'var(--red)', fontSize: '0.82rem', lineHeight: 1.5 }}>{walletError}</div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
                          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.8rem' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Available</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--amber)' }}>{Number(walletData?.balance?.available_rc || 0).toFixed(2)} RC</div>
                          </div>
                          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.8rem' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Value</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{formatCurrency(Number(walletData?.balance?.available_rc || 0) * 0.1)}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                          Level: <strong style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{walletData?.progress?.wallet_level || 'rookie'}</strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── WALLET ── */}
          {tab === 'wallet' && (
            <>
              <SectionHeader title="Rabonna Coins (RC)" sub="Earn, level up, and redeem on bookings" />

              {walletLoading && !walletData ? (
                <div className="card card-pad" style={{ color: 'var(--text-3)' }}>Loading wallet…</div>
              ) : walletError ? (
                <div className="card card-pad" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Wallet is not available yet</div>
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{walletError}</div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.8rem' }} onClick={() => fetchWallet()}>Retry</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="stat-grid">
                    <div className="stat-card">
                      <div className="stat-icon">🪙</div>
                      <div className="stat-num" style={{ color: 'var(--amber)' }}>{Number(walletData?.balance?.available_rc || 0).toFixed(2)}</div>
                      <div className="stat-label">Available RC</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">₹</div>
                      <div className="stat-num">{(Number(walletData?.balance?.available_rc || 0) * 0.1).toFixed(2)}</div>
                      <div className="stat-label">Current Value</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">🏆</div>
                      <div className="stat-num" style={{ textTransform: 'capitalize', fontSize: '1.4rem' }}>{walletData?.progress?.wallet_level || 'rookie'}</div>
                      <div className="stat-label">Current Level</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">🔥</div>
                      <div className="stat-num">{Number(walletData?.progress?.wallet_streak_days || 0)}</div>
                      <div className="stat-label">Streak Days</div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header"><div className="card-title">Account Progress</div></div>
                    <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Total Bookings</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{Number(walletData?.progress?.wallet_total_bookings || 0)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Earned RC</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--green)' }}>{Number(walletData?.progress?.wallet_total_rc_earned || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Spent RC</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{Number(walletData?.progress?.wallet_total_rc_spent || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Referral Code</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--blue)' }}>{walletData?.progress?.wallet_referral_code || '—'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header"><div className="card-title">Missions</div></div>
                    <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      {(walletData?.missions || []).length === 0 ? (
                        <div style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No missions available yet.</div>
                      ) : (
                        (walletData?.missions || []).map(m => {
                          const target = Number(m.target_count || 1)
                          const progress = Math.min(Number(m.progress_count || 0), target)
                          const pct = Math.max(0, Math.min(100, Math.round((progress / target) * 100)))
                          return (
                            <div key={`${m.id}-${m.effective_period_start}`} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.8rem', background: 'var(--bg-3)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{m.title}</div>
                                  <div style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>{m.description}</div>
                                </div>
                                <div style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>+{Number(m.rc_reward || 0).toFixed(0)} RC</div>
                              </div>
                              <div style={{ marginTop: '0.55rem', height: 7, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: m.completed_at ? 'var(--brand)' : 'var(--blue)' }} />
                              </div>
                              <div style={{ marginTop: '0.4rem', fontSize: '0.74rem', color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{progress}/{target}</span>
                                <span>{m.completed_at ? 'Completed' : 'In progress'}</span>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header"><div className="card-title">Recent Transactions</div></div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>RC</th>
                            <th>Remaining</th>
                            <th>Expiry</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(walletData?.transactions || []).length === 0 ? (
                            <tr><td colSpan={5} style={{ color: 'var(--text-3)' }}>No wallet transactions yet.</td></tr>
                          ) : (
                            (walletData?.transactions || []).map(tx => (
                              <tr key={tx.id}>
                                <td style={{ textTransform: 'capitalize' }}>{String(tx.transaction_type || '').replaceAll('_', ' ')}</td>
                                <td style={{ color: tx.transaction_type === 'redemption' ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                                  {tx.transaction_type === 'redemption' ? '-' : '+'}{Number(tx.rc_amount || 0).toFixed(2)}
                                </td>
                                <td>{Number(tx.remaining_rc || 0).toFixed(2)}</td>
                                <td>{tx.expires_at ? new Date(tx.expires_at).toLocaleDateString('en-IN') : '—'}</td>
                                <td>{tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-IN') : '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <Footer />

      {/* ── PAYMENT MODAL ── */}
      {bookingModal && fees && (
        <Modal title="Confirm Booking" onClose={() => setBookingModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setBookingModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={paying} onClick={confirmPayment}>
                {paying ? <span className="inline-spinner" style={{ borderTopColor: '#000' }} /> : null}
                {paying ? 'Processing…' : `Pay ${formatCurrency(fees.total)} →`}
              </button>
            </>
          }>
          <div className="card card-pad mb-3" style={{ background: 'var(--bg-3)' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{bookingModal.venue.name}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>📅 {formatDateFull(bookingModal.date)}</div>
            {bookingModal.isGaming ? (
              <>
                {bookingModal.gamingBooking.labels?.map((lbl, i) => (
                  <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 3 }}>🎮 {lbl}</div>
                ))}
                {bookingModal.gamingBooking.game_name && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 3 }}>{bookingModal.gamingBooking.game_name} · {bookingModal.gamingBooking.player_count}P</div>
                )}
              </>
            ) : (
              bookingModal.slots.map((s, i) => (
                <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 3 }}>🏟️ {s.slotLabel}</div>
              ))
            )}
          </div>
          <div className="payment-box">
            {bookingModal.isGaming ? (
              <>
                {bookingModal.gamingBooking.labels?.map((lbl, i) => (
                  <div key={i} className="payment-row" style={{ fontSize: '0.82rem' }}>
                    <span>{lbl}</span>
                    <span>{formatCurrency(bookingModal.gamingBooking.price_per_slot)}</span>
                  </div>
                ))}
              </>
            ) : (
              bookingModal.slots.map((s, i) => {
                const cp = s.pricePerHour || bookingModal.venue.price_per_hour
                const dur = s.durationMinutes || bookingModal.venue.slot_duration_minutes || 60
                return (
                  <div key={i} className="payment-row" style={{ fontSize: '0.82rem' }}>
                    <span>{s.slotLabel}</span>
                    <span>{formatCurrency(cp * (dur / 60))}</span>
                  </div>
                )
              })
            )}
            <div className="payment-row" style={{ fontWeight: 700 }}><span>Total</span><span className="payment-total">{formatCurrency(fees.total)}</span></div>
          </div>
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#2d6af5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>Pay with Razorpay</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>UPI · Cards · Net Banking · Wallets</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                {['UPI', 'VISA', 'MC'].map(m => (
                  <span key={m} style={{ fontSize: '0.6rem', fontWeight: 800, border: '1px solid var(--border-2)', borderRadius: 3, padding: '1px 5px', color: 'var(--text-3)' }}>{m}</span>
                ))}
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>🔒 256-bit SSL encrypted · PCI-DSS compliant</div>
          </div>
        </Modal>
      )}

      {/* ── SUCCESS MODAL ── */}
      {successBooking && (
        <Modal title="" onClose={() => setSuccessBooking(null)} maxWidth={440}>
          <div className="success-screen">
            <span className="success-icon">🎉</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Booking Confirmed!</div>
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>You're all set for your game.</p>
            <div className="card card-pad" style={{ textAlign: 'left' }}>
              {(successBooking.gaming ? [
                ['Venue',       successBooking.venues?.name],
                ['Date',        formatDateFull(successBooking.booking_date)],
                ['Game',        successBooking.gaming.game_name || successBooking.gaming.setup_type],
                ['Slots',       `${successBooking.gaming.slot_count} slot${successBooking.gaming.slot_count > 1 ? 's' : ''}`],
                ['Players',     `${successBooking.gaming.player_count}`],
                ['Reference',   successBooking.payment_ref],
                ['Total Paid',  formatCurrency(successBooking.total_amount)],
              ] : [
                ['Venue',      successBooking.venues?.name],
                ['Date',       formatDateFull(successBooking.booking_date)],
                ['Slots',      successBooking.slots_label?.join(' · ')],
                ['Reference',  successBooking.payment_ref],
                ['Total Paid', formatCurrency(successBooking.total_amount)],
              ]).map(([k, v]) => (
                <div key={k} className="payment-row" style={{ fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-3)' }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <a href={getNavUrl(successBooking.venues)} target="_blank" rel="noreferrer"
              className="btn btn-full mt-2"
              style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue)', textDecoration: 'none', justifyContent: 'center' }}>
              🧭 Get Directions to Venue
            </a>
            <button className="btn btn-primary btn-full mt-2" onClick={() => { setSuccessBooking(null); setTab('bookings') }}>
              View My Bookings →
            </button>
          </div>
        </Modal>
      )}

      {/* ── REVIEW MODAL ── */}
      {reviewModal && (
        <Modal title={`Rate: ${reviewModal.venue.name}`} onClose={() => setReviewModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setReviewModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!reviewStars || submittingReview} onClick={submitReview}>
                {submittingReview ? <span className="inline-spinner" style={{ borderTopColor: '#000' }} /> : null}
                {submittingReview ? 'Submitting…' : 'Submit Rating'}
              </button>
            </>
          }>
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: '1.25rem' }}>
              {myReviews[reviewModal.venue.id] ? `Your current rating: ${myReviews[reviewModal.venue.id]} ★ — tap to change` : 'Tap a star to rate this venue'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <StarPicker value={reviewStars} onChange={setReviewStars} />
            </div>
            {reviewStars > 0 && (
              <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-2)', fontWeight: 600 }}>
                {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][reviewStars]} — {reviewStars} star{reviewStars > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </Modal>
      )}

      <ToastContainer toasts={toast.toasts} />
    </div>
  )
}
