import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import Footer from '../components/Footer'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { PhotoCarousel, StarDisplay, TimeSliderBookingPanel } from '../components/VenueComponents'
import { GamingBookingPanel } from '../components/GamingComponents'
import { Modal, ToastContainer } from '../components/UI'
import {
  getSport, getNextDays, formatDateFull, formatCurrency,
  calcFeesFromSlots, generatePaymentRef, calcDistance,
  todayIST, isGamingVenue, getGamingSetup,
  getVenueCourts, getCourtByNumber, getLowestPrice, getVenueSports
} from '../lib/constants'

export default function VenueDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, profile, api } = useAuth()
  const toast = useToast()

  const [venue, setVenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Booking state
  const days = getNextDays(7)
  const [selectedDate, setSelectedDate] = useState(todayIST())
  const [selectedSlots, setSelectedSlots] = useState([])
  const [myBookedKeys, setMyBookedKeys] = useState(new Set())

  // Payment state
  const [bookingModal, setBookingModal] = useState(null)
  const [successBooking, setSuccessBooking] = useState(null)
  const [paying, setPaying] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [coinState, setCoinState] = useState({ loading: false, appliedRc: 0, appliedInr: 0, error: '' })
  const finalizedCoinRequestsRef = useRef(new Set())

  // Gaming booking state
  const [gamingBooking, setGamingBooking] = useState(null)

  // GPS
  const [userLocation, setUserLocation] = useState(null)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}
    )
  }, [])

  /* ── Fetch venue (public) ── */
  useEffect(() => {
    setLoading(true)
    fetch(`/api/venues/${id}/public`)
      .then(r => { if (!r.ok) throw new Error('Venue not found'); return r.json() })
      .then(data => setVenue(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  /* ── Fetch user's booked slots (only when authenticated) ── */
  useEffect(() => {
    if (!venue || !selectedDate || !profile) { setMyBookedKeys(new Set()); return }
    ;(async () => {
      try {
        const keys = await api.get(`/bookings/my-slots?venue_id=${venue.id}&date=${selectedDate}`)
        setMyBookedKeys(new Set(keys || []))
      } catch { setMyBookedKeys(new Set()) }
    })()
  }, [venue, selectedDate, profile, api])

  useEffect(() => {
    if (!bookingModal?.walletRequestId || !session) {
      setCoinState({ loading: false, appliedRc: 0, appliedInr: 0, error: '' })
      return
    }

    let cancelled = false
    const requestId = bookingModal.walletRequestId
    const bookingAmountInr = bookingModal.isGaming
      ? Number(bookingModal.gamingBooking?.price || 0)
      : Number(calcFeesFromSlots(
        bookingModal.slots,
        bookingModal.venue,
        bookingModal.venue.slot_duration_minutes || 60,
      ).total || 0)

    setCoinState(prev => ({ ...prev, loading: true, error: '' }))
    ;(async () => {
      try {
        const redemption = await api.post('/wallet/apply-coins', {
          booking_amount_inr: bookingAmountInr,
          request_id: requestId,
        })
        if (cancelled) return
        setCoinState({
          loading: false,
          appliedRc: Number(redemption?.applied_rc || 0),
          appliedInr: Number(redemption?.applied_inr || 0),
          error: '',
        })
      } catch (err) {
        if (cancelled) return
        setCoinState({
          loading: false,
          appliedRc: 0,
          appliedInr: 0,
          error: err.message || 'Unable to apply Rabonna Coins right now.',
        })
      }
    })()

    return () => {
      cancelled = true
      if (finalizedCoinRequestsRef.current.has(requestId)) return
      api.post('/wallet/release-coins', { request_id: requestId }).catch(() => {})
    }
  }, [bookingModal, session, api])

  /* ── Derived values ── */
  const sport    = getSport(venue?.sport_type)
  const duration = venue?.slot_duration_minutes || 60
  const fees     = bookingModal
    ? bookingModal.isGaming
      ? { subtotal: bookingModal.gamingBooking.price, fee: 0, total: bookingModal.gamingBooking.price }
      : calcFeesFromSlots(bookingModal.slots, bookingModal.venue, bookingModal.venue.slot_duration_minutes || 60)
    : null

  const getNavUrl = v => v?.lat && v?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent((v?.name || '') + ' ' + (v?.city || ''))}`

  function buildWalletRequestId(kind = 'booking') {
    const rand = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    return `${kind}:${id}:${rand}`
  }

  async function precheckRegularBooking(v, date, slots) {
    await api.post('/bookings/precheck', {
      venue_id: v.id,
      date,
      slots: slots.map(s => ({
        courtNumber: s.courtNumber || 1,
        slotStartMinutes: s.slotStartMinutes,
        durationMinutes: s.durationMinutes || v.slot_duration_minutes || 60,
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

  /* ── Payment flow ── */
  async function openPayment() {
    // Gaming venue payment
    if (isGamingVenue(venue) && gamingBooking) {
      if (!session) { setShowLoginPrompt(true); return }
      try {
        await precheckGamingBooking(gamingBooking)
        setBookingModal({
          venue,
          date: gamingBooking.date,
          isGaming: true,
          gamingBooking,
          walletRequestId: buildWalletRequestId('gaming'),
        })
      } catch (err) {
        toast.show(err.message || 'Slot unavailable now. Please pick another time.', 'error')
      }
      return
    }
    if (!selectedSlots.length) { toast.show('Select at least one slot', 'error'); return }
    if (!session) { setShowLoginPrompt(true); return }
    try {
      await precheckRegularBooking(venue, selectedDate, selectedSlots)
      setBookingModal({
        venue,
        date: selectedDate,
        slots: [...selectedSlots],
        walletRequestId: buildWalletRequestId('regular'),
      })
    } catch (err) {
      toast.show(err.message || 'Slot unavailable now. Please pick another time.', 'error')
    }
  }

  async function saveBookingAfterPayment(paymentId, snap) {
    const { venue: v, date, slots: bookedSlots } = snap
    const dur = v.slot_duration_minutes || 60
    const f = calcFeesFromSlots(bookedSlots, v, dur)
    const payRef = paymentId || generatePaymentRef()

    const booking = await api.post('/bookings', {
      venue_id: v.id,
      date,
      slots: bookedSlots.map(s => ({
        courtNumber: s.courtNumber || 1,
        slotStartMinutes: s.slotStartMinutes,
        slotLabel: s.slotLabel,
        durationMinutes: s.durationMinutes || dur,
        pricePerHour: s.pricePerHour || v.price_per_hour,
      })),
      slots_label: bookedSlots.map(s => s.slotLabel),
      subtotal: f.subtotal,
      platform_fee: f.fee,
      total_amount: f.total,
      payment_ref: payRef,
      wallet_request_id: snap.walletRequestId,
    })
    return booking
  }

  async function saveGamingBooking(paymentId, snap) {
    const gb = snap.gamingBooking
    const payRef = paymentId || generatePaymentRef()
    const booking = await api.post('/gaming/book', {
      venue_id: gb.venue_id,
      date: gb.date,
      setup_type: gb.setup_type,
      game_id: gb.game_id,
      player_count: gb.player_count,
      slot_start_minutes_list: gb.slot_start_minutes_list,
      payment_ref: payRef,
      wallet_request_id: snap.walletRequestId,
    })
    return booking
  }

  async function confirmPayment() {
    if (!bookingModal) return
    const snap = bookingModal
    const isGaming = snap.isGaming
    const f = isGaming
      ? { subtotal: snap.gamingBooking.price, fee: 0, total: snap.gamingBooking.price }
      : calcFeesFromSlots(snap.slots, snap.venue, snap.venue.slot_duration_minutes || 60)
    const payableTotal = Math.max(Number(f.total || 0) - Number(coinState.appliedInr || 0), 0)

    if (coinState.loading) {
      toast.show('Applying Rabonna Coins. Please wait a moment.', 'error')
      return
    }

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
      // Simulated payment (no key configured)
      try {
        let booking
        if (isGaming) {
          booking = await saveGamingBooking(generatePaymentRef(), snap)
        } else {
          booking = await saveBookingAfterPayment(generatePaymentRef(), snap)
          const bookedKeys = snap.slots.map(s => `${s.courtNumber || 1}:${s.slotStartMinutes}`)
          setMyBookedKeys(prev => new Set([...prev, ...bookedKeys]))
        }
        if (snap.walletRequestId) finalizedCoinRequestsRef.current.add(snap.walletRequestId)
        setBookingModal(null); setSelectedSlots([]); setGamingBooking(null)
        setSuccessBooking(booking)
        toast.show('Booking confirmed! 🎉', 'success')
      } catch (err) {
        toast.show(err.message || 'Booking failed', 'error')
      } finally { setPaying(false) }
      return
    }

    // Load Razorpay SDK
    if (!window.Razorpay) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = res; s.onerror = () => rej(new Error('Failed to load Razorpay'))
          document.head.appendChild(s)
        })
      } catch {
        toast.show('Could not load payment gateway.', 'error')
        setPaying(false); return
      }
    }

    const options = {
      key: razorpayKey,
      amount: Math.round(payableTotal * 100),
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
          if (snap.walletRequestId) finalizedCoinRequestsRef.current.add(snap.walletRequestId)
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
      toast.show(resp.error?.description || 'Payment failed.', 'error')
      setPaying(false)
    })
    rzp.open()
  }

  /* ── Loading / Error states ── */
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="spinner" />
      <span style={{ color: 'var(--text-3)', fontSize: '0.9rem' }}>Loading venue...</span>
    </div>
  )

  if (error || !venue) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ fontSize: '3rem' }}>🏟️</div>
      <h2 style={{ fontWeight: 800 }}>Venue not found</h2>
      <p style={{ color: 'var(--text-3)' }}>{error || 'This venue may not exist or is not available.'}</p>
      <button className="btn btn-primary" onClick={() => navigate('/search')}>Browse Venues</button>
    </div>
  )

  /* ── Derived display values ── */
  const venueCourts   = getVenueCourts(venue)
  const venueSports   = getVenueSports(venue)
  const lowestPrice   = getLowestPrice(venue)
  const hasDiffPrices = venueCourts.length > 1 && !venueCourts.every(c => c.price_per_hour === venueCourts[0].price_per_hour)

  return (
    <div className="pub-venue-page">
      {/* ── NAV ── */}
      <nav className="lv2-nav">
        <div className="lv2-nav-inner">
          <div className="lv2-nav-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <Logo height={32} />
          </div>
          <div className="lv2-nav-center">
            <button className="lv2-nav-pill" onClick={() => navigate('/search')}>Search</button>
            <button className="lv2-nav-pill" onClick={() => navigate('/search')}>Sports</button>
            <button className="lv2-nav-pill" onClick={() => navigate(session ? '/play' : '/play')}>Profile</button>
          </div>
          <button className="lv2-nav-signup" onClick={() => navigate('/play')}>
            {session ? 'Dashboard' : 'Sign Up'}
          </button>
        </div>
      </nav>

      {/* ── BACK LINK ── */}
      <div className="pub-venue-container">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}
          style={{ marginBottom: '1rem' }}>
          ← Back
        </button>

        {/* ── VENUE DETAIL GRID (same layout as UserDashboard) ── */}
        <div className="venue-detail-grid">
          {/* Left column: venue info */}
          <div>
            <PhotoCarousel images={venue.images} sportHeroClass={sport.heroClass} sportIcon={sport.icon} />

            <div style={{ marginBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.3rem' }}>{venue.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <StarDisplay rating={venue.rating} count={venue.total_reviews} size={16} />
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>📍 {venue.address}, {venue.city}</p>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {userLocation && venue.lat && venue.lng && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                  🗺 {calcDistance(userLocation.lat, userLocation.lng, venue.lat, venue.lng)} km away
                </div>
              )}
              <a href={getNavUrl(venue)} target="_blank" rel="noreferrer" className="btn btn-sm"
                style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                🧭 Navigate on Google Maps
              </a>
            </div>

            {venue.description && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '1rem' }}>{venue.description}</p>
            )}

            {/* Info grid */}
            <div className="grid-2" style={{ gap: '0.6rem', marginBottom: '1rem' }}>
              {(isGamingVenue(venue) ? [
                ['Category', '🎮 Gaming'],
                ['Setups', (venue.gaming_config?.setups || []).map(s => {
                  const types = { ps5: '🎮 PS5', car_racing: '🏎️ Racing', ps_vr2: '🥽 VR' }
                  return types[s.setup_type] || s.setup_type
                }).join(', ') || 'Gaming'],
                ['Consoles', (venue.gaming_config?.consoles || []).length + ' units'],
                ['Games', (venue.gaming_config?.games || []).length + ' available'],
              ] : [
                ['Price', hasDiffPrices ? `From ${formatCurrency(lowestPrice)}/hr` : formatCurrency(lowestPrice) + '/hr'],
                ['Slot', `${duration}min`],
                ['Sports', venueSports.map(s => s.icon + ' ' + s.label).join(', ') || (sport.icon + ' ' + sport.label)],
                [(venue.court_label || sport.courtLabel || 'Court') + 's', `${venue.num_courts || 1} available`],
              ]).map(([label, val]) => (
                <div key={label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ fontWeight: 700, marginTop: 3, fontSize: '0.9rem' }}>{val}</div>
                </div>
              ))}
            </div>

            {venue.amenities?.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Amenities</div>
                <div className="filter-row">
                  {venue.amenities.map(a => <span key={a} className="chip" style={{ cursor: 'default', fontSize: '0.72rem' }}>{a}</span>)}
                </div>
              </div>
            )}

            {venue.rules && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 'var(--r-sm)', fontSize: '0.82rem', color: 'var(--amber)' }}>
                📋 <strong>Rules:</strong> {venue.rules}
              </div>
            )}
          </div>

          {/* Right column: slot picker & booking */}
          <div>
            <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
              {isGamingVenue(venue) ? 'Select Setup & Time' : `Select ${venue.court_label || sport.courtLabel} & Time`}
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

            {/* Gaming booking panel */}
            {isGamingVenue(venue) ? (
              <>
                <GamingBookingPanel
                  venue={venue}
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
                      {session ? 'Proceed to Pay →' : 'Sign Up to Book →'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <TimeSliderBookingPanel
                  venue={venue}
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
                      const courtPrice = s.pricePerHour || getCourtByNumber(venue, s.courtNumber)?.price_per_hour || venue.price_per_hour
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
                        const cp = s.pricePerHour || getCourtByNumber(venue, s.courtNumber)?.price_per_hour || venue.price_per_hour
                        const slotDuration = s.durationMinutes || duration
                        return sum + cp * (slotDuration / 60)
                      }, 0))}</span>
                    </div>
                    <button className="btn btn-primary btn-full btn-lg mt-2" onClick={openPayment}>
                      {session ? 'Proceed to Pay →' : 'Sign Up to Book →'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── LOGIN PROMPT MODAL ── */}
      {showLoginPrompt && (
        <Modal title="" onClose={() => setShowLoginPrompt(false)} maxWidth={420}>
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Sign in to complete your booking</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Create a free account or log in to book your slots and make payment.
            </p>
            <button className="btn btn-primary btn-lg btn-full" style={{ marginBottom: '0.75rem' }}
              onClick={() => navigate('/play')}>
              Sign Up / Log In
            </button>
            <button className="btn btn-ghost btn-full" onClick={() => setShowLoginPrompt(false)}>
              Continue Browsing
            </button>
          </div>
        </Modal>
      )}

      {/* ── PAYMENT MODAL ── */}
      {bookingModal && fees && (
        <Modal title="Confirm Booking" onClose={() => setBookingModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setBookingModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={paying} onClick={confirmPayment}>
                {paying ? <span className="inline-spinner" style={{ borderTopColor: '#000' }} /> : null}
                {paying ? 'Processing…' : `Pay ${formatCurrency(Math.max(fees.total - coinState.appliedInr, 0))} →`}
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
            {coinState.loading ? (
              <div className="payment-row" style={{ color: 'var(--text-3)' }}>
                <span>Rabonna Coins</span>
                <span>Applying…</span>
              </div>
            ) : coinState.appliedRc > 0 ? (
              <div className="payment-row" style={{ color: 'var(--green)', fontWeight: 700 }}>
                <span>Rabonna Coins ({coinState.appliedRc.toFixed(2)} RC)</span>
                <span>-{formatCurrency(coinState.appliedInr)}</span>
              </div>
            ) : null}
            <div className="payment-row" style={{ fontWeight: 700 }}><span>Total</span><span className="payment-total">{formatCurrency(fees.total)}</span></div>
            {coinState.appliedInr > 0 && (
              <div className="payment-row" style={{ fontWeight: 800 }}><span>Payable Now</span><span className="payment-total">{formatCurrency(Math.max(fees.total - coinState.appliedInr, 0))}</span></div>
            )}
          </div>
          {coinState.error && (
            <div style={{ marginTop: '0.75rem', color: 'var(--red)', fontSize: '0.8rem' }}>{coinState.error}</div>
          )}
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
                ['Venue',       successBooking.venues?.name || venue.name],
                ['Date',        formatDateFull(successBooking.booking_date)],
                ['Game',        successBooking.gaming.game_name || getGamingSetup(successBooking.gaming.setup_type)?.label || successBooking.gaming.setup_type],
                ['Slots',       `${successBooking.gaming.slot_count} slot${successBooking.gaming.slot_count > 1 ? 's' : ''}`],
                ['Players',     `${successBooking.gaming.player_count}`],
                ['Reference',   successBooking.payment_ref],
                ['Total Paid',  formatCurrency(successBooking.total_amount)],
              ] : [
                ['Venue',      successBooking.venues?.name || venue.name],
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
            <a href={getNavUrl(venue)} target="_blank" rel="noreferrer"
              className="btn btn-full mt-2"
              style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue)', textDecoration: 'none', justifyContent: 'center' }}>
              🧭 Get Directions to Venue
            </a>
            <button className="btn btn-primary btn-full mt-2" onClick={() => navigate('/play')}>
              Go to Dashboard →
            </button>
          </div>
        </Modal>
      )}

      <Footer />
      <ToastContainer toasts={toast.toasts} />
    </div>
  )
}
