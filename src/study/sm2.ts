// SM-2 spaced-repetition engine (SuperMemo 2), hand-written, zero dependencies.
//
// One schedule is kept per feature. The learner grades a flipped card on a
// four-point scale that maps onto SM-2's 0-5 quality (q): Again=2, Hard=3,
// Good=4, Easy=5. Anything below 3 is a lapse. The engine is pure and
// deterministic (today is injectable), so it can be reasoned about without a
// test runner.

/** Per-feature scheduling state, persisted by the store. */
export interface CardState {
  reps: number; // consecutive successful reviews (q>=3); resets to 0 on a lapse
  ef: number; // easiness factor, never below 1.3
  intervalDays: number; // current inter-review interval, whole days
  dueISO: string; // local "YYYY-MM-DD" the card is next due
  lapses: number; // cumulative q<3 events (analytics)
  lastISO: string; // local "YYYY-MM-DD" of the most recent review
}

export type Grade = "again" | "hard" | "good" | "easy";

/** Four-button UI mapped onto the SM-2 quality scale. */
export const GRADE_Q: Record<Grade, 2 | 3 | 4 | 5> = {
  again: 2,
  hard: 3,
  good: 4,
  easy: 5,
};

const MIN_EF = 1.3;
const START_EF = 2.5;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local-day ISO ("YYYY-MM-DD"); local (not UTC) so "today" matches the learner. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Add whole days to a "YYYY-MM-DD" string and re-format (local-date arithmetic). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayISO(dt);
}

/** Zero-padded ISO dates compare lexicographically, so no parsing is needed. */
export function isDue(state: CardState, today: string = todayISO()): boolean {
  return state.dueISO <= today;
}

/**
 * Apply one review. `prev` is null for a never-seen feature (new card). Returns a
 * fresh CardState — never mutates `prev`.
 */
export function review(
  prev: CardState | null,
  grade: Grade,
  today: string = todayISO(),
): CardState {
  const q = GRADE_Q[grade];
  const base: CardState = prev ?? {
    reps: 0,
    ef: START_EF,
    intervalDays: 0,
    dueISO: today,
    lapses: 0,
    lastISO: today,
  };

  // EF is updated on every review, then floored at 1.3.
  const ef = Math.max(
    MIN_EF,
    base.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );

  let reps: number;
  let intervalDays: number;
  let lapses = base.lapses;

  if (q < 3) {
    // Lapse: relearn from the start.
    reps = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    reps = base.reps + 1;
    intervalDays =
      reps === 1 ? 1 : reps === 2 ? 6 : Math.round(base.intervalDays * ef);
  }

  return {
    reps,
    ef,
    intervalDays,
    dueISO: addDaysISO(today, intervalDays),
    lapses,
    lastISO: today,
  };
}
