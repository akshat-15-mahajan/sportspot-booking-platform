import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import Footer from '../components/Footer'

/* ── Sport filter chips ── */
const SPORT_FILTERS = [
  { key: 'football',   label: 'Football',   icon: '⚽' },
  { key: 'cricket',    label: 'Cricket',    icon: '🏏' },
  { key: 'badminton',  label: 'Badminton',  icon: '🏸' },
  { key: 'tennis',     label: 'Tennis',     icon: '🎾' },
  { key: 'basketball', label: 'Basketball', icon: '🏀' },
  { key: 'swimming',   label: 'Swimming',   icon: '🏊' },
  { key: 'pickleball', label: 'Pickleball', icon: '🏓' },
  { key: 'gokart',     label: 'Go-Kart',    icon: '🏎️' },
]

/* ── Hero sport images that rotate ── */
const HERO_IMAGES = [
  'https://4zsrdrt6a5i03ufb.public.blob.vercel-storage.com/Hero%20Images/brendan-sapp-l5UX-BuRc3E-unsplash.jpg',
  'https://4zsrdrt6a5i03ufb.public.blob.vercel-storage.com/hc-digital-9sOleIZAE54-unsplash.jpg',
  'https://4zsrdrt6a5i03ufb.public.blob.vercel-storage.com/carl-raw-m3hn2Kn5Bns-unsplash.jpg',
  'https://4zsrdrt6a5i03ufb.public.blob.vercel-storage.com/carla-oliveira-21FqSKZQGzI-unsplash.jpg',
]

/* ── Intersection observer hook ── */
function useInView(threshold = 0.2) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true) }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, inView]
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSport, setActiveSport] = useState(null)
  const [topVenues, setTopVenues] = useState([])
  const [heroImgIdx, setHeroImgIdx] = useState(0)
  const [venuesRef, venuesVisible] = useInView(0.15)

  /* Fetch top venues */
  useEffect(() => {
    fetch('/api/venues/top')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTopVenues(data) })
      .catch(() => {})
  }, [])

  /* Rotate hero image */
  useEffect(() => {
    const id = setInterval(() => {
      setHeroImgIdx(i => (i + 1) % HERO_IMAGES.length)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  /* Search handler */
  function handleSearch(e) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (activeSport) params.set('sport', activeSport)
    navigate(`/search?${params.toString()}`)
  }

  function handleSportExplore(sportKey) {
    navigate(`/search?sport=${sportKey}`)
  }

  return (
    <div className="landing-v2">
      {/* ━━ NAV ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav className="lv2-nav">
        <div className="lv2-nav-inner">
          <div className="lv2-nav-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <Logo height={32} />
          </div>

          <div className="lv2-nav-center">
            <button className="lv2-nav-pill" onClick={() => navigate('/search')}>Search</button>
            <button className="lv2-nav-pill" onClick={() => navigate('/search')}>Sports</button>
            <button className="lv2-nav-pill" onClick={() => navigate('/play')}>Profile</button>
          </div>

          <button className="lv2-nav-signup" onClick={() => navigate('/play')}>
            Sign Up
          </button>
        </div>
      </nav>

      {/* ━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="lv2-hero">
        <div className="lv2-hero-inner">
          {/* Left side — headline + search */}
          <div className="lv2-hero-left">
            <h1 className="lv2-hero-title">
              <span className="lv2-hero-line1">Play your</span>
              <span className="lv2-hero-line2">sport.</span>
            </h1>
            <p className="lv2-hero-sub">
              Book premium sports venues across India with ease. Low friction, high performance.
            </p>
            {/* Search bar */}
            <form className="lv2-search-bar" onSubmit={handleSearch}>
              <span className="lv2-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </span>
              <input
                type="text"
                className="lv2-search-input"
                placeholder="Search for venues, sports, or locations"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="lv2-search-btn">Explore</button>
            </form>
          </div>

          {/* Right side — hero image */}
          <div className="lv2-hero-right">
            <div className="lv2-hero-img-wrap">
              {HERO_IMAGES.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="Sport"
                  className={`lv2-hero-img ${i === heroImgIdx ? 'active' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ━━ SPORT FILTER CHIPS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="lv2-sport-chips">
        <div className="lv2-sport-chips-inner">
          {SPORT_FILTERS.map(sp => (
            <button
              key={sp.key}
              className={`lv2-chip ${activeSport === sp.key ? 'active' : ''}`}
              onClick={() => handleSportExplore(sp.key)}
            >
              <span className="lv2-chip-dot" />
              {sp.label.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* ━━ DIVIDER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="lv2-divider" />

      {/* ━━ TOP VENUES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="lv2-venues-section" ref={venuesRef}>
        <div className="lv2-venues-inner">
          <div className="lv2-venues-header">
            <div>
              <span className="lv2-venues-tag">CURATED SPACES</span>
              <h2 className="lv2-venues-title">Top Venues</h2>
            </div>
            <button className="lv2-venues-viewall" onClick={() => navigate('/search')}>
              View All Destinations <span>→</span>
            </button>
          </div>

          <div className="lv2-venues-grid">
            {topVenues.length > 0 ? topVenues.slice(0, 3).map((venue, i) => (
              <VenueCard
                key={venue.id}
                venue={venue}
                visible={venuesVisible}
                delay={i * 0.12}
                onClick={() => navigate(`/venue/${venue.id}`)}
              />
            )) : (
              [0, 1, 2].map(i => (
                <div key={i} className={`lv2-venue-card placeholder ${venuesVisible ? 'visible' : ''}`} style={{ transitionDelay: `${i * 0.12}s` }}>
                  <div className="lv2-venue-img-placeholder" />
                  <div className="lv2-venue-info">
                    <div className="lv2-placeholder-text" style={{ width: '70%' }} />
                    <div className="lv2-placeholder-text" style={{ width: '40%', marginTop: '0.5rem' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Footer />
    </div>
  )
}

/* ── Venue Card Component ── */
function VenueCard({ venue, visible, delay, onClick }) {
  const imgSrc = venue.images?.[0] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=500&q=80'

  return (
    <div
      className={`lv2-venue-card ${visible ? 'visible' : ''}`}
      style={{ transitionDelay: `${delay}s` }}
      onClick={onClick}
    >
      <div className="lv2-venue-img-wrap">
        <img src={imgSrc} alt={venue.name} className="lv2-venue-img" />
      </div>
      <div className="lv2-venue-info">
        <div className="lv2-venue-info-row">
          <h3 className="lv2-venue-name">{venue.name}</h3>
          {venue.rating > 0 && (
            <div className="lv2-venue-rating">
              <span className="lv2-star">★</span> {Number(venue.rating).toFixed(1)}
            </div>
          )}
        </div>
        <div className="lv2-venue-price">
          ₹{Number(venue.price_per_hour).toLocaleString()} / hr
        </div>
      </div>
    </div>
  )
}
