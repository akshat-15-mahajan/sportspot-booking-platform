import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

/**
 * Send a booking notification email to the venue owner.
 *
 * @param {object} opts
 * @param {string} opts.venueOwnerEmail - venue owner's email address
 * @param {string} opts.venueName       - name of the venue
 * @param {string} opts.customerName    - name of the customer who booked
 * @param {string} opts.customerPhone   - phone number of the customer
 * @param {string} opts.bookingDate     - date of booking (YYYY-MM-DD)
 * @param {string[]} opts.slotsLabel    - human-readable slot labels
 * @param {number} opts.totalAmount     - total amount paid
 * @param {string} opts.paymentRef      - payment reference ID
 */
export async function sendBookingNotification({
  venueOwnerEmail,
  venueName,
  customerName,
  customerPhone,
  bookingDate,
  slotsLabel,
  totalAmount,
  paymentRef,
}) {
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — skipping booking notification email')
    return null
  }

  if (!venueOwnerEmail) {
    console.warn('[Email] Venue owner email not found — skipping notification')
    return null
  }

  const slotsList = (slotsLabel || []).join(', ')
  const formattedDate = new Date(bookingDate).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  try {
    const { data, error } = await resend.emails.send({
      from: 'Rabonna <bookings@rabonna.com>',
      to: venueOwnerEmail,
      subject: `🏟️ New Booking at ${venueName}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827; margin-top: 0;">New Booking Received!</h2>
          <p style="color: #374151; font-size: 15px;">
            You have a new booking at <strong>${venueName}</strong>.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px 12px; background: #f9fafb; border-radius: 8px 8px 0 0; color: #6b7280; font-size: 13px;">Customer</td>
              <td style="padding: 10px 12px; background: #f9fafb; border-radius: 8px 8px 0 0; color: #111827; font-weight: 600;">${customerName || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; color: #6b7280; font-size: 13px;">Phone</td>
              <td style="padding: 10px 12px; color: #111827;">${customerPhone || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; background: #f9fafb; color: #6b7280; font-size: 13px;">Date</td>
              <td style="padding: 10px 12px; background: #f9fafb; color: #111827;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; color: #6b7280; font-size: 13px;">Slots</td>
              <td style="padding: 10px 12px; color: #111827;">${slotsList || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; background: #f9fafb; color: #6b7280; font-size: 13px;">Amount Paid</td>
              <td style="padding: 10px 12px; background: #f9fafb; color: #111827; font-weight: 600;">₹${Number(totalAmount).toFixed(2)}</td>
            </tr>
            ${paymentRef ? `
            <tr>
              <td style="padding: 10px 12px; color: #6b7280; font-size: 13px;">Payment Ref</td>
              <td style="padding: 10px 12px; color: #111827; font-family: monospace;">${paymentRef}</td>
            </tr>` : ''}
          </table>

          <p style="color: #6b7280; font-size: 13px; margin-bottom: 0;">
            — Team Rabonna
          </p>
        </div>
      `,
    })

    if (error) {
      console.error('[Email] Resend error:', error)
      return null
    }

    console.log('[Email] Booking notification sent to', venueOwnerEmail, '— id:', data?.id)
    return data
  } catch (err) {
    console.error('[Email] Failed to send booking notification:', err)
    return null
  }
}
