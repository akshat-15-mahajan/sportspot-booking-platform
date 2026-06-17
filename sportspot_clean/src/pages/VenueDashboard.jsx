import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import {
  SPORTS, getSport, SLOT_DURATIONS, generateVenueSlots, slotTimeLabel, formatDateFull,
  getNextDays, formatCurrency, calcVenuePayout,
  getVenueCourts, getCourtByNumber, getLowestPrice, getVenueSports, makeDefaultCourt,
  todayIST, nowMinutesIST, isGamingVenue, getGamingSetup,
} from '../lib/constants'
import { Nav, Modal, StatCard, StatusBadge, EmptyState, SectionHeader, Alert, ToastContainer, MobileSidebarWrapper, useMobileMenu } from '../components/UI'
import { GamingSetupConfigurator, GamingSlotManager } from '../components/GamingComponents'
import Footer from '../components/Footer'

// ── PHOTO UPLOADER ────────────────────────────────────────────
function PhotoUploader({ venueId, existingPhotos = [], onPhotosChange }) {
  const [uploading, setUploading] = useState(false)
  const [photos, setPhotos] = useState(existingPhotos)
  const [deleting, setDeleting] = useState(null)
  const fileRef = useRef()
  const toast = useToast()
  const { api } = useAuth()

  // Convert a File to base64 string
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1]) // strip "data:...;base64,"
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    if (photos.length + files.length > 6) { toast.show('Maximum 6 photos allowed', 'error'); return }
    setUploading(true)
    try {
      let currentPhotos = [...photos]
      let uploadCount = 0
      // Upload one file at a time to stay within Vercel body size limits
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) { toast.show(`${file.name} is over 5MB — skipped`, 'error'); continue }
        if (currentPhotos.length >= 6) break
        const base64 = await fileToBase64(file)
        const result = await api.post(`/upload/venue-photo/${venueId}`, {
          files: [{ name: file.name, type: file.type, base64 }]
        })
        if (result.images) {
          currentPhotos = result.images
          setPhotos(result.images)
          uploadCount++
        }
      }
      if (uploadCount > 0) {
        onPhotosChange?.(currentPhotos)
        toast.show(`${uploadCount} photo(s) uploaded!`, 'success')
      }
    } catch (err) { toast.show('Upload failed: ' + err.message, 'error') }
    setUploading(false)
    fileRef.current.value = ''
  }

  async function handleDelete(url) {
    setDeleting(url)
    try {
      const result = await api.del(`/upload/venue-photo/${venueId}`, { url })
      if (result.images) {
        setPhotos(result.images)
        onPhotosChange?.(result.images)
      }
      toast.show('Photo removed', 'info')
    } catch { toast.show('Failed to delete photo', 'error') }
    setDeleting(null)
  }

  return (
    <div>
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
          {photos.map((url, i) => (
            <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', background: 'var(--bg-3)' }}>
              <img src={url} alt={`Venue ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button onClick={() => handleDelete(url)} disabled={deleting === url}
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: '50%', width: 26, height: 26, color: 'white', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {deleting === url ? '…' : '×'}
              </button>
              {i === 0 && <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,195,122,0.85)', color: '#000', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>COVER</div>}
            </div>
          ))}
        </div>
      )}
      {photos.length < 6 && (
        <>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={handleUpload} />
          <button type="button" className="btn btn-secondary btn-full" disabled={uploading} onClick={() => fileRef.current.click()}
            style={{ borderStyle: 'dashed', marginBottom: '0.5rem' }}>
            {uploading ? '⏳ Uploading…' : `📷 Upload Photos (${photos.length}/6)`}
          </button>
        </>
      )}
      <p className="form-hint mt-1">JPG, PNG or WebP · Max 5MB each · First photo is the cover image</p>
    </div>
  )
}

async function uploadInlineGameCovers(api, venueId, setupConfigs) {
  const resultConfigs = []
  let uploadedCount = 0
  let failedCount = 0

  for (const setup of (setupConfigs || [])) {
    const games = []
    for (let idx = 0; idx < (setup.games || []).length; idx++) {
      const game = setup.games[idx]
      const cover = game?.cover_photo

      if (typeof cover === 'string' && cover.startsWith('data:')) {
        const matches = cover.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
        if (!matches) {
          games.push({ ...game, cover_photo: '' })
          failedCount++
          continue
        }

        const contentType = matches[1]
        const base64 = matches[2]
        const ext = (contentType.split('/')[1] || 'jpg').split('+')[0]
        const safeName = (game?.name || `game-${idx + 1}`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || `game-${idx + 1}`

        try {
          const uploadRes = await api.post('/upload/game-cover', {
            venue_id: venueId,
            file: {
              name: `${safeName}.${ext}`,
              type: contentType,
              base64,
            },
          })
          if (uploadRes?.url) {
            games.push({ ...game, cover_photo: uploadRes.url })
            uploadedCount++
          } else {
            games.push({ ...game, cover_photo: '' })
            failedCount++
          }
        } catch {
          games.push({ ...game, cover_photo: '' })
          failedCount++
        }
      } else {
        games.push(game)
      }
    }

    resultConfigs.push({ ...setup, games })
  }

  return { configs: resultConfigs, uploadedCount, failedCount }
}

function buildEditableGamingConfigs(gamingConfig) {
  const setups = gamingConfig?.setups || []
  const consoles = gamingConfig?.consoles || []
  const games = gamingConfig?.games || []
  const consoleGames = gamingConfig?.consoleGames || []
  const ps5Pricing = gamingConfig?.ps5Pricing || []

  return setups.map((setup) => {
    const meta = getGamingSetup(setup.setup_type)
    const setupConsoles = consoles.filter(c => c.setup_id === setup.id)
    const setupGames = games
      .filter(g => g.setup_type === setup.setup_type)
      .map(g => {
        const linkedConsoleIds = consoleGames.filter(cg => cg.game_id === g.id).map(cg => cg.console_id)
        const consoleNumbers = setupConsoles
          .filter(c => linkedConsoleIds.includes(c.id))
          .map(c => c.console_number)
          .sort((a, b) => a - b)

        return {
          name: g.name || '',
          max_players: g.max_players || meta.maxPlayers,
          cover_photo: g.cover_photo || '',
          consoleNumbers,
        }
      })

    const pricing = setup.setup_type === 'ps5'
      ? [1, 2, 3, 4].map((playerCount) => {
          const row = ps5Pricing.find(p => p.setup_id === setup.id && Number(p.player_count) === playerCount)
          return { player_count: playerCount, price: row?.price ?? '' }
        })
      : []

    return {
      setup_type: setup.setup_type,
      num_units: setup.num_units || setupConsoles.length || 1,
      price_per_session: setup.price_per_session || '',
      games: setupGames,
      pricing,
    }
  })
}

// ── ADD VENUE MODAL ───────────────────────────────────────────
function AddVenueModal({ onClose, onSaved, ownerId }) {
  const toast = useToast()
  const { api } = useAuth()
  const defaultSport = getSport('football')
  const [form, setForm] = useState({
    name: '', description: '',
    address: '', city: '', state: '', pincode: '', lat: '', lng: '',
    capacity: '',
    // Operating hours & slot config
    open_time: 6, close_time: 22, slot_duration_minutes: 60,
    amenities: '', rules: '',
  })
  const [courts, setCourts] = useState([makeDefaultCourt(1, 'football')])
  const [isGaming, setIsGaming] = useState(false)
  const [gamingConfigs, setGamingConfigs] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedVenueId, setSavedVenueId] = useState(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)

  const up = (k, v) => setForm(p => {
    const next = { ...p, [k]: v }
    // Auto-adjust close_time if open_time is moved to or past it
    if (k === 'open_time' && v >= p.close_time) {
      next.close_time = Math.min(v + 1, 23)
    }
    return next
  })
  const mapsUrl = form.lat && form.lng ? `https://www.google.com/maps?q=${form.lat},${form.lng}` : null

  // Court management
  function updateCourt(idx, field, value) {
    setCourts(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      if (field === 'sport_types') {
        // value is the new sport_types array
        if (value.length > 0) {
          const primarySp = getSport(value[0])
          copy[idx].sport_type = value[0]
          copy[idx].sport_icon = primarySp.icon
          // Update name if it still uses a default pattern
          const oldSp = getSport(prev[idx].sport_type)
          if (copy[idx].name === `${oldSp.courtLabel} ${copy[idx].number}`) {
            copy[idx].name = `${primarySp.courtLabel} ${copy[idx].number}`
          }
        }
      }
      return copy
    })
  }
  function toggleCourtSport(idx, sportKey) {
    setCourts(prev => {
      const court = prev[idx]
      const currentSports = court.sport_types || [court.sport_type]
      let newSports
      if (currentSports.includes(sportKey)) {
        // Remove — but keep at least one
        if (currentSports.length <= 1) return prev
        newSports = currentSports.filter(s => s !== sportKey)
      } else {
        newSports = [...currentSports, sportKey]
      }
      const copy = [...prev]
      copy[idx] = { ...copy[idx], sport_types: newSports, sport_type: newSports[0], sport_icon: getSport(newSports[0]).icon }
      // Update name if still default
      const oldSp = getSport(prev[idx].sport_type)
      if (copy[idx].name === `${oldSp.courtLabel} ${copy[idx].number}`) {
        copy[idx].name = `${getSport(newSports[0]).courtLabel} ${copy[idx].number}`
      }
      return copy
    })
  }
  function addCourt() {
    const lastSport = courts[courts.length - 1]?.sport_type || 'football'
    setCourts(prev => [...prev, makeDefaultCourt(prev.length + 1, lastSport)])
  }
  function removeCourt(idx) {
    if (courts.length <= 1) return
    setCourts(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, number: i + 1 })))
  }

  // Derived
  const primarySport = getSport(courts[0]?.sport_type || 'football')
  const uniqueSports = [...new Set(courts.flatMap(c => c.sport_types || [c.sport_type]))]
  const lowestPrice = Math.min(...courts.map(c => parseFloat(c.price_per_hour) || Infinity))

  // Preview slot count
  const previewSlots = generateVenueSlots(form.open_time, form.close_time, form.slot_duration_minutes)

  async function handleSubmitDetails(e) {
    e.preventDefault()

    // ── Common validation ──────────────────────────────────────
    if (form.close_time <= form.open_time) {
      setError('Closing time must be after opening time'); return
    }

    // ── Gaming venue submission ───────────────────────────────
    if (isGaming) {
      if (!gamingConfigs.length) { setError('Please configure at least one gaming setup type'); return }
      for (const cfg of gamingConfigs) {
        if (!cfg.num_units || cfg.num_units < 1) { setError(`Set number of units for ${cfg.setup_type}`); return }
        if (cfg.setup_type === 'ps5') {
          for (const p of (cfg.pricing || [])) {
            if (!p.price || parseFloat(p.price) <= 0) { setError(`Set pricing for ${p.player_count} player(s) on PS5`); return }
          }
        } else {
          if (!cfg.price_per_session || parseFloat(cfg.price_per_session) <= 0) { setError(`Set price for ${cfg.setup_type}`); return }
        }
      }
      setSaving(true); setError('')
      try {
        const amenitiesList = form.amenities ? form.amenities.split(',').map(s => s.trim()).filter(Boolean) : []
        // Determine a representative price for the venue listing
        let minPrice = Infinity
        for (const cfg of gamingConfigs) {
          if (cfg.setup_type === 'ps5') {
            for (const p of (cfg.pricing || [])) { if (parseFloat(p.price) < minPrice) minPrice = parseFloat(p.price) }
          } else {
            if (parseFloat(cfg.price_per_session) < minPrice) minPrice = parseFloat(cfg.price_per_session)
          }
        }
        if (!isFinite(minPrice)) minPrice = 0
        const totalUnits = gamingConfigs.reduce((s, c) => s + (c.num_units || 0), 0)
        const data = await api.post('/venues', {
          name: form.name, description: form.description,
          sport_type: 'gaming', sport_icon: '🎮', sport_types: ['gaming'],
          address: form.address, city: form.city, state: form.state, pincode: form.pincode,
          lat: form.lat ? parseFloat(form.lat) : null,
          lng: form.lng ? parseFloat(form.lng) : null,
          price_per_hour: minPrice,
          capacity: parseInt(form.capacity) || 1,
          open_time: parseInt(form.open_time),
          close_time: parseInt(form.close_time),
          slot_duration_minutes: 60,
          num_courts: totalUnits,
          court_label: 'Console',
          courts: [],
          amenities: amenitiesList, rules: form.rules, status: 'pending', images: [],
        })

        const { configs: configsWithUploadedCovers, failedCount } = await uploadInlineGameCovers(api, data.id, gamingConfigs)

        if (failedCount > 0) {
          toast.show(`${failedCount} game cover(s) could not be uploaded and were skipped`, 'info')
        }

        // Save gaming config
        await api.post(`/gaming/config/${data.id}`, { setups: configsWithUploadedCovers })
        setSavedVenueId(data.id)
        setStep(2)
      } catch (err) { setError(err.message) }
      finally { setSaving(false) }
      return
    }

    // ── Regular sport venue submission ────────────────────────
    // Validate courts
    for (const c of courts) {
      if (!c.name) { setError(`Please name ${primarySport.courtLabel} ${c.number}`); return }
      if (!c.price_per_hour || parseFloat(c.price_per_hour) <= 0) { setError(`Set a price for "${c.name}"`); return }
    }
    setSaving(true); setError('')
    try {
      const amenitiesList = form.amenities ? form.amenities.split(',').map(s => s.trim()).filter(Boolean) : []
      const courtsData = courts.map(c => ({
        number: c.number,
        name: c.name,
        sport_type: c.sport_type,
        sport_icon: c.sport_icon,
        sport_types: c.sport_types || [c.sport_type],
        price_per_hour: parseFloat(c.price_per_hour),
      }))
      const sportTypes = [...new Set(courtsData.flatMap(c => c.sport_types))]
      const minPrice = Math.min(...courtsData.map(c => c.price_per_hour))
      const data = await api.post('/venues', {
        name: form.name, description: form.description,
        sport_type: courtsData[0].sport_type, sport_icon: courtsData[0].sport_icon,
        sport_types: sportTypes,
        address: form.address, city: form.city, state: form.state, pincode: form.pincode,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        price_per_hour: minPrice,
        capacity: parseInt(form.capacity) || 1,
        open_time: parseInt(form.open_time),
        close_time: parseInt(form.close_time),
        slot_duration_minutes: parseInt(form.slot_duration_minutes),
        num_courts: courtsData.length,
        court_label: getSport(courtsData[0].sport_type).courtLabel,
        courts: courtsData,
        amenities: amenitiesList, rules: form.rules, status: 'pending', images: [],
      })
      setSavedVenueId(data.id)
      setStep(2)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  // Hour options for open/close
  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: i, label: slotTimeLabel(i * 60, 0).split(' –')[0] }))

  return (
    <Modal title={step === 1 ? '🏟️ Add New Venue' : '📷 Upload Photos'} onClose={onClose} maxWidth={680}
      footer={step === 1 ? (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} form="venue-form">
            {saving ? <span className="inline-spinner" style={{ borderTopColor: '#000' }} /> : null}
            {saving ? 'Saving…' : 'Next: Add Photos →'}
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Photos can be added later too</span>
          <button className="btn btn-primary" onClick={() => { onSaved(); onClose() }}>Submit for Approval →</button>
        </>
      )}>

      {/* Steps */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {['Venue Details', 'Photos'].map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: step > i + 1 ? 'var(--green)' : step === i + 1 ? 'var(--brand)' : 'var(--bg-4)', color: step >= i + 1 ? '#000' : 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? 'var(--text)' : 'var(--text-3)' }}>{label}</span>
            {i < 1 && <span style={{ color: 'var(--border-2)', margin: '0 0.25rem' }}>→</span>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <>
          {error && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px', fontSize: '0.82rem', color: 'var(--red)', marginBottom: '1rem' }}>{error}</div>}
          <form id="venue-form" onSubmit={handleSubmitDetails}>
            {/* Basic Info */}
            <div className="form-group">
              <label className="form-label">Venue Name *</label>
              <input className="form-input" placeholder="Premier Sports Arena" value={form.name} onChange={e => up('name', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={2} placeholder="Describe your facility…" value={form.description} onChange={e => up('description', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Street Address *</label>
              <input className="form-input" placeholder="Plot 12, Sector 18" value={form.address} onChange={e => up('address', e.target.value)} required />
            </div>
            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">City *</label>
                <input className="form-input" placeholder="Noida" value={form.city} onChange={e => up('city', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input className="form-input" placeholder="Uttar Pradesh" value={form.state} onChange={e => up('state', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Pincode</label>
                <input className="form-input" placeholder="201301" value={form.pincode} onChange={e => up('pincode', e.target.value)} />
              </div>
            </div>

            {/* GPS */}
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: '0.75rem' }}>
                📍 GPS Coordinates
                <a href="https://maps.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontWeight: 600, marginLeft: '0.75rem', textTransform: 'none', letterSpacing: 0 }}>Open Google Maps →</a>
              </div>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Latitude *</label>
                  <input className="form-input" placeholder="28.5708" value={form.lat} onChange={e => up('lat', e.target.value)} type="number" step="any" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Longitude *</label>
                  <input className="form-input" placeholder="77.3261" value={form.lng} onChange={e => up('lng', e.target.value)} type="number" step="any" required />
                </div>
              </div>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', color: 'var(--green)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', background: 'var(--green-bg)', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--green)' }}>
                  ✓ Preview on Google Maps →
                </a>
              )}
            </div>

            {/* ── VENUE TYPE TOGGLE ── */}
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: '0.75rem' }}>
                Venue Type
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[{ key: false, label: '🏟️ Sports Venue', desc: 'Football, Cricket, Badminton, etc.' },
                  { key: true,  label: '🎮 Gaming Venue', desc: 'PS5, Car Racing, VR setups' }].map(opt => (
                  <button key={String(opt.key)} type="button" onClick={() => setIsGaming(opt.key)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                      border: `2px solid ${isGaming === opt.key ? 'var(--brand)' : 'var(--border-2)'}`,
                      background: isGaming === opt.key ? 'var(--green-bg)' : 'var(--bg-2)',
                      color: isGaming === opt.key ? 'var(--brand)' : 'var(--text-3)',
                      fontWeight: isGaming === opt.key ? 700 : 500,
                      fontFamily: "'Sora', sans-serif", transition: 'all 0.15s',
                    }}>
                    <div style={{ fontSize: '0.88rem', marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: '0.68rem', opacity: 0.7 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Capacity (non-gaming only) */}
            {!isGaming && (
              <div className="form-group">
                <label className="form-label">Max People Per Slot</label>
                <input className="form-input" type="number" placeholder="10" value={form.capacity} onChange={e => up('capacity', e.target.value)} min={1} />
              </div>
            )}

            {/* ── GAMING SETUP CONFIGURATOR ── */}
            {isGaming && (
              <GamingSetupConfigurator value={gamingConfigs} onChange={setGamingConfigs} />
            )}

            {/* ── COURTS / TURFS / LANES CONFIGURATOR (non-gaming) ── */}
            {!isGaming && (
              <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--brand)' }}>
                  🏟️ Courts / Turfs / Lanes ({courts.length})
                </div>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={addCourt}>
                  + Add
                </button>
              </div>

              {courts.map((court, idx) => {
                const sp = getSport(court.sport_type)
                const courtSports = court.sport_types || [court.sport_type]
                return (
                  <div key={idx} style={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '0.85rem', marginBottom: idx < courts.length - 1 ? '0.65rem' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)' }}>
                        {courtSports.map(sk => getSport(sk).icon).join(' ')} #{court.number}
                      </span>
                      {courts.length > 1 && (
                        <button type="button" onClick={() => removeCourt(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                          ✕ Remove
                        </button>
                      )}
                    </div>
                    <div className="grid-2" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.68rem' }}>Name *</label>
                        <input className="form-input" placeholder={`${sp.courtLabel} ${court.number}`}
                          value={court.name} onChange={e => updateCourt(idx, 'name', e.target.value)} required />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.68rem' }}>Price/Hr (₹) *</label>
                        <input className="form-input" type="number" placeholder="1500" min={1}
                          value={court.price_per_hour} onChange={e => updateCourt(idx, 'price_per_hour', e.target.value)} required />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.68rem' }}>Sports (select one or more) *</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {SPORTS.filter(s => !s.isGaming).map(s => {
                          const isActive = courtSports.includes(s.key)
                          return (
                            <button key={s.key} type="button" onClick={() => toggleCourtSport(idx, s.key)}
                              style={{
                                padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                                fontSize: '0.7rem', fontWeight: isActive ? 700 : 500,
                                border: `1.5px solid ${isActive ? s.color : 'var(--border-2)'}`,
                                background: isActive ? s.color + '22' : 'var(--bg-3)',
                                color: isActive ? s.color : 'var(--text-3)',
                                fontFamily: "'Sora', sans-serif", transition: 'all 0.15s',
                              }}>
                              {s.icon} {s.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Multi-sport summary */}
              {uniqueSports.length > 1 && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {uniqueSports.map(sk => {
                    const sp = getSport(sk)
                    const count = courts.filter(c => (c.sport_types || [c.sport_type]).includes(sk)).length
                    return (
                      <span key={sk} style={{ background: sp.color + '22', color: sp.color, border: `1px solid ${sp.color}44`, borderRadius: 20, padding: '2px 10px', fontSize: '0.7rem', fontWeight: 600 }}>
                        {sp.icon} {sp.label} × {count}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Price summary */}
              {courts.length > 0 && lowestPrice < Infinity && (
                <div style={{ marginTop: '0.6rem', fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  💰 {courts.length === 1 || courts.every(c => parseFloat(c.price_per_hour) === parseFloat(courts[0].price_per_hour))
                    ? `₹${lowestPrice}/hr`
                    : `From ₹${lowestPrice}/hr onwards`}
                </div>
              )}
            </>
            )}

            {/* ── OPERATING HOURS & SLOTS ── */}
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: '1rem' }}>
                🕐 Operating Hours & Slot Configuration
              </div>

              <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Opens At</label>
                  <select className="form-input form-select" value={form.open_time} onChange={e => up('open_time', parseInt(e.target.value))}>
                    {hourOptions.slice(0, 20).map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Closes At</label>
                  <select className="form-input form-select" value={form.close_time} onChange={e => up('close_time', parseInt(e.target.value))}>
                    {hourOptions.filter(h => h.value > form.open_time).map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                </div>
              </div>

              {!isGaming && (
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Slot Duration</label>
                <select className="form-input form-select" value={form.slot_duration_minutes} onChange={e => up('slot_duration_minutes', parseInt(e.target.value))}>
                  {SLOT_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              )}

              {isGaming && (
                <div style={{ background: 'var(--bg-2)', borderRadius: 6, padding: '0.75rem', fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-2)' }}>⏱ Slot Durations (auto-set per setup type)</div>
                  <div>PS5 → 1 hour &nbsp;·&nbsp; Car Racing Wheel → 1 hour &nbsp;·&nbsp; PS VR2 → 30 min</div>
                </div>
              )}

              {/* Preview (non-gaming only) */}
              {!isGaming && previewSlots.length > 0 && (
                <div style={{ background: 'var(--bg-2)', borderRadius: 6, padding: '0.75rem', fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-2)' }}>
                    Preview: {previewSlots.length} slots × {courts.length} court(s) = {previewSlots.length * courts.length} total bookable slots/day
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {previewSlots.slice(0, 8).map(s => (
                      <span key={s.slotStartMinutes} style={{ background: 'var(--bg-4)', borderRadius: 4, padding: '2px 8px' }}>{s.label}</span>
                    ))}
                    {previewSlots.length > 8 && <span style={{ padding: '2px 4px' }}>+{previewSlots.length - 8} more</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Amenities (comma-separated)</label>
              <input className="form-input" placeholder="Floodlights, Parking, Changing Rooms, Water" value={form.amenities} onChange={e => up('amenities', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Rules / Notes</label>
              <textarea className="form-input" rows={2} placeholder="No spikes, bring your own equipment…" value={form.rules} onChange={e => up('rules', e.target.value)} />
            </div>
          </form>
        </>
      )}

      {step === 2 && savedVenueId && (
        <div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            Great! Add photos of your venue — good photos lead to more bookings. First photo is the cover image.
          </p>
          <PhotoUploader venueId={savedVenueId} existingPhotos={[]} onPhotosChange={() => {}} />
        </div>
      )}
    </Modal>
  )
}

// ── MANAGE PHOTOS MODAL ───────────────────────────────────────
function ManagePhotosModal({ venue, onClose, onSaved }) {
  return (
    <Modal title={`📷 Photos — ${venue.name}`} onClose={onClose} maxWidth={560}
      footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <PhotoUploader venueId={venue.id} existingPhotos={venue.images || []} onPhotosChange={onSaved} />
    </Modal>
  )
}

// ── EDIT VENUE MODAL ──────────────────────────────────────────
function EditVenueModal({ venue, onClose, onSaved }) {
  const toast = useToast()
  const { api } = useAuth()
  const isGaming = isGamingVenue(venue)

  const existingCourts = getVenueCourts(venue).map(c => ({
    ...c,
    sport_types: c.sport_types || [c.sport_type],
    price_per_hour: c.price_per_hour || venue.price_per_hour || 0,
  }))

  const [form, setForm] = useState({
    description: venue.description || '',
    open_time: venue.open_time ?? 6,
    close_time: venue.close_time ?? 22,
    amenities: Array.isArray(venue.amenities) ? venue.amenities.join(', ') : (venue.amenities || ''),
    rules: venue.rules || '',
  })
  const [courts, setCourts] = useState(existingCourts.length ? existingCourts : [makeDefaultCourt(1, venue.sport_type || 'football')])
  const [gamingConfigs, setGamingConfigs] = useState(() => buildEditableGamingConfigs(venue.gaming_config))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const up = (k, v) => setForm(p => {
    const next = { ...p, [k]: v }
    if (k === 'open_time' && v >= p.close_time) {
      next.close_time = Math.min(v + 1, 23)
    }
    return next
  })

  // Court helpers
  function updateCourt(idx, field, value) {
    setCourts(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      if (field === 'sport_types' && value.length > 0) {
        const primarySp = getSport(value[0])
        copy[idx].sport_type = value[0]
        copy[idx].sport_icon = primarySp.icon
        const oldSp = getSport(prev[idx].sport_type)
        if (copy[idx].name === `${oldSp.courtLabel} ${copy[idx].number}`) {
          copy[idx].name = `${primarySp.courtLabel} ${copy[idx].number}`
        }
      }
      return copy
    })
  }
  function toggleCourtSport(idx, sportKey) {
    setCourts(prev => {
      const court = prev[idx]
      const currentSports = court.sport_types || [court.sport_type]
      let newSports
      if (currentSports.includes(sportKey)) {
        if (currentSports.length <= 1) return prev
        newSports = currentSports.filter(s => s !== sportKey)
      } else {
        newSports = [...currentSports, sportKey]
      }
      const copy = [...prev]
      copy[idx] = { ...copy[idx], sport_types: newSports, sport_type: newSports[0], sport_icon: getSport(newSports[0]).icon }
      const oldSp = getSport(prev[idx].sport_type)
      if (copy[idx].name === `${oldSp.courtLabel} ${copy[idx].number}`) {
        copy[idx].name = `${getSport(newSports[0]).courtLabel} ${copy[idx].number}`
      }
      return copy
    })
  }
  function addCourt() {
    const lastSport = courts[courts.length - 1]?.sport_type || 'football'
    setCourts(prev => [...prev, makeDefaultCourt(prev.length + 1, lastSport)])
  }
  function removeCourt(idx) {
    if (courts.length <= 1) return
    setCourts(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, number: i + 1 })))
  }

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: i, label: slotTimeLabel(i * 60, 0).split(' –')[0] }))
  const previewSlots = generateVenueSlots(form.open_time, form.close_time, venue.slot_duration_minutes || 60)

  async function handleSave(e) {
    e.preventDefault()
    if (form.close_time <= form.open_time) { setError('Closing time must be after opening time'); return }
    if (!isGaming) {
      for (const c of courts) {
        if (!c.name) { setError(`Please name court #${c.number}`); return }
        if (!c.price_per_hour || parseFloat(c.price_per_hour) <= 0) { setError(`Set a price for "${c.name}"`); return }
      }
    }
    setSaving(true); setError('')
    try {
      const amenitiesList = form.amenities ? form.amenities.split(',').map(s => s.trim()).filter(Boolean) : []
      const patch = {
        description: form.description || null,
        open_time: parseInt(form.open_time),
        close_time: parseInt(form.close_time),
        amenities: amenitiesList,
        rules: form.rules || null,
      }

      if (isGaming) {
        if (!gamingConfigs.length) { setError('Please configure at least one gaming setup type'); setSaving(false); return }
        for (const cfg of gamingConfigs) {
          if (!cfg.num_units || cfg.num_units < 1) { setError(`Set number of units for ${cfg.setup_type}`); setSaving(false); return }
          if (cfg.setup_type === 'ps5') {
            for (const p of (cfg.pricing || [])) {
              if (!p.price || parseFloat(p.price) <= 0) { setError(`Set pricing for ${p.player_count} player(s) on PS5`); setSaving(false); return }
            }
          } else {
            if (!cfg.price_per_session || parseFloat(cfg.price_per_session) <= 0) { setError(`Set price for ${cfg.setup_type}`); setSaving(false); return }
          }
        }

        let minPrice = Infinity
        for (const cfg of gamingConfigs) {
          if (cfg.setup_type === 'ps5') {
            for (const p of (cfg.pricing || [])) {
              if (parseFloat(p.price) < minPrice) minPrice = parseFloat(p.price)
            }
          } else if (parseFloat(cfg.price_per_session) < minPrice) {
            minPrice = parseFloat(cfg.price_per_session)
          }
        }
        patch.price_per_hour = isFinite(minPrice) ? minPrice : 0
        patch.num_courts = gamingConfigs.reduce((sum, cfg) => sum + (cfg.num_units || 0), 0)
      }

      if (!isGaming) {
        const courtsData = courts.map(c => ({
          number: c.number, name: c.name,
          sport_type: c.sport_type, sport_icon: c.sport_icon,
          sport_types: c.sport_types || [c.sport_type],
          price_per_hour: parseFloat(c.price_per_hour),
        }))
        const sportTypes = [...new Set(courtsData.flatMap(c => c.sport_types))]
        const minPrice = Math.min(...courtsData.map(c => c.price_per_hour))
        patch.courts = courtsData
        patch.num_courts = courtsData.length
        patch.sport_type = courtsData[0].sport_type
        patch.sport_icon = courtsData[0].sport_icon
        patch.sport_types = sportTypes
        patch.price_per_hour = minPrice
        patch.court_label = getSport(courtsData[0].sport_type).courtLabel
      }

      await api.patch(`/venues/${venue.id}`, patch)

      if (isGaming) {
        const { configs: configsWithUploadedCovers, failedCount } = await uploadInlineGameCovers(api, venue.id, gamingConfigs)
        await api.post(`/gaming/config/${venue.id}`, { setups: configsWithUploadedCovers })
        if (failedCount > 0) {
          toast.show(`${failedCount} game cover(s) could not be uploaded and were skipped`, 'info')
        }
      }

      toast.show('Venue updated!', 'success')
      onSaved()
      onClose()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`✏️ Edit — ${venue.name}`} onClose={onClose} maxWidth={640}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving} form="edit-venue-form">
          {saving ? <span className="inline-spinner" style={{ borderTopColor: '#000' }} /> : null}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </>}>
      {error && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px', fontSize: '0.82rem', color: 'var(--red)', marginBottom: '1rem' }}>{error}</div>}
      <form id="edit-venue-form" onSubmit={handleSave}>
        {/* Description */}
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={2} placeholder="Describe your facility…" value={form.description} onChange={e => up('description', e.target.value)} />
        </div>

        {/* Operating Hours */}
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: '1rem' }}>
            🕐 Operating Hours
          </div>
          <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Opens At</label>
              <select className="form-input form-select" value={form.open_time} onChange={e => up('open_time', parseInt(e.target.value))}>
                {hourOptions.slice(0, 20).map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Closes At</label>
              <select className="form-input form-select" value={form.close_time} onChange={e => up('close_time', parseInt(e.target.value))}>
                {hourOptions.filter(h => h.value > form.open_time).map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </div>
          {!isGaming && previewSlots.length > 0 && (
            <div style={{ background: 'var(--bg-2)', borderRadius: 6, padding: '0.75rem', fontSize: '0.72rem', color: 'var(--text-3)' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-2)' }}>
                Preview: {previewSlots.length} slots × {courts.length} court(s) = {previewSlots.length * courts.length} total bookable slots/day
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {previewSlots.slice(0, 6).map(s => (
                  <span key={s.slotStartMinutes} style={{ background: 'var(--bg-4)', borderRadius: 4, padding: '2px 8px' }}>{s.label}</span>
                ))}
                {previewSlots.length > 6 && <span style={{ padding: '2px 4px' }}>+{previewSlots.length - 6} more</span>}
              </div>
            </div>
          )}
        </div>

        {/* Courts / Turfs (non-gaming only) */}
        {!isGaming && (
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--brand)' }}>
                🏟️ {venue.court_label || 'Court'}s ({courts.length})
              </div>
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={addCourt}>+ Add</button>
            </div>
            {courts.map((court, idx) => {
              const sp = getSport(court.sport_type)
              const courtSports = court.sport_types || [court.sport_type]
              return (
                <div key={idx} style={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '0.85rem', marginBottom: idx < courts.length - 1 ? '0.65rem' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)' }}>
                      {courtSports.map(sk => getSport(sk).icon).join(' ')} #{court.number}
                    </span>
                    {courts.length > 1 && (
                      <button type="button" onClick={() => removeCourt(idx)}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <div className="grid-2" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.68rem' }}>Name *</label>
                      <input className="form-input" placeholder={`${sp.courtLabel} ${court.number}`}
                        value={court.name} onChange={e => updateCourt(idx, 'name', e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.68rem' }}>Price/Hr (₹) *</label>
                      <input className="form-input" type="number" placeholder="1500" min={1}
                        value={court.price_per_hour} onChange={e => updateCourt(idx, 'price_per_hour', e.target.value)} required />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Sports (select one or more) *</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {SPORTS.filter(s => !s.isGaming).map(s => {
                        const isActive = courtSports.includes(s.key)
                        return (
                          <button key={s.key} type="button" onClick={() => toggleCourtSport(idx, s.key)}
                            style={{
                              padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                              fontSize: '0.7rem', fontWeight: isActive ? 700 : 500,
                              border: `1.5px solid ${isActive ? s.color : 'var(--border-2)'}`,
                              background: isActive ? s.color + '22' : 'var(--bg-3)',
                              color: isActive ? s.color : 'var(--text-3)',
                              fontFamily: "'Sora', sans-serif", transition: 'all 0.15s',
                            }}>
                            {s.icon} {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {isGaming && (
          <GamingSetupConfigurator value={gamingConfigs} onChange={setGamingConfigs} />
        )}

        {/* Amenities */}
        <div className="form-group">
          <label className="form-label">Amenities (comma-separated)</label>
          <input className="form-input" placeholder="Floodlights, Parking, Changing Rooms, Water" value={form.amenities} onChange={e => up('amenities', e.target.value)} />
        </div>

        {/* Rules */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Rules / Notes</label>
          <textarea className="form-input" rows={2} placeholder="No spikes, bring your own equipment…" value={form.rules} onChange={e => up('rules', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

// ── LIVE SLOT MANAGER (real-time unit dashboard) ─────────────
function SlotManager({ venue, onOpenSettings }) {
  const INDEFINITE_BLOCK_DURATION_MINUTES = 24 * 60
  const toast = useToast()
  const { api } = useAuth()
  const days = getNextDays(14)
  const [selectedDate, setSelectedDate] = useState(days[0])
  const [slotRows, setSlotRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [tick, setTick] = useState(0)
  const [blockModal, setBlockModal] = useState(null)
  const [timerMode, setTimerMode] = useState('countdown')

  const venueCourts = getVenueCourts(venue)
  const openTime = venue.open_time ?? 6
  const closeTime = venue.close_time ?? 22
  const baseDuration = venue.slot_duration_minutes || 60

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get(`/slots?venue_id=${venue.id}&date=${selectedDate}`)
      setSlotRows(data || [])
    } catch (err) {
      console.error('Fetch slots error:', err)
    }
    setLoading(false)
  }, [venue.id, selectedDate, api])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const nowMinutes = nowMinutesIST()
  const today = todayIST()
  const isToday = selectedDate === today

  function nowSecondsInIST() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const get = type => Number(parts.find(p => p.type === type)?.value || '0')
    const h = get('hour')
    const m = get('minute')
    const s = get('second')
    return h * 3600 + m * 60 + s
  }

  const currentNowSeconds = isToday ? nowSecondsInIST() : openTime * 3600
  const currentNowMinutes = currentNowSeconds / 60

  function getBlockStartBase(nowMins) {
    const floored = Math.floor(nowMins / 15) * 15
    const diff = nowMins - floored
    const start = diff <= 7 ? floored : Math.ceil(nowMins / 15) * 15
    return Math.max(openTime * 60, start)
  }

  const blockStartBase = isToday ? getBlockStartBase(nowMinutes) : openTime * 60

  function formatClock(mins) {
    return slotTimeLabel(mins, 0).split(' –')[0]
  }

  function statusForCourt(courtNumber) {
    const rows = slotRows.filter(r => Number(r.court_number || 1) === Number(courtNumber))
    const activeRows = rows.filter(r => {
      const start = Number(r.slot_start_minutes)
      const dur = Number(r.slot_duration_minutes || baseDuration)
      const startSec = start * 60
      const endSec = (start + dur) * 60
      return Number.isFinite(start) && currentNowSeconds >= startSec && currentNowSeconds < endSec
    })

    const activeBlocked = activeRows.find(r => r.status === 'blocked')
    const activeBooked = activeRows.find(r => Number(r.booked_count || 0) > 0 || r.status === 'booked' || r.status === 'partial')

    if (activeBlocked) {
      const s = Number(activeBlocked.slot_start_minutes)
      const d = Number(activeBlocked.slot_duration_minutes || baseDuration)
      const startSec = s * 60
      const endSec = (s + d) * 60
      return {
        state: 'blocked',
        label: 'Blocked',
        blockedSlotId: activeBlocked.id,
        indefinite: d >= INDEFINITE_BLOCK_DURATION_MINUTES,
        countdownSec: Math.max(0, endSec - currentNowSeconds),
        elapsedSec: Math.max(0, currentNowSeconds - startSec),
      }
    }

    if (activeBooked) {
      const s = Number(activeBooked.slot_start_minutes)
      const d = Number(activeBooked.slot_duration_minutes || baseDuration)
      const startSec = s * 60
      const endSec = (s + d) * 60
      return {
        state: 'occupied',
        label: 'Occupied',
        countdownSec: Math.max(0, endSec - currentNowSeconds),
        elapsedSec: Math.max(0, currentNowSeconds - startSec),
      }
    }

    const nextBooked = rows
      .filter(r => {
        const start = Number(r.slot_start_minutes)
        const booked = Number(r.booked_count || 0) > 0 || r.status === 'booked' || r.status === 'partial'
        return Number.isFinite(start) && booked && start >= currentNowMinutes
      })
      .sort((a, b) => Number(a.slot_start_minutes) - Number(b.slot_start_minutes))[0]

    return {
      state: 'free',
      label: 'Free',
      nextStart: nextBooked ? Number(nextBooked.slot_start_minutes) : null,
    }
  }

  const courtStates = venueCourts.map(c => ({ court: c, status: statusForCourt(c.number) }))
  const activeCount = courtStates.filter(c => c.status.state === 'occupied').length
  const blockedCount = courtStates.filter(c => c.status.state === 'blocked').length
  const freeCount = courtStates.filter(c => c.status.state === 'free').length

  const upcoming = slotRows
    .filter(r => {
      const start = Number(r.slot_start_minutes)
      const booked = Number(r.booked_count || 0) > 0 || r.status === 'booked' || r.status === 'partial'
      if (!booked || !Number.isFinite(start)) return false
      return selectedDate > today || start >= nowMinutes
    })
    .sort((a, b) => Number(a.slot_start_minutes) - Number(b.slot_start_minutes))

  const blockStart = blockModal?.startMinutes ?? blockStartBase
  const blockNoDuration = !!blockModal?.noDuration
  const blockDuration = blockModal?.durationMinutes ?? baseDuration
  const effectiveBlockDuration = blockNoDuration ? INDEFINITE_BLOCK_DURATION_MINUTES : blockDuration
  const blockEnd = blockStart + effectiveBlockDuration
  const blockMaxStart = closeTime * 60 - (blockNoDuration ? baseDuration : blockDuration)

  useEffect(() => {
    if (!blockModal || !isToday) return
    if (blockModal.startMinutes < blockStartBase) {
      setBlockModal(m => ({ ...m, startMinutes: blockStartBase }))
    }
  }, [tick, blockModal, isToday, blockStartBase])

  const blockDurationOptions = []
  for (let d = baseDuration; d <= closeTime * 60 - blockStart; d += baseDuration) {
    blockDurationOptions.push(d)
  }

  const modalRows = slotRows.filter(r => Number(r.court_number || 1) === Number(blockModal?.courtNumber || 1))
  const overlapInModal = modalRows.filter(r => {
    const start = Number(r.slot_start_minutes)
    const dur = Number(r.slot_duration_minutes || baseDuration)
    if (!Number.isFinite(start)) return false
    const end = start + dur
    return start < blockEnd && end > blockStart
  })
  const modalHasConflict = overlapInModal.some(r => Number(r.booked_count || 0) > 0 || r.status === 'booked' || r.status === 'partial')

  async function confirmBlock() {
    if (!blockModal) return
    if (modalHasConflict) {
      toast.show('This range overlaps existing online bookings.', 'error')
      return
    }
    setBlocking(true)
    try {
      await api.post('/slots/block-range', {
        venue_id: venue.id,
        slot_date: selectedDate,
        court_number: blockModal.courtNumber,
        start_minutes: blockStart,
        duration_minutes: blockNoDuration ? undefined : blockDuration,
        no_duration: blockNoDuration,
        reason: blockModal.reason || 'Walk-in hold',
      })
      toast.show('Slot blocked successfully', 'success')
      setBlockModal(null)
      fetchSlots()
    } catch (err) {
      toast.show(err.message || 'Failed to block slot', 'error')
    } finally {
      setBlocking(false)
    }
  }

  async function unblockIndefinite(slotId) {
    if (!slotId) return
    try {
      await api.patch(`/slots/${slotId}`, { status: 'available' })
      toast.show('Slot unblocked', 'success')
      fetchSlots()
    } catch (err) {
      toast.show(err.message || 'Failed to unblock slot', 'error')
    }
  }

  function timeText(totalSeconds, suffix) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return suffix === 'left' ? '00:00 left' : '00:00 elapsed'
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} ${suffix}`
  }

  return (
    <div>
      <div className="calendar-wrap mb-3">
        <input type="date" className="form-input calendar-input"
          value={selectedDate} min={days[0]} max={days[days.length - 1]}
          onChange={e => setSelectedDate(e.target.value)} />
        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '0.4rem' }}>
          📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className="stat-grid mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatCard icon="✅" num={freeCount} label="Free Units" />
        <StatCard icon="🕒" num={activeCount} label="Active Bookings" />
        <StatCard icon="⛔" num={blockedCount} label="Blocked Units" />
        <StatCard icon="📋" num={upcoming.length} label="Future Bookings" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>Live grid refreshes every 5 seconds · Timer refreshes every second</div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm"
            onClick={() => setTimerMode('countdown')}
            style={{
              background: timerMode === 'countdown' ? 'var(--green-bg)' : 'var(--bg-3)',
              color: timerMode === 'countdown' ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${timerMode === 'countdown' ? 'var(--brand)' : 'var(--border-2)'}`,
            }}>
            Countdown
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setTimerMode('elapsed')}
            style={{
              background: timerMode === 'elapsed' ? 'var(--green-bg)' : 'var(--bg-3)',
              color: timerMode === 'elapsed' ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${timerMode === 'elapsed' ? 'var(--brand)' : 'var(--border-2)'}`,
            }}>
            Elapsed
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onOpenSettings}>Venue Settings</button>
        </div>
      </div>

      {loading ? (
        <div className="flex-center" style={{ height: 120 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {courtStates.map(({ court, status }) => {
            const isFree = status.state === 'free'
            const isOccupied = status.state === 'occupied'
            const isBlocked = status.state === 'blocked'

            const border = isOccupied ? 'var(--red)' : isBlocked ? 'var(--amber)' : 'var(--brand)'
            const bg = isOccupied ? 'var(--red-bg)' : isBlocked ? 'var(--amber-bg)' : 'var(--green-bg)'

            return (
              <div key={court.number} style={{ border: `1.5px solid ${border}`, borderRadius: 'var(--r-sm)', background: bg, padding: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{court.name}</div>
                  <span className={`badge ${isFree ? 'badge-green' : isOccupied ? 'badge-red' : 'badge-amber'}`}>{status.label}</span>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.55rem' }}>
                  {(court.sport_types || [court.sport_type]).map(sk => getSport(sk).icon).join(' ')} {getSport(court.sport_type).label}
                </div>

                {isOccupied || isBlocked ? (
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isOccupied ? 'var(--red)' : 'var(--amber)', marginBottom: '0.55rem' }}>
                    {(isBlocked && status.indefinite)
                      ? timeText(status.elapsedSec, 'elapsed')
                      : timerMode === 'countdown'
                      ? timeText(status.countdownSec, 'left')
                      : timeText(status.elapsedSec, 'elapsed')}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--brand)', marginBottom: '0.55rem' }}>
                    {status.nextStart != null ? `Next booking at ${formatClock(status.nextStart)}` : 'No upcoming booking'}
                  </div>
                )}

                {isBlocked && status.indefinite ? (
                  <button
                    className="btn btn-sm"
                    onClick={() => unblockIndefinite(status.blockedSlotId)}
                    style={{ width: '100%', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                    Unblock Now
                  </button>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={() => setBlockModal({
                      courtNumber: court.number,
                      startMinutes: blockStartBase,
                      durationMinutes: baseDuration,
                      noDuration: false,
                      reason: 'Walk-in hold',
                    })}
                    style={{ width: '100%' }}>
                    Block Slot
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="card card-pad">
        <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Future Bookings</div>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>No upcoming bookings for this date.</div>
        ) : (
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {upcoming.slice(0, 12).map(r => {
              const court = getCourtByNumber(venue, r.court_number || 1)
              const start = Number(r.slot_start_minutes)
              const dur = Number(r.slot_duration_minutes || baseDuration)
              const end = start + dur
              return (
                <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.55rem 0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                  <span>{court?.name || `Court ${r.court_number || 1}`}</span>
                  <span style={{ color: 'var(--text-3)' }}>{formatClock(start)} – {formatClock(end)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {blockModal && (
        <Modal
          title={`Block Slot · ${getCourtByNumber(venue, blockModal.courtNumber)?.name || `Court ${blockModal.courtNumber}`}`}
          onClose={() => setBlockModal(null)}
          maxWidth={520}
          footer={(
            <>
              <button className="btn btn-ghost" onClick={() => setBlockModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={blocking || modalHasConflict} onClick={confirmBlock}>
                {blocking ? 'Blocking…' : 'Confirm Block'}
              </button>
            </>
          )}
        >
          <div style={{ marginBottom: '0.8rem', fontSize: '0.74rem', color: 'var(--text-3)' }}>
            Slider starts from now and moves in 15-minute steps.
          </div>

          <div style={{ marginBottom: '0.8rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.45rem' }}>Start Time</div>
            <input
              type="range"
              min={blockStartBase}
              max={Math.max(blockStartBase, blockMaxStart)}
              step={15}
              value={blockStart}
              onChange={e => setBlockModal(m => ({ ...m, startMinutes: Number(e.target.value) }))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginTop: '0.35rem' }}>
              {formatClock(blockStart)} – {formatClock(blockEnd)}
            </div>
          </div>

          <div style={{ marginBottom: '0.8rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.45rem' }}>Duration</div>
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-2)' }}>
                <input
                  type="checkbox"
                  checked={blockNoDuration}
                  onChange={e => setBlockModal(m => ({ ...m, noDuration: e.target.checked }))}
                />
                Block without duration
              </label>
            </div>
            {!blockNoDuration ? (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {blockDurationOptions.map(d => (
                  <button key={d} type="button" onClick={() => setBlockModal(m => ({ ...m, durationMinutes: d }))}
                    style={{
                      padding: '6px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                      border: `1.5px solid ${d === blockDuration ? 'var(--brand)' : 'var(--border-2)'}`,
                      background: d === blockDuration ? 'var(--green-bg)' : 'var(--bg-3)',
                      color: d === blockDuration ? 'var(--brand)' : 'var(--text-3)',
                      fontWeight: d === blockDuration ? 700 : 500,
                      fontSize: '0.78rem',
                      fontFamily: "'Sora', sans-serif",
                    }}>
                    {d >= 60 ? `${d / 60}h${d % 60 ? ` ${d % 60}m` : ''}` : `${d}m`}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>
                Block stays active until you manually click <strong>Unblock Now</strong>.
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Reason for Block</label>
            <select
              className="form-input form-select"
              value={blockModal.reason}
              onChange={e => setBlockModal(m => ({ ...m, reason: e.target.value }))}>
              <option value="Walk-in hold">Walk-in hold</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Staff training">Staff training</option>
              <option value="Private event">Private event</option>
            </select>
          </div>

          {modalHasConflict && (
            <div style={{ marginTop: '0.8rem', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--r-sm)', padding: '0.6rem', fontSize: '0.75rem', color: 'var(--red)' }}>
              This range overlaps a future online booking and cannot be blocked.
            </div>
          )}
        </Modal>
      )}
      <div style={{ display: 'none' }}>{tick}</div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────
export default function VenueDashboard() {
  const { profile, signOut, api } = useAuth()
  const toast = useToast()
  const { open: menuOpen, toggle: toggleMenu, close: closeMenu } = useMobileMenu()
  const [tab, _setTab] = useState('dashboard')

  // ── Browser back-button support for tab navigation ──
  function setTab(newTab) {
    if (newTab === tab) return
    window.history.pushState({ tab: newTab }, '')
    _setTab(newTab)
  }
  useEffect(() => {
    const onPop = (e) => {
      const prevTab = e.state?.tab || 'dashboard'
      _setTab(prevTab)
    }
    // Replace initial history entry with current tab state
    window.history.replaceState({ tab: 'dashboard' }, '')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [myVenues, setMyVenues] = useState([])
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [bookings, setBookings] = useState([])
  const [showAddVenue, setShowAddVenue] = useState(false)
  const [managePhotosVenue, setManagePhotosVenue] = useState(null)
  const [editVenue, setEditVenue] = useState(null)
  const [stats, setStats] = useState({ total: 0, upcoming: 0, revenue: 0, venues: 0 })

  const fetchVenues = useCallback(async () => {
    setLoadingVenues(true)
    try {
      const data = await api.get('/venues/mine')
      if (data) {
        // Fetch gaming config for gaming venues
        const enriched = await Promise.all(data.map(async (v) => {
          if (v.sport_type === 'gaming') {
            try {
              const gc = await api.get(`/gaming/config/${v.id}`)
              return { ...v, gaming_config: gc }
            } catch { return v }
          }
          return v
        }))
        setMyVenues(enriched)
        if (!selectedVenue && enriched.length) setSelectedVenue(enriched[0])
      }
    } catch (err) { console.error('fetchVenues:', err) }
    setLoadingVenues(false)
  }, [profile.id, api])

  const fetchBookings = useCallback(async () => {
    if (!myVenues.length) return
    try {
      const data = await api.get('/bookings/venue')
      const all = data || []
      setBookings(all)
      const today = new Date().toISOString().split('T')[0]
      setStats({
        total: all.length,
        upcoming: all.filter(b => b.booking_date >= today && b.status === 'confirmed').length,
        revenue: all.filter(b => b.payment_status === 'paid').reduce((s, b) => s + calcVenuePayout(b.total_amount), 0),
        venues: myVenues.length
      })
    } catch (err) { console.error('fetchBookings:', err) }
  }, [myVenues, api])

  useEffect(() => { fetchVenues() }, [fetchVenues])
  useEffect(() => { if (myVenues.length) fetchBookings() }, [myVenues, fetchBookings])

  return (
    <div className="app">
      <Nav profile={profile} onLogout={() => signOut()} onMenuToggle={toggleMenu} menuOpen={menuOpen} />
      <div className="dashboard">
        <MobileSidebarWrapper open={menuOpen} onClose={closeMenu} profile={profile} onLogout={() => signOut()}>
          <div className="sidebar-section">Venue Portal</div>
          {[
            { key: 'dashboard', icon: '📊', label: 'Dashboard' },
            { key: 'venues',    icon: '🏢', label: 'My Venues' },
            { key: 'slots',     icon: '🕐', label: 'Manage Slots' },
            { key: 'bookings',  icon: '📋', label: 'Bookings' },
            { key: 'profile',   icon: '👤', label: 'Profile' },
          ].map(item => (
            <div key={item.key} className={`sidebar-item ${tab === item.key ? 'active' : ''}`} onClick={() => { setTab(item.key); closeMenu() }}>
              <span className="sidebar-icon">{item.icon}</span><span>{item.label}</span>
            </div>
          ))}
        </MobileSidebarWrapper>

        <main className="main">
          {tab === 'dashboard' && (
            <>
              <SectionHeader title="Venue Dashboard" sub={`Welcome back, ${profile?.full_name}`}
                action={<button className="btn btn-primary" onClick={() => setShowAddVenue(true)}>+ Add Venue</button>} />
              <div className="stat-grid mb-4">
                <StatCard icon="🏢" num={stats.venues} label="My Venues" />
                <StatCard icon="📅" num={stats.total} label="Total Bookings" />
                <StatCard icon="⏳" num={stats.upcoming} label="Upcoming" />
                <StatCard icon="💰" num={formatCurrency(stats.revenue)} label="Your Earnings (90%)" />
              </div>
              {myVenues.some(v => v.status === 'pending') && (
                <Alert type="warn">⏳ {myVenues.filter(v => v.status === 'pending').length} venue(s) pending admin approval.</Alert>
              )}
              <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, marginBottom: '1rem', marginTop: '1rem' }}>My Venues</div>
              {loadingVenues ? <div className="flex-center" style={{ height: 120 }}><div className="spinner" /></div> : (
                <div className="venue-grid">
                  {myVenues.map(v => {
                    const sp = getSport(v.sport_type)
                    return (
                      <div key={v.id} className="venue-card">
                        <div className={`venue-card-hero ${sp.heroClass}`} style={v.images?.[0] ? { padding: 0 } : {}} onClick={() => { setSelectedVenue(v); setTab('slots') }}>
                          {v.images?.[0] ? <img src={v.images[0]} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '3.5rem' }}>{sp.icon}</span>}
                        </div>
                        <div className="venue-card-body">
                          <div className="venue-card-name">{v.name}</div>
                          <div className="venue-card-addr">📍 {v.city}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.4rem' }}>
                            {v.num_courts || 1} {v.court_label || sp.courtLabel}(s) · {v.slot_duration_minutes || 60}min slots · {slotTimeLabel(((v.open_time || 6) * 60), 0).split(' –')[0]}–{slotTimeLabel(((v.close_time || 22) * 60), 0).split(' –')[0]}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <span className="sport-tag">{sp.icon} {sp.label}</span>
                            <StatusBadge status={v.status} />
                          </div>
                          <div className="venue-card-footer">
                            <div className="venue-price">{formatCurrency(v.price_per_hour)}<span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>/hr</span></div>
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditVenue(v) }} style={{ fontSize: '0.72rem', padding: '4px 10px' }}>✏️ Edit</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setManagePhotosVenue(v)} style={{ fontSize: '0.72rem', padding: '4px 10px' }}>📷 {v.images?.length || 0}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className="venue-card" style={{ border: '2px dashed var(--border-2)', cursor: 'pointer', minHeight: 200 }} onClick={() => setShowAddVenue(true)}>
                    <div className="flex-center" style={{ flex: 1, padding: '2rem', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-3)' }}>
                      <span style={{ fontSize: '2.5rem' }}>+</span><span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Add New Venue</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'venues' && (
            <>
              <SectionHeader title="My Venues" sub="All your listed facilities" action={<button className="btn btn-primary" onClick={() => setShowAddVenue(true)}>+ Add Venue</button>} />
              {myVenues.length === 0 ? (
                <EmptyState icon="🏢" title="No venues yet" text="Add your first facility" action={<button className="btn btn-primary" onClick={() => setShowAddVenue(true)}>Add Venue</button>} />
              ) : (
                <div className="card">
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Venue</th><th>Sport</th><th>Config</th><th>Price/hr</th><th>Photos</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {myVenues.map(v => {
                          const sp = getSport(v.sport_type)
                          return (
                            <tr key={v.id}>
                              <td><div style={{ fontWeight: 700 }}>{v.name}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{v.city}</div></td>
                              <td><span className="sport-tag">{sp.icon} {sp.label}</span></td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                                {v.num_courts || 1} {v.court_label || sp.courtLabel}(s) · {v.slot_duration_minutes || 60}min
                              </td>
                              <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{formatCurrency(v.price_per_hour)}</td>
                              <td><button className="btn btn-ghost btn-sm" onClick={() => setManagePhotosVenue(v)}>📷 {v.images?.length || 0}/6</button></td>
                              <td><StatusBadge status={v.status} /></td>
                              <td style={{ display: 'flex', gap: '0.35rem' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditVenue(v)}>✏️ Edit</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedVenue(v); setTab('slots') }}>Manage Slots</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'slots' && (
            <>
              <div className="flex-between mb-4">
                <div><h1 className="section-title">Live Venue Dashboard</h1><p className="section-sub">{selectedVenue && isGamingVenue(selectedVenue) ? 'View gaming slot availability' : 'Real-time unit status, countdowns, and manual blocking'}</p></div>
                <select className="form-input form-select" style={{ width: 'min(240px, 100%)' }} value={selectedVenue?.id || ''} onChange={e => setSelectedVenue(myVenues.find(v => v.id === e.target.value))}>
                  {myVenues.filter(v => v.status === 'approved').map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              {!selectedVenue || selectedVenue.status !== 'approved'
                ? <Alert type="warn">Only approved venues can have their slots managed.</Alert>
                : (
                  <div className="card card-pad">
                    <div className="flex-gap mb-3">
                      <span style={{ fontSize: '1.5rem' }}>{getSport(selectedVenue.sport_type).icon}</span>
                      <div>
                        <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700 }}>{selectedVenue.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                          {isGamingVenue(selectedVenue)
                            ? `Gaming Venue · ${selectedVenue.num_courts || 0} setup(s)`
                            : `${selectedVenue.num_courts || 1} ${selectedVenue.court_label || 'Court'}(s) · ${selectedVenue.slot_duration_minutes || 60}min slots · ${formatCurrency(selectedVenue.price_per_hour)}/hr`
                          }
                        </div>
                      </div>
                    </div>
                    {isGamingVenue(selectedVenue)
                      ? <GamingSlotManager venue={selectedVenue} api={api} toast={toast} />
                      : <SlotManager venue={selectedVenue} onOpenSettings={() => setEditVenue(selectedVenue)} />
                    }
                  </div>
                )
              }
            </>
          )}

          {tab === 'bookings' && (
            <>
              <SectionHeader title="Bookings" sub="Customer reservations at your venues" />
              {bookings.length === 0 ? <EmptyState icon="📭" title="No bookings yet" text="Once customers book your venues, they'll appear here." /> : (
                <div className="card">
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Customer</th><th>Venue</th><th>Date</th><th>Slots</th><th>Your Payout</th><th>Status</th><th>Payment</th></tr></thead>
                      <tbody>
                        {bookings.map(b => (
                          <tr key={b.id}>
                            <td><div style={{ fontWeight: 700 }}>{b.profiles?.full_name || '—'}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{b.profiles?.phone}</div></td>
                            <td>{b.venues?.sport_icon} {b.venues?.name}</td>
                            <td>{formatDateFull(b.booking_date)}</td>
                            <td style={{ fontSize: '0.78rem' }}>{b.slots_label?.join(', ')}</td>
                            <td>
                              <div style={{ fontWeight: 700, color: 'var(--brand)' }}>{formatCurrency(calcVenuePayout(b.total_amount))}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>of {formatCurrency(b.total_amount)}</div>
                            </td>
                            <td><StatusBadge status={b.status} /></td>
                            <td><StatusBadge status={b.payment_status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'profile' && (
            <>
              <SectionHeader title="Profile" sub="Your venue owner account" />
              <div className="card" style={{ maxWidth: 460 }}>
                <div className="card-pad">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>{(profile?.full_name || 'V')[0]}</div>
                    <div><div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{profile?.full_name}</div><span className="badge badge-blue">Venue Owner</span></div>
                  </div>
                  {[['📞 Phone', profile?.phone], ['🏙️ City', profile?.city]].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-3)' }}>{label}</span><span style={{ fontWeight: 600 }}>{val || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {showAddVenue && <AddVenueModal ownerId={profile.id} onClose={() => setShowAddVenue(false)} onSaved={() => { fetchVenues(); toast.show('Venue submitted for approval!', 'success') }} />}
      {managePhotosVenue && <ManagePhotosModal venue={managePhotosVenue} onClose={() => setManagePhotosVenue(null)} onSaved={newPhotos => setMyVenues(prev => prev.map(v => v.id === managePhotosVenue.id ? { ...v, images: newPhotos } : v))} />}
      {editVenue && <EditVenueModal venue={editVenue} onClose={() => setEditVenue(null)} onSaved={() => { fetchVenues(); setEditVenue(null) }} />}
      <ToastContainer toasts={toast.toasts} />
      <Footer />
    </div>
  )
}
