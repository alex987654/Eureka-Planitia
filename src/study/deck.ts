// Deck scoping and per-session assembly. A session is a small, bounded list of
// cards: due reviews first (most overdue first), then a capped number of new
// features. Card direction is chosen here so the rest of the app just consumes a
// ready-made Session.

import type { MarsFeature } from "../data/types";
import type { LandingSite } from "../data/supplementary";
import type { Store } from "./store";
import { isDue, todayISO } from "./sm2";

/** locate = globe shows an unlabeled feature, name it. name = given the name, locate it. */
export type Direction = "locate" | "name";

export type Scope = { kind: "all" } | { kind: "quad"; quad: string } | { kind: "landing" };

/** What a flashcard can be about: an official feature or a probe landing site.
 * (Colloquial features stay out — their ids are build-local and must never be
 * persisted by the store.) */
export type StudyItem =
  | { kind: "feature"; feature: MarsFeature }
  | { kind: "landing"; site: LandingSite };

export function itemId(item: StudyItem): number {
  return item.kind === "feature" ? item.feature.id : item.site.id;
}

export interface SessionCard {
  item: StudyItem;
  direction: Direction;
  isNew: boolean;
}

export interface Session {
  cards: SessionCard[];
  scope: Scope;
  counts: { due: number; new: number; future: number; total: number };
  nextDueISO: string | null; // earliest upcoming due date when nothing is ready now
}

export const SESSION_SIZE = 20;
export const NEW_PER_SESSION = 10;

function quadNum(quad: string): number {
  const m = /(\d+)/.exec(quad);
  return m ? Number(m[1]) : 0;
}

/** Distinct non-empty quadrangles present in the data, in MC order. */
export function availableQuads(features: MarsFeature[]): string[] {
  const set = new Set<string>();
  for (const f of features) {
    const q = f.quad.trim().toLowerCase();
    if (q) set.add(q);
  }
  return [...set].sort((a, b) => quadNum(a) - quadNum(b));
}

function inScope(item: StudyItem, scope: Scope): boolean {
  switch (scope.kind) {
    case "all":
      return item.kind === "feature";
    case "quad":
      return item.kind === "feature" && item.feature.quad.trim().toLowerCase() === scope.quad;
    case "landing":
      return item.kind === "landing";
  }
}

function dayEpoch(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, d).getTime() / 86_400_000);
}

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// Small deterministic PRNG so a given day + scope yields a stable session, but
// different days surface different new features.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function buildSession(
  items: StudyItem[],
  store: Store,
  scope: Scope,
  today: string = todayISO(),
): Session {
  const epoch = dayEpoch(today);

  const due: { item: StudyItem; dueISO: string }[] = [];
  const fresh: StudyItem[] = [];
  const future: { item: StudyItem; dueISO: string }[] = [];

  for (const item of items) {
    if (!inScope(item, scope)) continue;
    const state = store.get(itemId(item));
    if (!state) fresh.push(item);
    else if (isDue(state, today)) due.push({ item, dueISO: state.dueISO });
    else future.push({ item, dueISO: state.dueISO });
  }

  due.sort((a, b) =>
    a.dueISO < b.dueISO ? -1 : a.dueISO > b.dueISO ? 1 : itemId(a.item) - itemId(b.item),
  );

  const dueCards = due.slice(0, SESSION_SIZE).map(({ item }) => item);
  const slotsLeft = SESSION_SIZE - dueCards.length;
  // "all" hashes to the same seed as before; "landing" gets its own stream.
  const seed = epoch ^ strHash(scope.kind === "quad" ? scope.quad : scope.kind);
  const newCards =
    slotsLeft > 0
      ? shuffle(fresh, mulberry32(seed)).slice(0, Math.min(NEW_PER_SESSION, slotsLeft))
      : [];

  const newIds = new Set(newCards.map(itemId));
  const cards: SessionCard[] = [...dueCards, ...newCards].map((item) => ({
    item,
    direction: (itemId(item) + epoch) % 2 === 0 ? "locate" : "name",
    isNew: newIds.has(itemId(item)),
  }));

  let nextDueISO: string | null = null;
  if (cards.length === 0) {
    for (const { dueISO } of future) {
      if (nextDueISO === null || dueISO < nextDueISO) nextDueISO = dueISO;
    }
  }

  return {
    cards,
    scope,
    counts: { due: due.length, new: fresh.length, future: future.length, total: cards.length },
    nextDueISO,
  };
}
