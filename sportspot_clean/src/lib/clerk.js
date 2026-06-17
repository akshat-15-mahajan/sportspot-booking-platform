// Clerk configuration
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  console.error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable.')
}

// Dark theme appearance for Clerk components
export const clerkAppearance = {
  baseTheme: undefined,
  variables: {
    colorPrimary: '#00C37A',
    colorBackground: '#0a0a14',
    colorText: '#e0e0e0',
    colorInputBackground: '#12121e',
    colorInputText: '#e0e0e0',
    borderRadius: '0.75rem',
  },
  elements: {
    card: { background: 'transparent', boxShadow: 'none' },
    formButtonPrimary: { background: 'var(--brand)', color: '#000', fontWeight: 700 },
    footerAction: { display: 'none' },
    headerTitle: { display: 'none' },
    headerSubtitle: { display: 'none' },
    socialButtonsBlockButton: {
      background: '#12121e',
      border: '1px solid rgba(255,255,255,0.1)',
      color: '#e0e0e0',
    },
  },
}
