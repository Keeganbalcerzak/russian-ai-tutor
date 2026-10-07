// Lightweight SM-2 spaced-repetition scheduling, adapted for conversational use.
// Each time a tracked word is used in chat it counts as a "review": using it
// correctly pushes its next-due date out; using it wrong resets it and flags it
// as STRUGGLING (i.e. being forgotten).

export type WordStatus = "NEW" | "LEARNING" | "KNOWN" | "STRUGGLING";

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  status: WordStatus;
}

export interface SrsResult extends SrsState {
  dueAt: Date;
  lastSeenAt: Date;
}

const MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Apply one review.
 * @param state current SRS fields
 * @param correct whether the learner used the word correctly
 * @param now reference time (defaults to current time)
 */
export function applyReview(
  state: SrsState,
  correct: boolean,
  now: Date = new Date()
): SrsResult {
  // Map the binary signal to an SM-2 quality score.
  const quality = correct ? 4 : 2;

  let { easeFactor, intervalDays, repetitions } = state;

  // Update ease factor (SM-2 formula), clamped.
  easeFactor = Math.max(
    MIN_EASE,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  let status: WordStatus;

  if (!correct) {
    // Lapse: reset progress and mark as being forgotten.
    repetitions = 0;
    intervalDays = 0.5; // re-surface within ~12h
    status = "STRUGGLING";
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * easeFactor);

    // Promote based on accumulated successful repetitions.
    if (repetitions >= 4) status = "KNOWN";
    else status = "LEARNING";
  }

  const dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
  return { easeFactor, intervalDays, repetitions, status, dueAt, lastSeenAt: now };
}

/** Default SRS state for a brand-new word. */
export function newWordState(now: Date = new Date()): SrsResult {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    status: "NEW",
    dueAt: now, // due immediately so it surfaces for practice
    lastSeenAt: now,
  };
}

/** A word is "due" (candidate for practice / being forgotten) if past its due date. */
export function isDue(dueAt: Date, now: Date = new Date()): boolean {
  return dueAt.getTime() <= now.getTime();
}
