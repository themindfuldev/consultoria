/**
 * emailService.ts
 *
 * Client-side transactional email via EmailJS (https://www.emailjs.com).
 * Consultoria has no backend, so the new-registration alert is sent straight
 * from the browser using EmailJS's public key — the same zero-server approach
 * used elsewhere in the app.
 *
 * The destination address is configured in the EmailJS *template* (dashboard),
 * not here, so it never ships in the public bundle. The three values below are
 * public-safe by design; abuse is bounded by EmailJS's allowed-origins list and
 * per-account rate limits.
 *
 * Everything no-ops when the env vars are unset, so the app runs fine without
 * email configured — the `access_requests` queue still records every request.
 */

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string | undefined;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

/**
 * Sends the "new account awaiting approval" alert to the address configured in
 * the EmailJS template. Resolves silently when EmailJS isn't configured; throws
 * on an HTTP error so the caller can decide (callers treat it as non-fatal —
 * the queue remains the reliable record).
 *
 * Template params exposed for the EmailJS template to reference:
 *   {{requester_name}}, {{requester_email}}, {{app_url}}
 */
export async function sendNewRegistrationEmail(params: {
  name: string;
  email: string;
}): Promise<void> {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) return;

  const res = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        requester_name: params.name || '(sem nome)',
        requester_email: params.email || '(sem email)',
        app_url: window.location.origin,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`EmailJS send failed: ${res.status} ${await res.text()}`);
  }
}
