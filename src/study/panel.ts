// The study panel: a self-contained view + controller for one focused flashcard
// session. It knows nothing about Cesium — it asks mode.ts (via hooks) to move
// the globe and reveal labels. State machine: picker -> front -> reveal ->
// summary.

import type { MarsFeature } from "../data/types";
import { descriptorMeaning, quadLabel } from "../data/types";
import type { Store } from "./store";
import type { Grade } from "./sm2";
import { GRADE_Q, review, todayISO } from "./sm2";
import type { Scope, Session, SessionCard } from "./deck";
import { availableQuads, buildSession } from "./deck";
import { esc, recordInnerHtml } from "../explore/record";
import { formatDate } from "../lib/meta";

export interface StudyPanelHooks {
  /** Position the globe for a card front (labels stay hidden). */
  onShowFront(card: SessionCard): void;
  /** Reveal the answer on the globe (fly + show the target's label). */
  onReveal(card: SessionCard): void;
  /** Leaving the card flow (to summary/picker): reset the globe to no reveal. */
  onSessionEnd(): void;
}

export interface StudyPanelDeps {
  features: MarsFeature[];
  store: Store;
}

export interface StudyPanel {
  showPicker(): void;
  destroy(): void;
}

type PanelState =
  | { phase: "picker" }
  | { phase: "front"; session: Session; index: number }
  | { phase: "reveal"; session: Session; index: number }
  | { phase: "summary"; correct: number; total: number; scope: Scope };

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: "again", label: "Redo", key: "1" },
  { grade: "hard", label: "Hardly", key: "2" },
  { grade: "good", label: "Well", key: "3" },
  { grade: "easy", label: "Easily", key: "4" },
];

function scopeLabel(scope: Scope): string {
  return scope.kind === "all" ? "Whole catalogue" : quadLabel(scope.quad);
}

export function createStudyPanel(
  root: HTMLElement,
  deps: StudyPanelDeps,
  hooks: StudyPanelHooks,
): StudyPanel {
  const { features, store } = deps;
  const quads = availableQuads(features);

  let state: PanelState = { phase: "picker" };
  let scope: Scope = { kind: "all" };
  let preview: Session | null = null;
  let correct = 0;

  const $ = <T extends HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);

  // ---- transitions -------------------------------------------------------

  function goPicker(): void {
    hooks.onSessionEnd();
    state = { phase: "picker" };
    render(); // clears the minimized state, then shows the picker
  }

  function goFront(session: Session, index: number): void {
    state = { phase: "front", session, index };
    render();
    hooks.onShowFront(session.cards[index]);
  }

  function reveal(): void {
    if (state.phase !== "front") return;
    const { session, index } = state;
    state = { phase: "reveal", session, index };
    render();
    hooks.onReveal(session.cards[index]);
  }

  function grade(g: Grade): void {
    if (state.phase !== "reveal") return;
    const { session, index } = state;
    const card = session.cards[index];
    const next = review(store.get(card.feature.id), g);
    store.set(card.feature.id, next);
    store.logReview({
      id: card.feature.id,
      grade: g,
      q: GRADE_Q[g],
      atISO: todayISO(),
      dir: card.direction,
    });
    if (GRADE_Q[g] >= 3) correct += 1;

    if (index + 1 < session.cards.length) {
      goFront(session, index + 1);
    } else {
      hooks.onSessionEnd();
      state = { phase: "summary", correct, total: session.cards.length, scope: session.scope };
      render();
    }
  }

  function startSession(): void {
    if (!preview || preview.cards.length === 0) return;
    correct = 0;
    goFront(preview, 0);
  }

  // ---- rendering ---------------------------------------------------------

  function render(): void {
    root.classList.remove("is-min"); // each new state opens expanded
    switch (state.phase) {
      case "picker":
        renderPicker();
        break;
      case "front":
        renderFront(state.session, state.index);
        addMinButton();
        break;
      case "reveal":
        renderReveal(state.session, state.index);
        addMinButton();
        break;
      case "summary":
        renderSummary(state.correct, state.total, state.scope);
        break;
    }
  }

  // Minimize / restore: collapse the panel to a slim bar at the bottom to peek the
  // globe, then restore to continue. A small yellow toggle on the panel ("–" ⇄ "+").
  function addMinButton(): void {
    root.insertAdjacentHTML(
      "afterbegin",
      `<button class="study__min" data-min type="button" aria-label="Minimize panel" title="Minimize"></button>`,
    );
    $<HTMLButtonElement>("[data-min]")?.addEventListener("click", toggleMin);
  }

  function toggleMin(): void {
    const minimized = root.classList.toggle("is-min");
    const btn = $<HTMLButtonElement>("[data-min]");
    btn?.setAttribute("aria-label", minimized ? "Restore panel" : "Minimize panel");
    btn?.setAttribute("title", minimized ? "Restore" : "Minimize");
  }

  function buildPreview(): void {
    preview = buildSession(features, store, scope);
    const counts = $<HTMLParagraphElement>("[data-counts]");
    const start = $<HTMLButtonElement>("[data-start]");
    if (!counts || !start) return;
    if (preview.cards.length === 0) {
      counts.textContent = preview.nextDueISO
        ? `All caught up — next due ${formatDate(preview.nextDueISO + "T00:00")}.`
        : "Nothing to study in this deck yet.";
      start.disabled = true;
    } else {
      const { total, due, new: fresh } = preview.counts;
      counts.textContent = `${total} card${total === 1 ? "" : "s"} this session · ${due} due, ${fresh} new available.`;
      start.disabled = false;
    }
  }

  function renderPicker(): void {
    const quadOptions = quads
      .map((q) => `<option value="${q}"${scope.kind === "quad" && scope.quad === q ? " selected" : ""}>${quadLabel(q)}</option>`)
      .join("");
    root.innerHTML = `
      <div class="study__head">
        <h2 class="study__title">Study</h2>
        <p class="study__sub">Spaced repetition · SM-2</p>
      </div>
      <div class="seg seg--block" role="group" aria-label="Deck scope">
        <button class="seg__btn${scope.kind === "all" ? " is-on" : ""}" data-scope="all" type="button">Whole catalogue</button>
        <button class="seg__btn${scope.kind === "quad" ? " is-on" : ""}" data-scope="quad" type="button">By quadrangle</button>
      </div>
      <label class="field" data-quadwrap${scope.kind === "quad" ? "" : " hidden"}>
        <span>Quadrangle</span>
        <select data-quad>${quadOptions}</select>
      </label>
      <p class="study__counts" data-counts></p>
      <button class="btn" data-start type="button">Start session</button>`;

    for (const b of root.querySelectorAll<HTMLButtonElement>("[data-scope]")) {
      b.addEventListener("click", () => {
        const kind = b.dataset.scope;
        scope = kind === "quad" ? { kind: "quad", quad: scope.kind === "quad" ? scope.quad : quads[0] ?? "" } : { kind: "all" };
        renderPicker();
      });
    }
    $<HTMLSelectElement>("[data-quad]")?.addEventListener("change", (e) => {
      scope = { kind: "quad", quad: (e.target as HTMLSelectElement).value };
      buildPreview();
    });
    $<HTMLButtonElement>("[data-start]")?.addEventListener("click", startSession);
    buildPreview();
  }

  function progressHtml(session: Session, index: number): string {
    // Scope ("· Whole catalogue") is wrapped so it can be hidden on phones.
    return `<p class="study__progress">${index + 1} / ${session.cards.length}<span class="study__scope"> · ${esc(scopeLabel(session.scope))}</span></p>`;
  }

  function footHtml(): string {
    return `
      <div class="study__foot">
        <button class="btn" data-reveal type="button">Reveal <kbd>space</kbd></button>
        <button class="btn btn--ghost" data-end type="button">End session</button>
      </div>`;
  }

  function renderFront(session: Session, index: number): void {
    const card = session.cards[index];
    const f = card.feature;
    let body: string;
    if (card.direction === "locate") {
      body = `
        <p class="study__kicker">Locate → Identify</p>
        <p class="study__prompt">What is the highlighted feature — and what kind of feature is it?</p>`;
    } else {
      const meaning = descriptorMeaning(f.type);
      body = `
        <p class="study__kicker">Name → Locate</p>
        <p class="record__eyebrow">${esc(f.type)}${meaning ? ` — ${esc(meaning)}` : ""}</p>
        <h2 class="record__name">${esc(f.name)}</h2>
        <p class="study__prompt">Where is this on Mars?</p>`;
    }
    root.innerHTML = `${progressHtml(session, index)}<div class="study__card">${body}</div>${footHtml()}`;
    $<HTMLButtonElement>("[data-reveal]")?.addEventListener("click", reveal);
    $<HTMLButtonElement>("[data-end]")?.addEventListener("click", goPicker);
  }

  function renderReveal(session: Session, index: number): void {
    const f = session.cards[index].feature;
    const grades = GRADES.map(
      (g) =>
        `<button class="btn study__grade" data-grade="${g.grade}" type="button">${g.label} <kbd>${g.key}</kbd></button>`,
    ).join("");
    root.innerHTML = `
      ${progressHtml(session, index)}
      <div class="study__answer">
        ${recordInnerHtml(f)}
        <a class="study__link" href="${esc(f.url)}" target="_blank" rel="noopener">View in USGS Gazetteer ↗</a>
      </div>
      <p class="study__rate">How well did you recall it?</p>
      <div class="study__grades">${grades}</div>`;
    for (const b of root.querySelectorAll<HTMLButtonElement>("[data-grade]")) {
      b.addEventListener("click", () => grade(b.dataset.grade as Grade));
    }
  }

  function renderSummary(score: number, total: number, sessionScope: Scope): void {
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    root.innerHTML = `
      <div class="study__head">
        <h2 class="study__title">Session complete</h2>
        <p class="study__sub">${esc(scopeLabel(sessionScope))}</p>
      </div>
      <p class="study__score">${score} / ${total}</p>
      <p class="study__sub">${pct}% recalled</p>
      <div class="study__foot">
        <button class="btn" data-again type="button">Study again</button>
        <button class="btn btn--ghost" data-change type="button">Change deck</button>
      </div>`;
    $<HTMLButtonElement>("[data-again]")?.addEventListener("click", () => {
      scope = sessionScope;
      preview = buildSession(features, store, scope);
      startSession();
    });
    $<HTMLButtonElement>("[data-change]")?.addEventListener("click", goPicker);
  }

  // ---- keyboard ----------------------------------------------------------

  function onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    if (state.phase === "front" && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      reveal();
    } else if (state.phase === "reveal") {
      const hit = GRADES.find((g) => g.key === e.key);
      if (hit) {
        e.preventDefault();
        grade(hit.grade);
      }
    }
  }
  document.addEventListener("keydown", onKey);

  return {
    showPicker: goPicker,
    destroy() {
      document.removeEventListener("keydown", onKey);
      root.innerHTML = "";
    },
  };
}
