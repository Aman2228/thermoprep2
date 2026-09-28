import { SRS_DEFAULT_EASE, SRS_MIN_EASE } from "@/lib/constants";

/**
 * v1 had no memory of which questions a student had seen or how well they did on
 * them: every "quiz" was generated fresh from a topic string and scored once, then
 * forgotten. v2 tracks one review record per (user, question) and schedules it
 * with the SM-2 algorithm (the same idea Anki uses), so:
 *   - a question you get right with confidence is shown again in days, then weeks
 *   - a question you get wrong resets to "tomorrow" and its topic's mastery drops
 *   - the session builder (lib/quiz-engine.ts) can ask "what's due right now?"
 */

export interface ReviewState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string;
  lastQuality: number | null;
}

export function initialReviewState(now: Date = new Date()): ReviewState {
  return { ease: SRS_DEFAULT_EASE, intervalDays: 0, repetitions: 0, dueAt: now.toISOString(), lastQuality: null };
}

/** quality is 0..5 (Anki-style): 0-2 = failed, 3 = hard-but-correct, 4 = good, 5 = easy. */
export function gradeReview(state: ReviewState, quality: number, now: Date = new Date()): ReviewState {
  const q = Math.max(0, Math.min(5, quality));

  let { ease, intervalDays, repetitions } = state;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);

    repetitions += 1;
  }

  ease = Math.max(SRS_MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return { ease, intervalDays, repetitions, dueAt: dueAt.toISOString(), lastQuality: q };
}

export function isDue(state: Pick<ReviewState, "dueAt">, now: Date = new Date()): boolean {
  return new Date(state.dueAt).getTime() <= now.getTime();
}

/**
 * Turns an auto-graded or AI-graded result into an SM-2 quality score.
 * `confidenceMs` (time to answer) nudges correct answers between "hard" and "easy".
 */
export function qualityFromResult(correct: boolean | null, timeMs?: number): number {
  if (correct === false) return 1;
  if (correct === null) return 3; // ungraded / free-text with no auto-check: treat as neutral

  if (timeMs === undefined) return 4;
  if (timeMs < 12_000) return 5;
  if (timeMs < 35_000) return 4;
  return 3;
}

/** Partial credit (0..1) for AI-graded short answers maps onto the same 0-5 scale. */
export function qualityFromScore(score: number): number {
  const clamped = Math.max(0, Math.min(1, score));
  return Math.round(clamped * 5);
}

/** Rolling topic mastery: exponential moving average of quality/5 over recent reviews. */
export function updateMastery(previous: number | null, quality: number, alpha = 0.35): number {
  const sample = Math.max(0, Math.min(5, quality)) / 5;
  if (previous === null) return sample;
  return previous + alpha * (sample - previous);
}
