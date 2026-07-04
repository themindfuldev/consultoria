/**
 * notifyService.ts
 *
 * Shared WhatsApp deep-link notification helper. Consultoria has no WhatsApp
 * Business API integration — notifications are `wa.me` deep links opened in a
 * new tab/window, the same zero-cost approach used throughout the app.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Trainer } from '../types';

/**
 * Standard branded layout for every outbound WhatsApp message (WhatsApp markup:
 * `*bold*`, `_italic_`):
 *
 *   *[Consultoria]* {subject}
 *
 *   {body}
 *
 *   _-- Acesse a Consultoria: {baseUrl}_
 */
function formatMessage(subject: string, body: string): string {
  return (
    `*[Consultoria]* ${subject}\n\n` +
    `${body}\n\n` +
    `_-- Acesse a Consultoria: ${window.location.origin}_`
  );
}

/**
 * Opens a `wa.me` deep link to `phone` with the branded message pre-filled.
 * No-ops when `phone` is empty. `subject` is the header line; `body` the content.
 */
export function openWhatsApp(
  phone: string | undefined,
  subject: string,
  body: string,
): void {
  if (!phone) return;
  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent(formatMessage(subject, body))}`,
    '_blank',
  );
}

/**
 * Looks up a trainer's WhatsApp number by email and opens a branded `wa.me`
 * deep link. Silently does nothing if the trainer / phone can't be found, or
 * `trainerEmail` is empty — notifications are a convenience, never a blocker.
 */
export async function notifyTrainer(
  trainerEmail: string | undefined,
  subject: string,
  body: string,
): Promise<void> {
  if (!trainerEmail) return;
  const snap = await getDoc(doc(db, 'trainers', trainerEmail));
  const phone = (snap.data() as Trainer | undefined)?.whatsappPhone ?? '';
  openWhatsApp(phone, subject, body);
}
