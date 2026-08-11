import type { ExerciseFeedback, Feedback, SessionVideo } from '../types';

/**
 * Whether the trainer's reply actually went out to the student, as opposed to a
 * draft they are still writing.
 *
 * `status` is the primary signal, but it is not enough on its own: the trainer's
 * debounced auto-save could land *after* "Responder feedback" and knock a
 * delivered reply back down to `'draft'`. `completedAt` is only ever written by
 * that reply and never cleared, so it settles the question for feedbacks caught
 * by that race.
 */
export function isFeedbackDelivered(
  feedback: Pick<Feedback, 'status' | 'completedAt'> | null | undefined,
): boolean {
  return !!feedback && (feedback.status === 'complete' || feedback.completedAt != null);
}

/**
 * The trainer's feedback form groups a session's videos by exercise tag, with
 * untagged videos collected under "Geral" — this is the key that links a video
 * to its `ExerciseFeedback` block.
 */
export function videoFeedbackGroup(video: SessionVideo): string {
  return video.exerciseName || 'Geral';
}

/**
 * Exercise groups the trainer actually answered. An empty block (no text and no
 * media) counts as unanswered — the trainer can respond a session while leaving
 * some exercises blank, which is what makes feedback *partial*.
 */
export function answeredFeedbackGroups(
  exerciseFeedback: ExerciseFeedback[] | undefined,
): Set<string> {
  const answered = new Set<string>();
  for (const ef of exerciseFeedback ?? []) {
    if (ef.textFeedback?.trim() || ef.mediaFiles?.length) answered.add(ef.exerciseName);
  }
  return answered;
}

/**
 * Videos still waiting on the trainer: either their exercise block is empty, or
 * (for videos uploaded after the reply) no block exists for them at all. None
 * left → the feedback covers the whole session; some left → partial feedback.
 */
export function videosAwaitingFeedback(
  videos: SessionVideo[],
  exerciseFeedback: ExerciseFeedback[] | undefined,
): SessionVideo[] {
  const answered = answeredFeedbackGroups(exerciseFeedback);
  return videos.filter((v) => !answered.has(videoFeedbackGroup(v)));
}
