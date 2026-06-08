/**
 * notifyService.ts
 *
 * Shared WhatsApp deep-link notification helper. Consultoria has no WhatsApp
 * Business API integration — notifications are `wa.me` deep links opened in a
 * new tab/window, the same zero-cost approach used throughout the app.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Workspace } from '../types';

/**
 * Looks up the trainer's WhatsApp number for the given workspace and opens a
 * `wa.me` deep link with the given message pre-filled. Resolves once the link
 * has been opened (or silently does nothing if the workspace/phone can't be
 * found — notifications are a convenience, never a blocker).
 */
export async function notifyTrainer(workspaceId: string, message: string): Promise<void> {
  const wsSnap = await getDoc(doc(db, 'workspaces', workspaceId));
  const phone = (wsSnap.data() as Workspace | undefined)?.whatsappPhone ?? '';
  if (!phone) return;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}
