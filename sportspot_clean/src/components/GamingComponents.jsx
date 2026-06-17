import { useState, useEffect, useCallback } from 'react'
import {
  GAMING_SETUP_TYPES, GAMING_SETUP_LIST, getGamingSetup,
  generateVenueSlots, slotTimeLabel, formatCurrency,
  todayIST, nowMinutesIST,
} from '../lib/constants'

// ══════════════════════════════════════════════════════════════
//  GAMING SETUP CONFIGURATOR  (Venue Owner — AddVenueModal)
// ══════════════════════════════════════════════════════════════
export function GamingSetupConfigurator({ value, onChange }) {
  // value = array of setup configs:
  // [{ setup_type, num_units, price_per_session, games: [{name, consoleNumbers:[]}], pricing: [{player_count, price}] }]
  const configs = value || []

  function updateConfig(idx, field, val) {
    const copy = [...configs]
    copy[idx] = { ...copy[idx], [field]: val }
    onChange(copy)
  }

  function toggleSetupType(key) {
    const exists = configs.find(c => c.setup_type === key)
    if (exists) {
      onChange(configs.filter(c => c.setup_type !== key))
    } else {
      const meta = getGamingSetup(key)
      const initial = {
        setup_type: key,
        num_units: 1,
        price_per_session: '',
        games: [],
        pricing: key === 'ps5'
          ? [{ player_count: 1, price: '' }, { player_count: 2, price: '' }, { player_count: 3, price: '' }, { player_count: 4, price: '' }]
          : [],
      }
      onChange([...configs, initial])
    }
  }

  return (
    <div style={{ background: 'var(--bg-3)', border: '1px solid var(--brand)', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--brand)', marginBottom: '1rem' }}>
        🎮 Gaming Setup Configuration
      </div>

      {/* Setup type toggles */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {GAMING_SETUP_LIST.map(st => {
          const active = configs.some(c => c.setup_type === st.key)
          return (
            <button key={st.key} type="button" onClick={() => toggleSetupType(st.key)}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                border: `2px solid ${active ? st.color : 'var(--border-2)'}`,
                background: active ? st.color + '18' : 'var(--bg-2)',
                color: active ? st.color : 'var(--text-3)',
                fontWeight: active ? 700 : 500, fontSize: '0.82rem',
                fontFamily: "'Sora', sans-serif", transition: 'all 0.15s',
              }}>
              {st.icon} {st.label}
              {active && ' ✓'}
            </button>
          )
        })}
      </div>

      {configs.length === 0 && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', padding: '1rem', textAlign: 'center' }}>
          Select at least one gaming setup type above
        </div>
      )}

      {/* Per-setup config */}
      {configs.map((cfg, idx) => {
        const meta = getGamingSetup(cfg.setup_type)
        return (
          <SetupTypeConfig
            key={cfg.setup_type}
            config={cfg}
            meta={meta}
            onChange={(field, val) => updateConfig(idx, field, val)}
          />
        )
      })}
    </div>
  )
}

function SetupTypeConfig({ config, meta, onChange }) {
  const { setup_type, num_units, price_per_session, games, pricing } = config

  // ── Game management ──────────────────────────────────────────
  function addGame() {
    onChange('games', [...(games || []), { name: '', consoleNumbers: [], max_players: meta.maxPlayers, cover_photo: '' }])
  }
  function updateGame(gIdx, field, val) {
    const copy = [...(games || [])]
    copy[gIdx] = { ...copy[gIdx], [field]: val }
    onChange('games', copy)
  }
  function removeGame(gIdx) {
    onChange('games', (games || []).filter((_, i) => i !== gIdx))
  }

  // ── PS5 pricing ──────────────────────────────────────────────
  function updatePricing(pIdx, val) {
    const copy = [...(pricing || [])]
    copy[pIdx] = { ...copy[pIdx], price: val }
    onChange('pricing', copy)
  }

  // Toggle console number for a game
  function toggleConsole(gIdx, consoleNum) {
    const game = games[gIdx]
    const nums = game.consoleNumbers || []
    const newNums = nums.includes(consoleNum)
      ? nums.filter(n => n !== consoleNum)
      : [...nums, consoleNum].sort((a, b) => a - b)
    updateGame(gIdx, 'consoleNumbers', newNums)
  }

  const consoleNumbers = Array.from({ length: num_units || 1 }, (_, i) => i + 1)

  return (
    <div style={{ background: 'var(--bg-2)', border: `1.5px solid ${meta.color}44`, borderRadius: 8, padding: '1rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: meta.color }}>
          {meta.icon} {meta.label}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', background: 'var(--bg-3)', padding: '2px 8px', borderRadius: 12 }}>
          {meta.slotDuration}min slots · {meta.maxPlayers === 1 ? '1 player' : `1–${meta.maxPlayers} players`}
        </span>
      </div>

      {/* Number of units */}
      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
        <label className="form-label" style={{ fontSize: '0.72rem' }}>
          Number of {meta.unitLabel}s *
        </label>
        <input className="form-input" type="number" min={1} max={50}
          placeholder="e.g. 8"
          value={num_units || ''} onChange={e => onChange('num_units', parseInt(e.target.value) || 1)} />
      </div>

      {/* Price per session (car_racing & ps_vr2) */}
      {setup_type !== 'ps5' && (
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label className="form-label" style={{ fontSize: '0.72rem' }}>
            Price per Session (₹) *
          </label>
          <input className="form-input" type="number" min={1} placeholder="e.g. 500"
            value={price_per_session || ''} onChange={e => onChange('price_per_session', e.target.value)} />
          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>
            {meta.slotDuration}min per session · {meta.maxPlayers === 1 ? '1 player per ' + meta.unitLabel.toLowerCase() : ''}
          </span>
        </div>
      )}

      {/* PS5 player-count pricing */}
      {setup_type === 'ps5' && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '0.5rem' }}>
            Pricing by Player Count *
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            {(pricing || []).map((p, pIdx) => (
              <div key={p.player_count} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 75, color: 'var(--text-2)' }}>
                  {p.player_count} player{p.player_count > 1 ? 's' : ''}
                </span>
                <input className="form-input" type="number" min={1} placeholder="₹"
                  style={{ flex: 1 }}
                  value={p.price || ''} onChange={e => updatePricing(pIdx, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Games */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: 0 }}>
            Games ({(games || []).length})
          </label>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '3px 10px' }} onClick={addGame}>
            + Add Game
          </button>
        </div>

        {(games || []).map((game, gIdx) => (
          <div key={gIdx} style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.65rem', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input className="form-input" placeholder="Game name (e.g. FC26)"
                style={{ flex: 1 }}
                value={game.name} onChange={e => updateGame(gIdx, 'name', e.target.value)} />
              <button type="button" onClick={() => removeGame(gIdx)}
                style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: '0 6px' }}>
                ✕
              </button>
            </div>

            {/* Max players + Cover photo row */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
              {/* Max players */}
              {setup_type === 'ps5' && (
                <div style={{ flex: '0 0 120px' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginBottom: '0.25rem' }}>Max Players</div>
                  <select className="form-input" style={{ fontSize: '0.78rem', padding: '5px 8px' }}
                    value={game.max_players || meta.maxPlayers}
                    onChange={e => updateGame(gIdx, 'max_players', parseInt(e.target.value))}>
                    {Array.from({ length: meta.maxPlayers }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n} player{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cover photo */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginBottom: '0.25rem' }}>Cover Photo</div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {game.cover_photo ? (
                    <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-2)', flexShrink: 0 }}>
                      <img src={game.cover_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button type="button" onClick={() => updateGame(gIdx, 'cover_photo', '')}
                        style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.6rem', padding: '1px 4px', borderRadius: '0 0 0 4px' }}>✕</button>
                    </div>
                  ) : null}
                  <label style={{
                    fontSize: '0.7rem', fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                    border: '1.5px dashed var(--border-2)', background: 'var(--bg-2)', color: 'var(--text-3)',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                  }}>
                    {game.cover_photo ? '🔄 Change' : '📷 Upload'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (f.size > 5 * 1024 * 1024) { alert('Max 5MB'); return }
                        const reader = new FileReader()
                        reader.onload = () => updateGame(gIdx, 'cover_photo', reader.result)
                        reader.readAsDataURL(f)
                        e.target.value = ''
                      }} />
                  </label>
                </div>
              </div>
            </div>

            {/* Console assignment (only for PS5 with >1 console) */}
            {setup_type === 'ps5' && (num_units || 1) > 0 && (
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginBottom: '0.35rem' }}>
                  Installed on which {meta.unitLabel.toLowerCase()}s? (click to toggle)
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {consoleNumbers.map(num => {
                    const active = (game.consoleNumbers || []).includes(num)
                    return (
                      <button key={num} type="button" onClick={() => toggleConsole(gIdx, num)}
                        style={{
                          width: 32, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                          border: `1.5px solid ${active ? meta.color : 'var(--border-2)'}`,
                          background: active ? meta.color + '22' : 'var(--bg-2)',
                          color: active ? meta.color : 'var(--text-3)',
                          transition: 'all 0.1s',
                        }}>
                        {num}
                      </button>
                    )
                  })}
                </div>
                {(game.consoleNumbers || []).length > 0 && (
                  <div style={{ fontSize: '0.65rem', color: meta.color, marginTop: '0.3rem' }}>
                    Available on {game.consoleNumbers.length} of {num_units} {meta.unitLabel.toLowerCase()}(s)
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {(games || []).length === 0 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '0.5rem', textAlign: 'center', background: 'var(--bg-3)', borderRadius: 6 }}>
            No games added yet — add games your customers can play
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  GAMING BOOKING PANEL  (User — VenueDetail)
// ══════════════════════════════════════════════════════════════
export function GamingBookingPanel({ venue, selectedDate, api, profileId, onBookingReady }) {
  const gamingConfig = venue.gaming_config
  if (!gamingConfig?.setups?.length) {
    return <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', padding: '1rem' }}>This gaming venue is not yet configured.</div>
  }

  const [activeSetup, setActiveSetup] = useState(gamingConfig.setups[0]?.setup_type)
  const [selectedGame, setSelectedGame] = useState(null)
  const [playerCount, setPlayerCount] = useState(1)
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedSlots, setSelectedSlots] = useState([])  // array of slot_start_minutes
  const [myBookings, setMyBookings] = useState([])

  const setup = gamingConfig.setups.find(s => s.setup_type === activeSetup)
  const meta = getGamingSetup(activeSetup)
  const games = gamingConfig.games.filter(g => g.setup_type === activeSetup)

  // PS5 pricing
  const ps5Pricing = gamingConfig.ps5Pricing || []
  const currentPrice = activeSetup === 'ps5'
    ? ps5Pricing.find(p => Number(p.player_count) === playerCount)?.price
    : setup?.price_per_session

  // Per-game max players (falls back to setup-level maxPlayers)
  const selectedGameObj = selectedGame ? games.find(g => g.id === selectedGame) : null
  const gameMaxPlayers = (selectedGameObj?.max_players && selectedGameObj.max_players > 0)
    ? Math.min(selectedGameObj.max_players, meta.maxPlayers)
    : meta.maxPlayers

  // Count how many consoles have a specific game
  function getGameConsoleCount(gameId) {
    return (gamingConfig.consoleGames || []).filter(cg => cg.game_id === gameId).length
  }

  // Fetch availability
  const fetchAvailability = useCallback(async () => {
    if (!setup || !selectedDate) return
    setLoading(true)
    try {
      let url = `/gaming/availability?venue_id=${venue.id}&date=${selectedDate}&setup_type=${activeSetup}`
      if (selectedGame && activeSetup === 'ps5') url += `&game_id=${selectedGame}`
      const data = api ? await api.get(url) : await fetch(`/api${url}`).then(r => r.json())
      setAvailability(data)
    } catch (err) {
      console.error('Gaming availability error:', err)
    }
    setLoading(false)
  }, [venue.id, selectedDate, activeSetup, selectedGame, api, setup])

  // Fetch my bookings for the day
  const fetchMyBookings = useCallback(async () => {
    if (!profileId || !api) return
    try {
      const data = await api.get(`/gaming/my-bookings?venue_id=${venue.id}&date=${selectedDate}`)
      setMyBookings(data || [])
    } catch { setMyBookings([]) }
  }, [venue.id, selectedDate, profileId, api])

  useEffect(() => { fetchAvailability() }, [fetchAvailability])
  useEffect(() => { fetchMyBookings() }, [fetchMyBookings])

  // Reset selections on setup change
  useEffect(() => {
    setSelectedGame(null)
    setPlayerCount(1)
    setSelectedSlots([])
    setAvailability(null)
    onBookingReady?.(null)
  }, [activeSetup])

  // Reset slot selection + clamp player count on game/date change
  useEffect(() => {
    setSelectedSlots([])
    onBookingReady?.(null)
    // Clamp player count to selected game's max
    if (selectedGame) {
      const gObj = games.find(g => g.id === selectedGame)
      const gMax = (gObj?.max_players && gObj.max_players > 0) ? Math.min(gObj.max_players, meta.maxPlayers) : meta.maxPlayers
      if (playerCount > gMax) setPlayerCount(gMax)
    }
  }, [selectedGame, selectedDate])

  // Auto-select first game for PS5
  useEffect(() => {
    if (activeSetup === 'ps5' && games.length && !selectedGame) {
      setSelectedGame(games[0].id)
    }
  }, [activeSetup, games, selectedGame])

  const isMyBooking = (startMins) =>
    myBookings.some(b => b.slot_start_minutes === startMins && b.setup_type === activeSetup)

  const fmtTime = (mins) => {
    const h = Math.floor(mins / 60), m = mins % 60
    const period = h >= 12 ? 'PM' : 'AM'
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h
    return m === 0 ? `${display}:00 ${period}` : `${display}:${String(m).padStart(2, '0')} ${period}`
  }

  const isSlotBookable = useCallback((slot) => {
    if (!slot) return false
    if (slot.available <= 0) return false
    if (isMyBooking(slot.slotStartMinutes)) return false
    const today = todayIST()
    if (selectedDate < today) return false
    if (selectedDate === today && slot.slotStartMinutes + slot.durationMinutes < nowMinutesIST()) return false
    return true
  }, [selectedDate, myBookings, activeSetup])

  const findNextBookableStart = useCallback((afterStart = null) => {
    const slots = availability?.slots || []
    const startAfter = Number.isFinite(afterStart) ? afterStart : -1
    const next = slots.find(slot => slot.slotStartMinutes > startAfter && isSlotBookable(slot))
    return next?.slotStartMinutes ?? null
  }, [availability, isSlotBookable])

  function publishBooking(newSlots) {
    if (!newSlots.length) {
      onBookingReady?.(null)
      return
    }

    const gameName = selectedGame ? games.find(g => g.id === selectedGame)?.name : null
    const pricePerSlot = parseFloat(currentPrice) || 0
    const totalPrice = pricePerSlot * newSlots.length
    const dur = availability?.slots?.[0]?.durationMinutes || meta.slotDuration
    const slotLabels = newSlots.map(mins => `${fmtTime(mins)} – ${fmtTime(mins + dur)}`)

    onBookingReady?.({
      venue_id: venue.id,
      date: selectedDate,
      setup_type: activeSetup,
      game_id: selectedGame || null,
      game_name: gameName,
      player_count: playerCount,
      slot_start_minutes_list: newSlots,
      price_per_slot: pricePerSlot,
      price: totalPrice,
      duration: dur,
      slotCount: newSlots.length,
      labels: slotLabels,
      label: gameName
        ? `${meta.icon} ${gameName} · ${playerCount}P · ${newSlots.length} slot${newSlots.length > 1 ? 's' : ''}`
        : `${meta.icon} ${meta.label} · ${newSlots.length} slot${newSlots.length > 1 ? 's' : ''}`,
    })
  }

  function handleSelectSlot(slot) {
    if (!isSlotBookable(slot)) {
      const next = findNextBookableStart(slot.slotStartMinutes)
      if (next != null) {
        const jumped = [next]
        setSelectedSlots(jumped)
        publishBooking(jumped)
      } else {
        setSelectedSlots([])
        publishBooking([])
      }
      return
    }

    const alreadySelected = selectedSlots.includes(slot.slotStartMinutes)
    const newSlots = alreadySelected
      ? selectedSlots.filter(m => m !== slot.slotStartMinutes)
      : [...selectedSlots, slot.slotStartMinutes].sort((a, b) => a - b)

    setSelectedSlots(newSlots)
    publishBooking(newSlots)
  }

  useEffect(() => {
    const slots = availability?.slots || []
    if (!slots.length) {
      if (selectedSlots.length) {
        setSelectedSlots([])
      }
      onBookingReady?.(null)
      return
    }

    const slotMap = new Map(slots.map(s => [s.slotStartMinutes, s]))
    const validSelected = selectedSlots.filter(mins => isSlotBookable(slotMap.get(mins)))

    if (validSelected.length !== selectedSlots.length) {
      if (validSelected.length) {
        setSelectedSlots(validSelected)
        publishBooking(validSelected)
        return
      }
      const next = findNextBookableStart(null)
      if (next != null) {
        const jumped = [next]
        setSelectedSlots(jumped)
        publishBooking(jumped)
        return
      }
      setSelectedSlots([])
      publishBooking([])
      return
    }

    if (!selectedSlots.length) {
      const next = findNextBookableStart(null)
      if (next != null) {
        const jumped = [next]
        setSelectedSlots(jumped)
        publishBooking(jumped)
      } else {
        publishBooking([])
      }
      return
    }

    publishBooking(selectedSlots)
  }, [availability, selectedSlots, isSlotBookable, findNextBookableStart, playerCount, currentPrice, selectedGame, activeSetup, selectedDate])

  return (
    <div>
      {/* Setup type tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {gamingConfig.setups.map(s => {
          const m = getGamingSetup(s.setup_type)
          const active = activeSetup === s.setup_type
          return (
            <button key={s.setup_type} onClick={() => setActiveSetup(s.setup_type)}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                border: `2px solid ${active ? m.color : 'var(--border-2)'}`,
                background: active ? m.color + '18' : 'var(--bg-3)',
                color: active ? m.color : 'var(--text-3)',
                fontWeight: active ? 700 : 500, fontSize: '0.82rem',
                fontFamily: "'Sora', sans-serif", transition: 'all 0.15s',
              }}>
              {m.icon} {m.label}
              <span style={{ fontSize: '0.68rem', opacity: 0.7, marginLeft: 6 }}>
                {s.num_units} {m.unitLabel}{s.num_units > 1 ? 's' : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* Setup info */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--text-3)' }}>
        <span style={{ background: 'var(--bg-3)', padding: '3px 10px', borderRadius: 12 }}>
          ⏱ {meta.slotDuration}min per session
        </span>
        <span style={{ background: 'var(--bg-3)', padding: '3px 10px', borderRadius: 12 }}>
          👥 {gameMaxPlayers === 1 ? '1 player' : `Up to ${gameMaxPlayers} players`}
        </span>
        {currentPrice && (
          <span style={{ background: meta.color + '15', color: meta.color, padding: '3px 10px', borderRadius: 12, fontWeight: 600 }}>
            {formatCurrency(currentPrice)}/session
          </span>
        )}
      </div>

      {/* PS5: Game selector with cover photos */}
      {activeSetup === 'ps5' && games.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>Select Game</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
            {games.map(g => {
              const active = selectedGame === g.id
              const consoleCount = getGameConsoleCount(g.id)
              const maxP = (g.max_players && g.max_players > 0) ? Math.min(g.max_players, meta.maxPlayers) : meta.maxPlayers
              return (
                <button key={g.id} onClick={() => setSelectedGame(g.id)}
                  style={{
                    padding: 0, borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
                    border: `2px solid ${active ? meta.color : 'var(--border-2)'}`,
                    background: active ? meta.color + '12' : 'var(--bg-3)',
                    textAlign: 'center', transition: 'all 0.15s',
                    boxShadow: active ? `0 0 0 1px ${meta.color}44` : 'none',
                  }}>
                  {g.cover_photo ? (
                    <div style={{ width: '100%', height: 80, overflow: 'hidden', background: 'var(--bg-2)' }}>
                      <img src={g.cover_photo} alt={g.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-2)', fontSize: '1.5rem' }}>
                      🎮
                    </div>
                  )}
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{
                      fontSize: '0.78rem', fontWeight: active ? 700 : 600,
                      color: active ? meta.color : 'var(--text)',
                      fontFamily: "'Sora', sans-serif",
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{g.name}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-3)', marginTop: 2 }}>
                      {consoleCount} {meta.unitLabel.toLowerCase()}{consoleCount !== 1 ? 's' : ''} · {maxP}P max
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* PS5: Player count selector (capped by per-game max_players) */}
      {activeSetup === 'ps5' && (
        <div style={{ marginBottom: '1rem' }}>
          <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>Number of Players</label>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {Array.from({ length: gameMaxPlayers }, (_, i) => i + 1).map(pc => {
              const p = ps5Pricing.find(p => Number(p.player_count) === pc)
              if (!p) return null
              const active = playerCount === pc
              return (
                <button key={pc} onClick={() => setPlayerCount(pc)}
                  style={{
                    padding: '8px 14px', borderRadius: 6, cursor: 'pointer', flex: 1,
                    border: `1.5px solid ${active ? meta.color : 'var(--border-2)'}`,
                    background: active ? meta.color + '18' : 'var(--bg-3)',
                    color: active ? meta.color : 'var(--text-2)',
                    fontWeight: active ? 700 : 500, fontSize: '0.78rem',
                    fontFamily: "'Sora', sans-serif", textAlign: 'center',
                  }}>
                  <div>{pc}P</div>
                  <div style={{ fontSize: '0.68rem', opacity: 0.7, marginTop: 2 }}>{formatCurrency(p.price)}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--text-3)', flexWrap: 'wrap' }}>
        <span>⬜ Available</span>
        <span style={{ color: meta.color }}>🟪 Selected</span>
        <span style={{ color: 'var(--amber)' }}>🟧 Limited</span>
        <span style={{ opacity: 0.55 }}>⬛ Full</span>
        <span style={{ color: 'var(--blue)' }}>🔵 Your booking</span>
      </div>

      {/* Time slots */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
      ) : !availability?.slots?.length ? (
        <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', padding: '1.5rem', textAlign: 'center', background: 'var(--bg-3)', borderRadius: 8 }}>
          {activeSetup === 'ps5' && !selectedGame
            ? 'Select a game to see available time slots'
            : 'No time slots available'}
        </div>
      ) : (
        <div className="slot-grid">
          {availability.slots.map(slot => {
            const isMine = isMyBooking(slot.slotStartMinutes)
            const sel = selectedSlots.includes(slot.slotStartMinutes)
            const today = todayIST()
            const nowMins = nowMinutesIST()
            const isPast = selectedDate < today || (selectedDate === today && slot.slotStartMinutes + slot.durationMinutes < nowMins)

            let cls = 'slot slot-available'
            let sublabel = `${slot.available} of ${slot.totalUnits} open`

            if (isPast) {
              cls = 'slot slot-unavailable'; sublabel = 'Unavailable'
            } else if (isMine) {
              cls = 'slot slot-mine'; sublabel = 'Your booking'
            } else if (slot.available <= 0) {
              cls = 'slot slot-unavailable'; sublabel = 'Unavailable'
            } else if (sel) {
              cls = 'slot slot-selected'
            } else if (slot.available < slot.totalUnits) {
              cls = 'slot slot-partial'; sublabel = `${slot.available} of ${slot.totalUnits} left`
            }

            const timeLabel = `${fmtTime(slot.slotStartMinutes)} – ${fmtTime(slot.slotStartMinutes + slot.durationMinutes)}`

            return (
              <div key={slot.slotStartMinutes} className={cls}
                onClick={() => !isPast && !isMine && slot.available > 0 && handleSelectSlot(slot)}
                style={{ cursor: isPast || isMine || slot.available <= 0 ? 'default' : 'pointer' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{timeLabel}</div>
                {sublabel && <div style={{ fontSize: '0.6rem', marginTop: 2, opacity: 0.85 }}>{sublabel}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Multi-slot summary */}
      {selectedSlots.length > 0 && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-3)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.4rem' }}>
            {selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''} selected
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {selectedSlots.map(mins => {
              const dur = availability?.slots?.[0]?.durationMinutes || meta.slotDuration
              return (
                <span key={mins} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 6, background: 'var(--accent)', color: '#fff' }}>
                  {fmtTime(mins)} – {fmtTime(mins + dur)}
                </span>
              )
            })}
          </div>
          <div style={{ marginTop: '0.4rem', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>
            Total: ₹{((parseFloat(currentPrice) || 0) * selectedSlots.length).toLocaleString('en-IN')}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  GAMING SLOT MANAGER  (Venue Owner — manage blocked slots)
// ══════════════════════════════════════════════════════════════
export function GamingSlotManager({ venue, api, toast }) {
  const gamingConfig = venue.gaming_config || { setups: [], consoles: [], games: [] }
  const [activeSetup, setActiveSetup] = useState(gamingConfig.setups?.[0]?.setup_type || 'ps5')
  const [selectedDate, setSelectedDate] = useState(todayIST())
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(false)

  const setup = gamingConfig.setups.find(s => s.setup_type === activeSetup)
  const meta = getGamingSetup(activeSetup)

  const fetchAvailability = useCallback(async () => {
    if (!setup) return
    setLoading(true)
    try {
      const data = await api.get(`/gaming/availability?venue_id=${venue.id}&date=${selectedDate}&setup_type=${activeSetup}`)
      setAvailability(data)
    } catch (err) {
      console.error('Gaming availability error:', err)
    }
    setLoading(false)
  }, [venue.id, selectedDate, activeSetup, api, setup])

  useEffect(() => { fetchAvailability() }, [fetchAvailability])

  if (!gamingConfig.setups?.length) {
    return <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', padding: '1rem' }}>No gaming setups configured yet.</div>
  }

  const fmtTime = (mins) => {
    const h = Math.floor(mins / 60), m = mins % 60
    const period = h >= 12 ? 'PM' : 'AM'
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h
    return m === 0 ? `${display}:00 ${period}` : `${display}:${String(m).padStart(2, '0')} ${period}`
  }

  return (
    <div>
      {/* Setup tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {gamingConfig.setups.map(s => {
          const m = getGamingSetup(s.setup_type)
          const active = activeSetup === s.setup_type
          return (
            <button key={s.setup_type} onClick={() => setActiveSetup(s.setup_type)}
              style={{
                padding: '6px 14px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                border: `1.5px solid ${active ? m.color : 'var(--border-2)'}`,
                background: active ? m.color + '18' : 'var(--bg-3)',
                color: active ? m.color : 'var(--text-3)',
                fontWeight: active ? 700 : 500, fontSize: '0.82rem',
                fontFamily: "'Sora', sans-serif",
              }}>
              {m.icon} {m.label} ({s.num_units})
            </button>
          )
        })}
      </div>

      {/* Date */}
      <div className="calendar-wrap mb-3">
        <input type="date" className="form-input calendar-input"
          value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
      </div>

      {/* Info bar */}
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>
        ⬜ Available &nbsp; 🟧 Partial &nbsp; 🟩 Full &nbsp; — {setup?.num_units || 0} {meta.unitLabel}(s) total
      </div>

      {/* Slots */}
      {loading ? (
        <div className="flex-center" style={{ height: 120 }}><div className="spinner" /></div>
      ) : !availability?.slots?.length ? (
        <div style={{ color: 'var(--text-3)', padding: '1rem', textAlign: 'center' }}>No slots to display</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.6rem' }}>
          {availability.slots.map(slot => {
            const isFull = slot.available <= 0
            const isPartial = slot.booked > 0 && slot.available > 0
            const borderColor = isFull ? 'var(--green)' : isPartial ? 'var(--amber)' : 'var(--border-2)'
            const bg = isFull ? 'var(--green-bg)' : isPartial ? 'var(--amber-bg)' : 'var(--bg-3)'
            let statusText, statusColor
            if (isFull) { statusText = `✓ Full — ${slot.booked}/${slot.totalUnits} booked`; statusColor = 'var(--green)' }
            else if (isPartial) { statusText = `⚡ ${slot.booked}/${slot.totalUnits} booked, ${slot.available} left`; statusColor = 'var(--amber)' }
            else { statusText = `○ Open — ${slot.totalUnits} ${meta.unitLabel.toLowerCase()}(s) available`; statusColor = 'var(--text-3)' }

            const timeLabel = `${fmtTime(slot.slotStartMinutes)} – ${fmtTime(slot.slotStartMinutes + slot.durationMinutes)}`

            return (
              <div key={slot.slotStartMinutes} style={{ border: `1.5px solid ${borderColor}`, borderRadius: 'var(--r-sm)', padding: '0.75rem', background: bg }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 2 }}>{timeLabel}</div>
                <div style={{ fontSize: '0.68rem', color: statusColor }}>{statusText}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
