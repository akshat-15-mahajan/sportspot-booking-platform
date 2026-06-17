import logoSrc from '../assets/rabonna-logo.png'

// ── Full image logo — used in navbars and auth screens
export function Logo({ height = 36, style = {} }) {
  return (
    <img
      src={logoSrc}
      alt="Rabonna"
      style={{ height, width: 'auto', display: 'block', objectFit: 'contain', ...style }}
    />
  )
}

// ── Text-only wordmark using Rajdhani (matches logo font)
// Used where the image won't show well or as a fallback
export function WordMark({ size = '1.4rem', style = {} }) {
  return (
    <span style={{
      fontFamily: "'Sora', sans-serif",
      fontSize: size,
      fontWeight: 700,
      fontStyle: 'italic',
      letterSpacing: '0.01em',
      background: 'linear-gradient(90deg, #fff 0%, #00C37A 60%, #4D9FFF 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      lineHeight: 1,
      ...style
    }}>
      Rabonna
    </span>
  )
}
