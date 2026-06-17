import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import Footer from '../components/Footer'
import { SPORTS as SPORT_CONFIG } from '../lib/constants'

const SPORT_FILTERS = [
  { key: '',          label: 'All Sports' },
  { key: 'football',  label: 'Football' },
  { key: 'cricket',   label: 'Cricket' },
  { key: 'badminton', label: 'Badminton' },
  { key: 'tennis',    label: 'Tennis' },
  { key: 'pickleball',label: 'Pickleball' },
  { key: 'gokart',    label: 'Go-Kart' },
  { key: 'pool',      label: 'Pool' },
  { key: 'padel',     label: 'Padel' },
  { key: 'gaming',    label: 'Gaming' },
]

const SORT_OPTIONS = [
  { key: '',           label: 'Top Rated' },
  { key: 'price_asc',  label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
  { key: 'newest',     label: 'Newest' },
]

export default function SearchResults() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [sport, setSport] = useState(searchParams.get('sport') || '')
  const [sort, setSort] = useState(searchParams.get('sort') || '')
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)

  /* Fetch venues on filter change */
  useEffect(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (sport) params.set('sport', sport)
    if (sort) params.set('sort', sort)

    setLoading(true)
    fetch(`/api/venues/search?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setVenues(data)
        else setVenues([])
      })
      .catch(() => setVenues([]))
      .finally(() => setLoading(false))
  }, [sport, sort]) // eslint-disable-line

  /* Search submit */
  function handleSearch(e) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (sport) params.set('sport', sport)
    if (sort) params.set('sort', sort)
    setSearchParams(params)

    setLoading(true)
    fetch(`/api/venues/search?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setVenues(data)
        else setVenues([])
      })
      .catch(() => setVenues([]))
      .finally(() => setLoading(false))
  }

  /* Initial search on mount */
  useEffect(() => {
    handleSearch()
  }, []) // eslint-disable-line

  function getSportConfig(key) {
    return SPORT_CONFIG.find(s => s.key === key)
  }

  return (
    <div className="search-page">
      {/* ━━ NAV ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav className="lv2-nav">
        <div className="lv2-nav-inner">
          <div className="lv2-nav-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <Logo height={32} />
          </div>
          <div className="lv2-nav-center">
            <button className="lv2-nav-pill active" onClick={() => navigate('/search')}>Search</button>
            <button className="lv2-nav-pill" onClick={() => navigate('/search')}>Sports</button>
            <button className="lv2-nav-pill" onClick={() => navigate('/play')}>Profile</button>
          </div>
          <button className="lv2-nav-signup" onClick={() => navigate('/play')}>
            Sign Up
          </button>
        </div>
      </nav>

      {/* ━━ SEARCH BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="search-header">
        <div className="search-header-inner">
          <form className="lv2-search-bar search-bar-wide" onSubmit={handleSearch}>
            <span className="lv2-search-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </span>
            <input
              type="text"
              className="lv2-search-input"
              placeholder="Search venues, sports, cities..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button type="submit" className="lv2-search-btn">Search</button>
          </form>

          {/* Filters row */}
          <div className="search-filters">
            <div className="search-filter-group">
              <label className="search-filter-label">Sport</label>
              <div className="search-chips">
                {SPORT_FILTERS.map(sf => (
                  <button
                    key={sf.key}
                    className={`search-chip ${sport === sf.key ? 'active' : ''}`}
                    onClick={() => setSport(sf.key)}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="search-filter-group">
              <label className="search-filter-label">Sort by</label>
              <select className="search-select" value={sort} onChange={e => setSort(e.target.value)}>
                {SORT_OPTIONS.map(so => (
                  <option key={so.key} value={so.key}>{so.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ━━ RESULTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="search-results">
        <div className="search-results-inner">
          {loading ? (
            <div className="search-loading">
              <div className="search-spinner" />
              <span>Finding venues...</span>
            </div>
          ) : venues.length === 0 ? (
            <div className="search-empty">
              <div className="search-empty-icon">🏟️</div>
              <h3>No venues found</h3>
              <p>Try adjusting your search or filters</p>
            </div>
          ) : (
            <>
              <div className="search-count">{venues.length} venue{venues.length !== 1 ? 's' : ''} found</div>
              <div className="search-grid">
                {venues.map(venue => {
                  const sportCfg = getSportConfig(venue.sport_type)
                  const venueSportTypes = venue.sport_types?.length ? venue.sport_types : [venue.sport_type]
                  const imgSrc = venue.images?.[0] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=500&q=80'

                  return (
                    <div
                      key={venue.id}
                      className="search-venue-card"
                      onClick={() => navigate(`/venue/${venue.id}`)}
                    >
                      <div className="search-venue-img-wrap">
                        <img src={imgSrc} alt={venue.name} className="search-venue-img" />
                        <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {venueSportTypes.map(sk => {
                            const sc = getSportConfig(sk)
                            return sc ? (
                              <span key={sk} className="search-venue-sport-badge" style={{ background: sc.color, position: 'static' }}>
                                {sc.icon} {sc.label}
                              </span>
                            ) : null
                          })}
                        </div>
                      </div>
                      <div className="search-venue-body">
                        <div className="search-venue-top-row">
                          <h3 className="search-venue-name">{venue.name}</h3>
                          {venue.rating > 0 && (
                            <div className="search-venue-rating">
                              <span className="lv2-star">★</span> {Number(venue.rating).toFixed(1)}
                            </div>
                          )}
                        </div>
                        <div className="search-venue-location">
                          📍 {venue.city}{venue.state ? `, ${venue.state}` : ''}
                        </div>
                        <div className="search-venue-meta">
                          <span className="search-venue-price">
                            ₹{Number(venue.price_per_hour).toLocaleString()} / hr
                          </span>
                          {venue.amenities?.length > 0 && (
                            <span className="search-venue-amenities">
                              {venue.amenities.slice(0, 3).join(' · ')}
                            </span>
                          )}
                        </div>
                        <button className="btn btn-primary btn-sm search-venue-book-btn">
                          View & Book →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
