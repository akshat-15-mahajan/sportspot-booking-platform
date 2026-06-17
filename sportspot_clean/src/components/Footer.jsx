import { Logo } from './Logo'

export default function Footer() {
  const year = new Date().getFullYear()

  const links = [
    {
      heading: 'Company',
      items: [
        { label: 'About Rabonna', href: '/about' },
        { label: 'Contact Us', href: '/contact' },
        { label: 'List Your Venue', href: '/venue' },
      ]
    },
    {
      heading: 'Legal',
      items: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms & Conditions', href: '/terms' },
        { label: 'Refund Policy', href: '/refunds' },
      ]
    },
    {
      heading: 'Sports',
      items: [
        { label: 'Football', href: '/play' },
        { label: 'Cricket', href: '/play' },
        { label: 'Badminton', href: '/play' },
        { label: 'Pickleball & Padel', href: '/play' },
      ]
    },
  ]

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        {/* Brand column */}
        <div className="footer-brand">
          <Logo height={38} style={{ marginBottom: '0.85rem' }} />
          <p className="footer-tagline">
            Book sports venues near you — hourly slots, instant confirmation, real-time availability.
          </p>
          <div className="footer-social">
            {[
              { icon: '𝕏', label: 'Twitter', href: '#' },
              { icon: '📸', label: 'Instagram', href: '#' },
              { icon: 'in', label: 'LinkedIn', href: '#' },
            ].map(s => (
              <a key={s.label} href={s.href} aria-label={s.label} className="footer-social-btn">{s.icon}</a>
            ))}
          </div>
        </div>

        {/* Link columns */}
        {links.map(col => (
          <div key={col.heading} className="footer-col">
            <div className="footer-col-heading">{col.heading}</div>
            {col.items.map(item => (
              <a key={item.label} href={item.href} className="footer-link">{item.label}</a>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom">
        <div className="footer-bottom-copy">
          © {year} Rabonna. All rights reserved.
        </div>
        <div className="footer-madewith">
          Made with <span className="footer-heart">♥</span> — Team Rabonna
        </div>
      </div>
    </footer>
  )
}
