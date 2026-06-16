// Persistence for the study layer: a single, versioned localStorage entry holding
// every feature's SM-2 schedule plus a capped review log. Corruption, an old
// schema, or an unavailable localStorage all degrade gracefully to "everything is
// a new card" — the store never throws into the app.

import type { CardState, Grade } from "./sm2";
import type { Direction } from "./deck";

const STORAGE_KEY = "ep.study.v1";
const SCHEMA_VERSION = 1;
const HISTORY_CAP = 500;

export interface ReviewLogEntry {
  id: number; // feature id
  grade: Grade;
  q: 2 | 3 | 4 | 5;
  atISO: string; // local "YYYY-MM-DD" of the review
  dir: Direction; // card direction reviewed
}

interface PersistShape {
  v: number;
  cards: Record<string, CardState>;
  history: ReviewLogEntry[];
}

export interface Store {
  get(id: number): CardState | null;
  set(id: number, state: CardState): void;
  logReview(entry: ReviewLogEntry): void;
  allStates(): ReadonlyMap<number, CardState>;
  flush(): void;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCardState(v: unknown): v is CardState {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    Number.isFinite(c.reps) &&
    Number.isFinite(c.ef) &&
    Number.isFinite(c.intervalDays) &&
    Number.isFinite(c.lapses) &&
    typeof c.dueISO === "string" &&
    ISO_RE.test(c.dueISO) &&
    typeof c.lastISO === "string" &&
    ISO_RE.test(c.lastISO)
  );
}

function readStorage(): { cards: Map<number, CardState>; history: ReviewLogEntry[] } {
  const empty = { cards: new Map<number, CardState>(), history: [] as ReviewLogEntry[] };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return empty; // localStorage disabled (private mode, etc.)
  }
  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
    if (!parsed || typeof parsed !== "object" || parsed.v !== SCHEMA_VERSION) {
      console.warn("study: ignoring saved progress (unknown schema)");
      return empty;
    }
    const cards = new Map<number, CardState>();
    const rawCards: Record<string, unknown> = parsed.cards ?? {};
    for (const [key, value] of Object.entries(rawCards)) {
      const id = Number(key);
      if (Number.isInteger(id) && isCardState(value)) cards.set(id, value);
    }
    const history = Array.isArray(parsed.history)
      ? parsed.history.slice(-HISTORY_CAP)
      : [];
    return { cards, history };
  } catch {
    console.warn("study: saved progress was corrupt; starting fresh");
    return empty;
  }
}

export function createStore(): Store {
  const { cards, history } = readStorage();
  let dirty = false;
  let saveScheduled = false;
  let storageOk = true;

  function save(): void {
    dirty = false;
    if (!storageOk) return;
    const shape: PersistShape = {
      v: SCHEMA_VERSION,
      cards: Object.fromEntries(cards),
      history,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
    } catch {
      // Quota or disabled: keep running in-memory and stop retrying.
      storageOk = false;
      console.warn("study: could not persist progress; continuing in-memory only");
    }
  }

  function scheduleSave(): void {
    dirty = true;
    if (saveScheduled) return;
    saveScheduled = true;
    queueMicrotask(() => {
      saveScheduled = false;
      if (dirty) save();
    });
  }

  return {
    get(id) {
      return cards.get(id) ?? null;
    },
    set(id, state) {
      cards.set(id, state);
      scheduleSave();
    },
    logReview(entry) {
      history.push(entry);
      if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
      scheduleSave();
    },
    allStates() {
      return cards;
    },
    flush() {
      if (dirty) save();
    },
  };
}
