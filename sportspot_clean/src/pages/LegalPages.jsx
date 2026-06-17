import Footer from '../components/Footer'
import { Logo } from '../components/Logo'

function LegalLayout({ title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Simple nav */}
      <nav style={{ height: 64, background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 2rem', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Logo height={30} />
        </a>
        <a href="/" style={{ marginLeft: 'auto', color: 'var(--brand)', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}>← Back to App</a>
      </nav>

      <main style={{ flex: 1, maxWidth: 780, margin: '0 auto', padding: '3rem 1.5rem', width: '100%' }}>
        <h1 style={{ fontFamily: "'Sora', sans-serif", fontSize: '2rem', fontWeight: 800, marginBottom: '0.4rem' }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-3)', marginBottom: '2rem', fontSize: '0.9rem' }}>{subtitle}</p>}
        <div className="legal-body">{children}</div>
      </main>
      <Footer />
    </div>
  )
}

function H2({ children }) {
  return <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: '1.15rem', marginTop: '2rem', marginBottom: '0.5rem', color: 'var(--text)' }}>{children}</h2>
}
function P({ children }) {
  return <p style={{ fontSize: '0.9rem', lineHeight: 1.75, color: 'var(--text-2)', marginBottom: '0.85rem' }}>{children}</p>
}
function Li({ children }) {
  return <li style={{ fontSize: '0.9rem', lineHeight: 1.75, color: 'var(--text-2)', marginBottom: '0.3rem' }}>{children}</li>
}

// ── PRIVACY POLICY ────────────────────────────────────────────
export function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" subtitle={`Last updated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}>
      <P>Rabonna ("we", "our", or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, and safeguard your data when you use our platform.</P>

      <H2>1. Information We Collect</H2>
      <P>We collect information you provide directly to us:</P>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li>Account details: name, email address, phone number, and city</Li>
        <Li>Booking information: venues booked, dates, time slots, and payment references</Li>
        <Li>Location data: GPS coordinates (only when you grant permission) to show nearby venues</Li>
        <Li>Reviews and ratings you submit for venues</Li>
      </ul>

      <H2>2. How We Use Your Information</H2>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li>To process and confirm your venue bookings</Li>
        <Li>To show you sports venues near your location</Li>
        <Li>To communicate booking confirmations and updates</Li>
        <Li>To improve our platform and user experience</Li>
        <Li>To comply with applicable laws and regulations</Li>
      </ul>

      <H2>3. Payment Information</H2>
      <P>All payments are processed by Razorpay, a PCI-DSS compliant payment gateway. Rabonna does not store your card details, UPI handles, or banking credentials. Your payment data is handled entirely by Razorpay's secure infrastructure.</P>

      <H2>4. Data Sharing</H2>
      <P>We do not sell your personal data. We share information only with:</P>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li>Venue owners — your name and contact details are shared to confirm your booking</Li>
        <Li>Razorpay — for secure payment processing</Li>
        <Li>Service providers — who help us operate our platform (under strict confidentiality)</Li>
      </ul>

      <H2>5. Data Retention</H2>
      <P>We retain your account data for as long as your account is active. Booking history is retained for 3 years for legal and dispute resolution purposes. You may request deletion of your account by contacting us at hello@rabonna.in.</P>

      <H2>6. Your Rights</H2>
      <P>You have the right to access, correct, or delete your personal data. You may also withdraw location permissions at any time through your device settings. Contact us at hello@rabonna.in to exercise these rights.</P>

      <H2>7. Cookies</H2>
      <P>We use only essential cookies required for authentication and session management. We do not use tracking or advertising cookies.</P>

      <H2>8. Contact</H2>
      <P>For privacy-related queries, write to us at <strong>hello@rabonna.in</strong> or visit our <a href="/contact" style={{ color: 'var(--brand)' }}>Contact page</a>.</P>
    </LegalLayout>
  )
}

// ── TERMS & CONDITIONS ────────────────────────────────────────
export function TermsConditions() {
  return (
    <LegalLayout title="Terms & Conditions" subtitle={`Last updated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}>
      <P>By accessing or using Rabonna, you agree to be bound by these Terms and Conditions. Please read them carefully before making any booking.</P>

      <H2>1. Use of the Platform</H2>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li>You must be at least 18 years old to create an account and make bookings</Li>
        <Li>You are responsible for maintaining the confidentiality of your account credentials</Li>
        <Li>You agree not to use the platform for any unlawful or fraudulent purpose</Li>
        <Li>Rabonna reserves the right to suspend or terminate accounts that violate these terms</Li>
      </ul>

      <H2>2. Bookings</H2>
      <P>Bookings are confirmed only upon successful payment. Each booking is subject to the venue's availability at the time of payment. Rabonna is a marketplace — we connect players with venues but are not responsible for the quality, safety, or condition of the venue facilities.</P>

      <H2>3. Payments</H2>
      <P>All prices are displayed in Indian Rupees (INR) and include applicable taxes unless stated otherwise. Payments are processed securely through Razorpay. Rabonna retains a 10% platform fee from each booking; the remaining 90% is remitted to the venue owner.</P>

      <H2>4. Cancellations & Refunds</H2>
      <P>Cancellation and refund policies are governed by our Refund Policy. Please review it before booking. Rabonna's platform fee is non-refundable in all cases.</P>

      <H2>5. Venue Owner Responsibilities</H2>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li>Venue listings must be accurate and not misleading</Li>
        <Li>Venue owners must honour confirmed bookings</Li>
        <Li>Any venue found to be misrepresented may be removed from the platform</Li>
        <Li>Venue owner accounts require admin approval before listings go live</Li>
      </ul>

      <H2>6. Limitation of Liability</H2>
      <P>Rabonna shall not be liable for any injuries, losses, or damages arising from the use of a booked venue. Users engage with venues at their own risk. Our liability is limited to the booking amount paid through our platform.</P>

      <H2>7. Intellectual Property</H2>
      <P>All content, trademarks, and logos on the Rabonna platform are the property of Rabonna or its licensors. You may not reproduce or distribute any content without prior written permission.</P>

      <H2>8. Governing Law</H2>
      <P>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Chandigarh, India.</P>

      <H2>9. Changes to Terms</H2>
      <P>We may update these Terms from time to time. Continued use of the platform after changes constitutes your acceptance of the updated Terms.</P>

      <H2>10. Contact</H2>
      <P>For questions about these Terms, contact us at <strong>hello@rabonna.in</strong>.</P>
    </LegalLayout>
  )
}

// ── REFUND POLICY ─────────────────────────────────────────────
export function RefundPolicy() {
  return (
    <LegalLayout title="Refund Policy" subtitle="How we handle cancellations and refunds">
      <P>We understand that plans can change. Here's how our refund policy works for bookings made through Rabonna.</P>

      <H2>1. Cancellation Window</H2>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li><strong>More than 24 hours before the slot:</strong> Full refund of the venue amount. Platform fee (10%) is non-refundable.</Li>
        <Li><strong>12–24 hours before the slot:</strong> 50% refund of the venue amount.</Li>
        <Li><strong>Less than 12 hours before the slot:</strong> No refund.</Li>
        <Li><strong>No-show:</strong> No refund.</Li>
      </ul>

      <H2>2. Venue Cancellations</H2>
      <P>If a venue cancels your confirmed booking, you are entitled to a full refund including the platform fee. We will also attempt to help you find an alternative venue for the same time slot.</P>

      <H2>3. How to Request a Refund</H2>
      <P>To request a cancellation and refund, please contact us at <strong>hello@rabonna.in</strong> with your booking reference number. Refunds are processed within 5–7 business days to the original payment method.</P>

      <H2>4. Razorpay Refunds</H2>
      <P>Refunds are processed through Razorpay back to your original payment method (UPI, card, or bank account). Once initiated by us, Razorpay typically credits the amount within 5–7 banking days.</P>

      <H2>5. Disputes</H2>
      <P>If you believe you were incorrectly charged or a refund was not processed, please contact us at <strong>hello@rabonna.in</strong> within 30 days of the booking date.</P>
    </LegalLayout>
  )
}

// ── CONTACT US ────────────────────────────────────────────────
export function ContactUs() {
  return (
    <LegalLayout title="Contact Us" subtitle="We'd love to hear from you">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { icon: '📧', label: 'Email', value: 'hello@rabonna.in', href: 'mailto:hello@rabonna.in' },
          { icon: '📞', label: 'Phone', value: '+91 98765 43210', href: 'tel:+919876543210' },
          { icon: '🏢', label: 'Address', value: 'Chandigarh, India', href: null },
          { icon: '⏰', label: 'Support Hours', value: 'Mon–Sat, 9 AM – 7 PM IST', href: null },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '1.25rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{item.icon}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{item.label}</div>
            {item.href
              ? <a href={item.href} style={{ color: 'var(--brand)', fontWeight: 600, textDecoration: 'none', fontSize: '0.9rem' }}>{item.value}</a>
              : <div style={{ color: 'var(--text-2)', fontSize: '0.9rem', fontWeight: 500 }}>{item.value}</div>
            }
          </div>
        ))}
      </div>

      <H2>Send Us a Message</H2>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '1.5rem', maxWidth: 520 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label className="form-label">Name</label>
            <input className="form-input" placeholder="Your full name" />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@example.com" />
          </div>
          <div>
            <label className="form-label">Subject</label>
            <select className="form-input" style={{ cursor: 'pointer' }}>
              <option value="">Select a topic…</option>
              <option>Booking issue</option>
              <option>Refund request</option>
              <option>Venue listing</option>
              <option>Technical support</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="form-label">Message</label>
            <textarea className="form-input" rows={4} placeholder="Describe your issue or query…" style={{ resize: 'vertical', minHeight: 100 }} />
          </div>
          <button className="btn btn-primary"
            onClick={() => { alert('Message sent! We\'ll get back to you within 24 hours.') }}>
            Send Message →
          </button>
        </div>
      </div>

      <H2>For Venue Owners</H2>
      <P>Interested in listing your sports facility on Rabonna? Head to our <a href="/venue" style={{ color: 'var(--brand)' }}>Venue Portal</a> to register and get your venue approved within 24 hours.</P>

      <H2>Report an Issue</H2>
      <P>Found a bug or security issue? Please write to us directly at <strong>hello@rabonna.in</strong> with the details. We take security seriously and aim to address critical issues within 24 hours.</P>
    </LegalLayout>
  )
}

// ── ABOUT ─────────────────────────────────────────────────────
export function AboutPage() {
  return (
    <LegalLayout title="About Rabonna" subtitle="India's sports venue booking platform">
      <P>Rabonna is a platform that connects sports enthusiasts with venues across India. Whether you're looking for a football turf, cricket net, badminton court, or go-kart track — Rabonna helps you find, book, and pay for it in minutes.</P>

      <H2>Our Mission</H2>
      <P>To make sports accessible to everyone by making venue booking effortless. We believe that when booking is easy, people play more — and that's good for individuals, communities, and the world.</P>

      <H2>For Players</H2>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li>Browse venues by sport, location, and price</Li>
        <Li>Book hourly slots with instant confirmation</Li>
        <Li>Pay securely with UPI, cards, or net banking</Li>
        <Li>Get directions and reviews from other players</Li>
      </ul>

      <H2>For Venue Owners</H2>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.85rem' }}>
        <Li>List your facility and start accepting bookings immediately after approval</Li>
        <Li>Manage slot availability and block-off time</Li>
        <Li>Set multi-capacity slots — accept multiple parallel bookings</Li>
        <Li>Receive 90% of every booking directly</Li>
      </ul>

      <H2>Built by Team Rabonna</H2>
      <P>Rabonna was built with love in Chandigarh, India. We're a small but passionate team of sports enthusiasts and technologists working to transform how India books sports venues.</P>
      <P>Questions? Reach us at <a href="/contact" style={{ color: 'var(--brand)' }}>Contact Us</a>.</P>
    </LegalLayout>
  )
}
