// Sport types config
export const SPORTS = [
  { key: 'football',   label: 'Football',   icon: '⚽', color: '#00C37A', heroClass: 'hero-football',   courtLabel: 'Turf',    defaultSlotDuration: 60  },
  { key: 'cricket',    label: 'Cricket',    icon: '🏏', color: '#FFB830', heroClass: 'hero-cricket',    courtLabel: 'Net',     defaultSlotDuration: 60  },
  { key: 'pickleball', label: 'Pickleball', icon: '🏓', color: '#4D9FFF', heroClass: 'hero-pickleball', courtLabel: 'Court',   defaultSlotDuration: 60  },
  { key: 'padel',      label: 'Padel',      icon: '🎾', color: '#FF70C8', heroClass: 'hero-padel',      courtLabel: 'Court',   defaultSlotDuration: 60  },
  { key: 'gokart',     label: 'Go-Kart',    icon: '🏎️', color: '#FF4D4D', heroClass: 'hero-gokart',     courtLabel: 'Kart',    defaultSlotDuration: 30  },
  { key: 'pool',       label: 'Pool Table', icon: '🎱', color: '#4D9FFF', heroClass: 'hero-pool',        courtLabel: 'Table',   defaultSlotDuration: 60  },
  { key: 'badminton',  label: 'Badminton',  icon: '🏸', color: '#00C37A', heroClass: 'hero-badminton',  courtLabel: 'Court',   defaultSlotDuration: 60  },
  { key: 'tennis',     label: 'Tennis',     icon: '🎾', color: '#FFB830', heroClass: 'hero-tennis',      courtLabel: 'Court',   defaultSlotDuration: 60  },
  { key: 'snooker',    label: 'Snooker',    icon: '🎯', color: '#8B5CF6', heroClass: 'hero-snooker',    courtLabel: 'Table',   defaultSlotDuration: 60  },
  { key: 'bowling',    label: 'Bowling',    icon: '🎳', color: '#F97316', heroClass: 'hero-bowling',    courtLabel: 'Lane',    defaultSlotDuration: 60  },
  { key: 'gaming',     label: 'Gaming',     icon: '🎮', color: '#A855F7', heroClass: 'hero-gaming',     courtLabel: 'Console', defaultSlotDuration: 60, isGaming: true },
]

export const getSport = (key) => SPORTS.find(s => s.key === key) || SPORTS[0]

// Slot duration options for venue owners
export const SLOT_DURATIONS = [
  { value: 15,  label: '15 minutes' },
  { value: 30,  label: '30 minutes' },
  { value: 45,  label: '45 minutes' },
  { value: 60,  label: '1 hour'     },
]

// Generate slots for a venue based on its open/close times & duration
// Returns array of { slotStartMinutes, label, durationMinutes }
export function generateVenueSlots(openHour = 6, closeHour = 22, durationMinutes = 60) {
  const slots = []
  let t = openHour * 60
  const end = closeHour * 60
  while (t + durationMinutes <= end) {
    slots.push({ slotStartMinutes: t, label: slotTimeLabel(t, durationMinutes), durationMinutes })
    t += durationMinutes
  }
  return slots
}

// Format minutes-from-midnight → "6:00 AM – 7:00 AM"
export function slotTimeLabel(startMinutes, durationMinutes = 60) {
  const endMinutes = startMinutes + durationMinutes
  return `${fmtTime(startMinutes)} – ${fmtTime(endMinutes)}`
}

function fmtTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h
  return m === 0 ? `${display}:00 ${period}` : `${display}:${String(m).padStart(2, '0')} ${period}`
}

// Legacy helper kept for backward compat (hour int → label)
export function hourLabel(h) {
  return slotTimeLabel(h * 60, 60)
}

// ── IST Helpers ──────────────────────────────────────────────
// Indian Standard Time is UTC+5:30 — all date/time logic uses IST
export function nowIST() {
  // Get current IST time parts directly via Intl — no manual offset math
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = type => parts.find(p => p.type === type)?.value || '0'
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

export function todayIST() {
  return nowIST().dateStr
}

export function nowMinutesIST() {
  const ist = nowIST()
  return ist.hour * 60 + ist.minute
}

// Dates
export function getNextDays(n = 14) {
  const ist = nowIST()
  const base = new Date(`${ist.dateStr}T00:00:00`)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  })
}

export function formatDateShort(dateStr) {
  const d = dateStr instanceof Date ? dateStr : new Date(String(dateStr).slice(0, 10) + 'T00:00:00')
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short'
  })
}

export function formatDateFull(dateStr) {
  const d = dateStr instanceof Date ? dateStr : new Date(String(dateStr).slice(0, 10) + 'T00:00:00')
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

export function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// Currency
export function formatCurrency(n) {
  return '₹' + Number(n).toLocaleString('en-IN')
}

// Platform cut (hidden from users)
export const PLATFORM_CUT_PCT = 0.10
export const VENUE_PAYOUT_PCT = 0.90

export function calcFees(pricePerHour, slots, durationMinutes = 60) {
  // Price is per hour; adjust for slot duration
  const pricePerSlot = pricePerHour * (durationMinutes / 60)
  const total = pricePerSlot * slots
  return { subtotal: total, fee: 0, total }
}

// Calculate fees from slot objects with per-court pricing
export function calcFeesFromSlots(slotObjects, venue, durationMinutes = 60) {
  let subtotal = 0
  for (const s of slotObjects) {
    // Use per-court price from slot object, then try court lookup, then venue fallback
    const court = s.courtNumber ? getCourtByNumber(venue, s.courtNumber) : null
    const pp = s.pricePerHour || court?.price_per_hour || venue.price_per_hour
    const slotDuration = s.durationMinutes || durationMinutes
    subtotal += pp * (slotDuration / 60)
  }
  return { subtotal, fee: 0, total: subtotal }
}

export function calcVenuePayout(total) {
  return Math.round(total * VENUE_PAYOUT_PCT)
}

export function generatePaymentRef() {
  return 'RB_' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase()
}

// Distance calculation (Haversine)
export function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
}

// ── Courts helpers ──────────────────────────────────────────
// Get court config from venue (handles old venues without courts array)
export function getVenueCourts(venue) {
  if (venue.courts?.length) {
    // Ensure each court has sport_types array (backward compat)
    return venue.courts.map(c => ({
      ...c,
      sport_types: c.sport_types || [c.sport_type],
    }))
  }
  // Fallback: build from legacy fields
  const sp = getSport(venue.sport_type)
  const n = venue.num_courts || 1
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    name: `${venue.court_label || sp.courtLabel} ${i + 1}`,
    sport_type: venue.sport_type,
    sport_icon: sp.icon,
    sport_types: [venue.sport_type],
    price_per_hour: venue.price_per_hour,
  }))
}

// Get court by number (loose compare to handle JSONB string/number mismatch)
export function getCourtByNumber(venue, courtNum) {
  const courts = getVenueCourts(venue)
  return courts.find(c => Number(c.number) === Number(courtNum)) || courts[0]
}

// Get lowest price across courts
export function getLowestPrice(venue) {
  const courts = getVenueCourts(venue)
  return Math.min(...courts.map(c => c.price_per_hour || venue.price_per_hour))
}

// Get unique sport types in venue (aggregates from court sport_types arrays)
export function getVenueSports(venue) {
  const courts = getVenueCourts(venue)
  const allSports = courts.flatMap(c => c.sport_types || [c.sport_type])
  const unique = [...new Set(allSports)]
  return unique.map(k => getSport(k))
}

// Default court object
export function makeDefaultCourt(number, sportKey) {
  const sp = getSport(sportKey)
  return {
    number,
    name: `${sp.courtLabel} ${number}`,
    sport_type: sp.key,
    sport_icon: sp.icon,
    sport_types: [sp.key],
    price_per_hour: '',
  }
}

// ── GAMING CONSTANTS ─────────────────────────────────────────
export const GAMING_SETUP_TYPES = {
  ps5:        { key: 'ps5',        label: 'PS5',              icon: '🎮', slotDuration: 60, maxPlayers: 4, unitLabel: 'Console', color: '#2563EB' },
  car_racing: { key: 'car_racing', label: 'Car Racing Wheel', icon: '🏎️', slotDuration: 60, maxPlayers: 1, unitLabel: 'Rig',     color: '#DC2626' },
  ps_vr2:     { key: 'ps_vr2',     label: 'PS VR2',           icon: '🥽', slotDuration: 30, maxPlayers: 1, unitLabel: 'Headset', color: '#7C3AED' },
}

export const GAMING_SETUP_LIST = Object.values(GAMING_SETUP_TYPES)

export function getGamingSetup(key) {
  return GAMING_SETUP_TYPES[key] || GAMING_SETUP_LIST[0]
}

// Check if a venue is a gaming venue
export function isGamingVenue(venue) {
  return venue?.sport_type === 'gaming'
}

