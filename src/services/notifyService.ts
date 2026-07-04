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
 * Looks up a trainer's WhatsApp number by email and opens a `wa.me` deep link
 * with the given message pre-filled. Resolves once the link has been opened (or
 * silently does nothing if the trainer/phone can't be found, or `trainerEmail`
 * is empty — notifications are a convenience, never a blocker).
 */
export async function notifyTrainer(
  trainerEmail: string | undefined,
  message: string,
): Promise<void> {
  if (!trainerEmail) return;
  const snap = await getDoc(doc(db, 'trainers', trainerEmail));
  const phone = (snap.data() as Trainer | undefined)?.whatsappPhone ?? '';
  if (!phone) return;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}
