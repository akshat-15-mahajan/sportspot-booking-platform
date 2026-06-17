import { useState, useEffect } from 'react'
import {
  getSport, generateVenueSlots,
  todayIST, nowMinutesIST,
  getVenueCourts, getCourtByNumber
} from '../lib/constants'

function roundUpToQuarter(mins) {
  return Math.ceil(mins / 15) * 15
}

function buildRulerMarks(minMins, maxMins, preferredStep = 30) {
  if (!Number.isFinite(minMins) || !Number.isFinite(maxMins) || maxMins <= minMins) {
    return [{ minutes: minMins, isMajor: true }]
  }
  const span = maxMins - minMins
  const step = span > 8 * 60 ? 60 : preferredStep
  const marks = []
  for (let t = minMins; t <= maxMins; t += step) {
    marks.push({ minutes: t, isMajor: t % 60 === 0 })
  }
  if (marks[marks.length - 1]?.minutes !== maxMins) {
    marks.push({ minutes: maxMins, isMajor: true })
  }
  return marks
}

// ── STAR DISPLAY ──────────────────────────────────────────────
export function StarDisplay({ rating, count, size = 14 }) {
  const filled = Math.round(rating || 0)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {[1,2,3,4,5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24"
          fill={s <= filled ? '#FFB830' : 'none'}
          stroke={s <= filled ? '#FFB830' : '#555'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
      {count !== undefined && (
        <span style={{ fontSize: size * 0.85, color: 'var(--text-3)', marginLeft: 2 }}>
          {rating > 0 ? `${Number(rating).toFixed(1)} (${count})` : `(${count} reviews)`}
        </span>
      )}
    </span>
  )
}

// ── STAR PICKER ───────────────────────────────────────────────
export function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1,2,3,4,5].map(s => (
        <button key={s} type="button"
          onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
          <svg width={32} height={32} viewBox="0 0 24 24"
            fill={(hovered || value) >= s ? '#FFB830' : 'none'}
            stroke={(hovered || value) >= s ? '#FFB830' : '#555'} strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ── PHOTO CAROUSEL ────────────────────────────────────────────
export function PhotoCarousel({ images, sportHeroClass, sportIcon }) {
  const [cur, setCur] = useState(0)
  if (!images?.length) {
    return (
      <div className={`venue-card-hero ${sportHeroClass}`}
        style={{ height: 220, borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6rem', marginBottom: '1.25rem' }}>
        {sportIcon}
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', height: 220, borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: '1.25rem', background: 'var(--bg-3)' }}>
      <img src={images[cur]} alt="Venue" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {images.length > 1 && (
        <>
          <button onClick={() => setCur(p => (p - 1 + images.length) % images.length)}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => setCur(p => (p + 1) % images.length)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
            {images.map((_, i) => (
              <div key={i} onClick={() => setCur(i)}
                style={{ width: i === cur ? 18 : 6, height: 6, borderRadius: 3, background: i === cur ? 'var(--brand)' : 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 0.2s' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── SLOT PICKER PANEL ────────────────────────────────────────
// Shared between UserDashboard and public VenueDetail.
// `api` can be the authenticated client or a plain fetch wrapper.
export function SlotPickerPanel({ venue, selectedDate, selectedSlots, onSlotsChange, profileId, myBookedKeys, api }) {
  const [activeCourt, setActiveCourt] = useState(1)
  const [slotData, setSlotData]       = useState({})
  const [loading, setLoading]         = useState(false)

  const numCourts     = venue.num_courts   || 1
  const courtLabel    = venue.court_label  || getSport(venue.sport_type).courtLabel || 'Court'
  const venueCourts   = getVenueCourts(venue)
  const openTime      = venue.open_time    ?? 6
  const closeTime     = venue.close_time   ?? 22
  const duration      = venue.slot_duration_minutes || 60
  const templateSlots = generateVenueSlots(openTime, closeTime, duration)

  useEffect(() => {
    if (!selectedDate) return
    setLoading(true)

    const buildMap = (rows) => {
      const map = {}
      ;(rows || []).forEach(s => {
        const mins  = s.slot_start_minutes ?? (s.hour_start != null ? s.hour_start * 60 : null)
        const court = s.court_number ?? 1
        if (mins != null) map[`${court}:${mins}`] = s
      })
      setSlotData(map)
      setLoading(false)
    }

    const fetchSlots = () => {
      if (api) {
        api.get(`/slots?venue_id=${venue.id}&date=${selectedDate}`)
          .then(data => buildMap(data))
          .catch(() => setLoading(false))
      } else {
        fetch(`/api/slots?venue_id=${venue.id}&date=${selectedDate}`)
          .then(r => r.json())
          .then(data => buildMap(data))
          .catch(() => setLoading(false))
      }
    }

    fetchSlots()
    const interval = setInterval(fetchSlots, 5000)
    return () => clearInterval(interval)
  }, [venue.id, selectedDate, api])

  const isSelected = (courtNum, mins) =>
    selectedSlots.some(s => s.courtNumber === courtNum && s.slotStartMinutes === mins)

  function toggleSlot(courtNum, tSlot) {
    const key    = `${courtNum}:${tSlot.slotStartMinutes}`
    const dbRow  = slotData[key]
    const status = dbRow?.status || 'available'
    const booked = dbRow?.booked_count ?? 0
    const total  = dbRow?.total_capacity ?? 1

    const today = todayIST()
    if (selectedDate < today) return
    if (selectedDate === today) {
      const nowMins = nowMinutesIST()
      if (tSlot.slotStartMinutes + duration < nowMins) return
    }
    if (status === 'blocked') return
    if (myBookedKeys.has(key)) return
    if (booked >= total) return

    const sel = isSelected(courtNum, tSlot.slotStartMinutes)
    if (sel) {
      onSlotsChange(selectedSlots.filter(s =>
        !(s.courtNumber === courtNum && s.slotStartMinutes === tSlot.slotStartMinutes)
      ))
    } else {
      const courtInfo = getCourtByNumber(venue, courtNum)
      onSlotsChange([...selectedSlots, {
        courtNumber:      courtNum,
        slotStartMinutes: tSlot.slotStartMinutes,
        slotLabel:        numCourts > 1 ? `${courtInfo?.name || courtLabel + ' ' + courtNum} · ${tSlot.label}` : tSlot.label,
        existingId:       dbRow?.id || null,
        totalCapacity:    total,
        bookedCount:      booked,
        durationMinutes:  duration,
        pricePerHour:     courtInfo?.price_per_hour || venue.price_per_hour,
      }])
    }
  }

  return (
    <div>
      {numCourts > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {venueCourts.map(c => (
            <button key={c.number} onClick={() => setActiveCourt(c.number)}
              style={{
                padding: '6px 16px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                fontFamily: "'Sora', sans-serif", fontSize: '0.82rem', transition: 'all 0.15s',
                border:      `1.5px solid ${activeCourt === c.number ? 'var(--brand)' : 'var(--border-2)'}`,
                background:  activeCourt === c.number ? 'var(--green-bg)' : 'var(--bg-3)',
                color:       activeCourt === c.number ? 'var(--brand)' : 'var(--text-3)',
                fontWeight:  activeCourt === c.number ? 700 : 500,
              }}>
              {(c.sport_types || [c.sport_type]).map(sk => getSport(sk).icon).join(' ')} {c.name}
              {c.price_per_hour ? <span style={{ fontSize: '0.68rem', opacity: 0.7, marginLeft: 4 }}>₹{c.price_per_hour}/hr</span> : null}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--text-3)', flexWrap: 'wrap' }}>
        <span>⬜ Available</span>
        <span style={{ color: 'var(--brand)' }}>🟩 Selected</span>
        <span style={{ color: 'var(--amber)' }}>🟧 Limited spots</span>
        <span style={{ opacity: 0.55 }}>⬛ Not available</span>
        <span style={{ color: 'var(--blue)' }}>🔵 Your booking</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
      ) : (
        <div className="slot-grid">
          {templateSlots.map(tSlot => {
            const key       = `${activeCourt}:${tSlot.slotStartMinutes}`
            const dbRow     = slotData[key]
            const status    = dbRow?.status || 'available'
            const bookedCnt = dbRow?.booked_count ?? 0
            const totalCap  = dbRow?.total_capacity ?? 1
            const available = Math.max(0, totalCap - bookedCnt)
            const isMine    = myBookedKeys.has(key)
            const sel       = isSelected(activeCourt, tSlot.slotStartMinutes)

            const today    = todayIST()
            const nowMins  = nowMinutesIST()
            const slotEnd  = tSlot.slotStartMinutes + duration
            const isPast   = selectedDate < today || (selectedDate === today && slotEnd < nowMins)

            let cls = 'slot slot-available'
            let sublabel = null

            if (isPast) {
              cls = 'slot slot-unavailable'
              sublabel = 'Past'
            } else if (isMine) {
              cls = 'slot slot-mine'
              sublabel = 'Your booking'
            } else if (status === 'blocked' || bookedCnt >= totalCap) {
              cls = 'slot slot-unavailable'
              sublabel = 'Not available'
            } else if (sel) {
              cls = 'slot slot-selected'
            } else if (bookedCnt > 0 && available > 0) {
              cls = 'slot slot-partial'
              sublabel = `${available} of ${totalCap} left`
            }

            return (
              <div key={key} className={cls}
                onClick={() => toggleSlot(activeCourt, tSlot)}
                style={{ cursor: isPast || isMine || status === 'blocked' || bookedCnt >= totalCap ? 'default' : 'pointer' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{tSlot.label}</div>
                {sublabel && <div style={{ fontSize: '0.6rem', marginTop: 2, opacity: 0.85 }}>{sublabel}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── TIME SLIDER BOOKING PANEL ───────────────────────────────
// Replaces slot grid selection on user side for non-gaming venues.
// - start time in 15 min intervals
// - duration in multiples of venue slot duration
// - past times disabled
// - overlaps with booked/blocked ranges are unbookable
export function TimeSliderBookingPanel({ venue, selectedDate, selectedSlots, onSlotsChange, myBookedKeys, api }) {
  const [activeCourt, setActiveCourt] = useState(1)
  const [slotRows, setSlotRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [startMinutes, setStartMinutes] = useState(null)
  const [durationMinutes, setDurationMinutes] = useState(venue.slot_duration_minutes || 60)
  const [draggingStart, setDraggingStart] = useState(false)

  const numCourts = venue.num_courts || 1
  const venueCourts = getVenueCourts(venue)
  const openMinutes = (venue.open_time ?? 6) * 60
  const closeMinutes = (venue.close_time ?? 22) * 60
  const baseDuration = venue.slot_duration_minutes || 60

  useEffect(() => {
    setDurationMinutes(baseDuration)
  }, [baseDuration, venue.id])

  useEffect(() => {
    setLoading(true)
    const fetchSlots = () => {
      const url = `/slots?venue_id=${venue.id}&date=${selectedDate}`
      const req = api ? api.get(url) : fetch(`/api${url}`).then(r => r.json())
      req
        .then(rows => setSlotRows(rows || []))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
    fetchSlots()
    const timer = setInterval(fetchSlots, 5000)
    return () => clearInterval(timer)
  }, [venue.id, selectedDate, api])

  const today = todayIST()
  const nowMins = nowMinutesIST()
  const isToday = selectedDate === today
  const earliestAllowed = Math.max(openMinutes, isToday ? roundUpToQuarter(nowMins) : openMinutes)

  const maxDurationForStart = Math.max(0, closeMinutes - (startMinutes ?? earliestAllowed))
  const durationOptions = []
  for (let d = baseDuration; d <= maxDurationForStart; d += baseDuration) {
    durationOptions.push(d)
  }

  const maxStart = closeMinutes - durationMinutes
  const hasWindow = earliestAllowed <= maxStart

  const isUnavailableAtRange = (start, dur) => {
    if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return true
    const end = start + dur
    if (start < earliestAllowed || end > closeMinutes) return true

    const overlapsAtRange = courtRows.filter(r => {
      const rowStart = Number(r.slot_start_minutes)
      const rowDuration = Number(r.slot_duration_minutes || 60)
      if (!Number.isFinite(rowStart) || !Number.isFinite(rowDuration)) return false
      const rowEnd = rowStart + rowDuration
      return rowStart < end && rowEnd > start
    })

    const hasBlocked = overlapsAtRange.some(r => r.status === 'blocked')
    const hasBooked = overlapsAtRange.some(r => {
      const booked = Number(r.booked_count || 0)
      return booked > 0 || r.status === 'booked' || r.status === 'partial'
    })
    const hasMine = overlapsAtRange.some(r => myBookedKeys?.has(`${r.court_number || 1}:${r.slot_start_minutes}`))

    return hasBlocked || hasBooked || hasMine
  }

  const findNextAvailableStart = (fromStart, dur) => {
    const startFrom = Math.max(earliestAllowed, Number.isFinite(fromStart) ? fromStart : earliestAllowed)
    const endLimit = closeMinutes - dur
    for (let t = startFrom; t <= endLimit; t += 15) {
      if (!isUnavailableAtRange(t, dur)) return t
    }
    return null
  }

  useEffect(() => {
    if (!hasWindow) {
      setStartMinutes(null)
      return
    }
    setStartMinutes(prev => {
      const fallback = earliestAllowed
      if (prev == null) return fallback
      if (prev < earliestAllowed) return fallback
      if (prev > maxStart) return maxStart
      return prev
    })
  }, [selectedDate, activeCourt, hasWindow, earliestAllowed, maxStart])

  useEffect(() => {
    if (!durationOptions.length) return
    if (!durationOptions.includes(durationMinutes)) {
      setDurationMinutes(durationOptions[0])
    }
  }, [durationOptions, durationMinutes])

  useEffect(() => {
    if (!hasWindow) return
    const current = startMinutes ?? earliestAllowed
    if (!isUnavailableAtRange(current, durationMinutes)) return

    const nextAvailable = findNextAvailableStart(current, durationMinutes)
    if (nextAvailable != null && nextAvailable !== current) {
      setStartMinutes(nextAvailable)
    }
  }, [
    hasWindow,
    startMinutes,
    earliestAllowed,
    durationMinutes,
    selectedDate,
    activeCourt,
    slotRows,
    myBookedKeys,
  ])

  const selectedStart = startMinutes ?? earliestAllowed
  const selectedEnd = selectedStart + durationMinutes

  const courtRows = slotRows.filter(r => Number(r.court_number || 1) === Number(activeCourt))
  const overlaps = courtRows.filter(r => {
    const rowStart = Number(r.slot_start_minutes)
    const rowDuration = Number(r.slot_duration_minutes || 60)
    if (!Number.isFinite(rowStart) || !Number.isFinite(rowDuration)) return false
    const rowEnd = rowStart + rowDuration
    return rowStart < selectedEnd && rowEnd > selectedStart
  })

  const hasBlockedOverlap = overlaps.some(r => r.status === 'blocked')
  const hasBookedOverlap = overlaps.some(r => {
    const booked = Number(r.booked_count || 0)
    return booked > 0 || r.status === 'booked' || r.status === 'partial'
  })
  const hasMineOverlap = overlaps.some(r => myBookedKeys?.has(`${r.court_number || 1}:${r.slot_start_minutes}`))
  const isUnavailable = !hasWindow || hasBlockedOverlap || hasBookedOverlap || hasMineOverlap

  const fmt12h = (mins) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60))

  useEffect(() => {
    if (!hasWindow || !selectedStart || !durationMinutes || isUnavailable) {
      onSlotsChange([])
      return
    }
    const courtInfo = getCourtByNumber(venue, activeCourt)
    onSlotsChange([
      {
        courtNumber: activeCourt,
        slotStartMinutes: selectedStart,
        durationMinutes,
        slotLabel: `${courtInfo?.name || `Court ${activeCourt}`} · ${fmt12h(selectedStart)} – ${fmt12h(selectedEnd)}`,
        pricePerHour: courtInfo?.price_per_hour || venue.price_per_hour,
      }
    ])
  }, [
    hasWindow,
    selectedStart,
    selectedEnd,
    durationMinutes,
    isUnavailable,
    activeCourt,
    venue,
    onSlotsChange,
  ])

  const selectedLabel = `${fmt12h(selectedStart)} – ${fmt12h(selectedEnd)}`
  const rulerMarks = buildRulerMarks(earliestAllowed, maxStart, 30)
  const sliderRange = Math.max(1, maxStart - earliestAllowed)
  const sliderProgress = Math.max(0, Math.min(100, ((selectedStart - earliestAllowed) / sliderRange) * 100))

  return (
    <div>
      {numCourts > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {venueCourts.map(c => (
            <button key={c.number} onClick={() => setActiveCourt(c.number)}
              style={{
                padding: '6px 16px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                fontFamily: "'Sora', sans-serif", fontSize: '0.82rem', transition: 'all 0.15s',
                border: `1.5px solid ${activeCourt === c.number ? 'var(--brand)' : 'var(--border-2)'}`,
                background: activeCourt === c.number ? 'var(--green-bg)' : 'var(--bg-3)',
                color: activeCourt === c.number ? 'var(--brand)' : 'var(--text-3)',
                fontWeight: activeCourt === c.number ? 700 : 500,
              }}>
              {(c.sport_types || [c.sport_type]).map(sk => getSport(sk).icon).join(' ')} {c.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>
        Time slider uses 15-minute steps. Duration options are in multiples of {baseDuration} minutes.
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}><div className="spinner" /></div>
      ) : !hasWindow ? (
        <div className="slot slot-unavailable" style={{ padding: '0.8rem' }}>
          No available booking window for this date.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '0.9rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Start Time
            </div>
            <div className={`time-slider-shell ${draggingStart ? 'is-dragging' : ''}`} style={{ '--slider-progress': `${sliderProgress}%` }}>
              <div className="time-slider-head">
                <span className="time-slider-now">Now</span>
                <span className="time-slider-selected">{fmt12h(selectedStart)}</span>
              </div>
              <input
                type="range"
                className="modern-time-slider"
                min={earliestAllowed}
                max={maxStart}
                step={15}
                value={selectedStart}
                onChange={e => setStartMinutes(Number(e.target.value))}
                onMouseDown={() => setDraggingStart(true)}
                onMouseUp={() => setDraggingStart(false)}
                onMouseLeave={() => setDraggingStart(false)}
                onTouchStart={() => setDraggingStart(true)}
                onTouchEnd={() => setDraggingStart(false)}
                onTouchCancel={() => setDraggingStart(false)}
              />
              <div className="time-ruler" aria-hidden="true">
                {rulerMarks.map((mark, idx) => (
                  <div key={`${mark.minutes}_${idx}`} className={`time-ruler-mark ${mark.isMajor ? 'major' : ''}`}>
                    <span className="time-ruler-line" />
                    {(mark.isMajor || idx === 0 || idx === rulerMarks.length - 1) && (
                      <span className="time-ruler-label">{fmt12h(mark.minutes)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '0.2rem' }}>
              <span>{fmt12h(earliestAllowed)}</span>
              <span>{fmt12h(maxStart)}</span>
            </div>
          </div>

          <div style={{ marginBottom: '0.9rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Duration
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: '0.4rem', maxWidth: '100%' }}>
              {durationOptions.map(d => {
                const active = d === durationMinutes
                return (
                  <button key={d} type="button" onClick={() => setDurationMinutes(d)}
                    style={{
                      padding: '6px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                      border: `1.5px solid ${active ? 'var(--brand)' : 'var(--border-2)'}`,
                      background: active ? 'var(--green-bg)' : 'var(--bg-3)',
                      color: active ? 'var(--brand)' : 'var(--text-3)',
                      fontWeight: active ? 700 : 500,
                      fontSize: '0.78rem',
                      fontFamily: "'Sora', sans-serif",
                      maxWidth: '100%',
                      width: '100%',
                    }}>
                    {d >= 60 ? `${d / 60}h${d % 60 ? ` ${d % 60}m` : ''}` : `${d}m`}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ border: `1.5px solid ${isUnavailable ? 'var(--red)' : 'var(--brand)'}`, borderRadius: 'var(--r-sm)', padding: '0.8rem', background: isUnavailable ? 'var(--red-bg)' : 'var(--green-bg)', maxWidth: '100%', overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>Selected Window: {selectedLabel}</div>
            <div style={{ fontSize: '0.74rem', color: isUnavailable ? 'var(--red)' : 'var(--brand)' }}>
              {isUnavailable ? 'Unavailable' : 'Available to book.'}
            </div>
          </div>
        </>
      )}

      {!isUnavailable && selectedSlots?.length > 0 && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-3)' }}>
          Live availability checks every 5 seconds.
        </div>
      )}
    </div>
  )
}
