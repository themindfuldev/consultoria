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
 * Every outbound message starts with a branded `[Consultoria] {baseUrl}` header.
 * WhatsApp can't hyperlink arbitrary text (no markdown/HTML — it only linkifies
 * raw URLs), so the base URL is placed right after the tag to be tappable.
 */
function withPrefix(body: string): string {
  return `[Consultoria] ${window.location.origin}\n\n${body}`;
}

/**
 * Opens a `wa.me` deep link to `phone` with the branded message pre-filled.
 * No-ops when `phone` is empty. `body` is the message without the prefix.
 */
export function openWhatsApp(phone: string | undefined, body: string): void {
  if (!phone) return;
  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent(withPrefix(body))}`,
    '_blank',
  );
}

/**
 * Looks up a trainer's WhatsApp number by email and opens a branded `wa.me`
 * deep link with `message` pre-filled. Silently does nothing if the trainer /
 * phone can't be found, or `trainerEmail` is empty — notifications are a
 * convenience, never a blocker.
 */
export async function notifyTrainer(
  trainerEmail: string | undefined,
  message: string,
): Promise<void> {
  if (!trainerEmail) return;
  const snap = await getDoc(doc(db, 'trainers', trainerEmail));
  const phone = (snap.data() as Trainer | undefined)?.whatsappPhone ?? '';
  openWhatsApp(phone, message);
}
