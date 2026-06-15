import type { MarsFeature } from "../data/types";
import { descriptorMeaning, formatLat, westLon } from "../data/types";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

export function renderRecord(
  el: HTMLElement,
  f: MarsFeature,
  onFlyTo: (id: number) => void,
): void {
  const meaning = descriptorMeaning(f.type);
  const w = westLon(f.lonEast360);
  el.hidden = false;
  el.innerHTML = `
    <button class="record__close" aria-label="Close details" data-close>×</button>
    <p class="record__eyebrow">${esc(f.type)}${meaning ? ` — ${esc(meaning)}` : ""}</p>
    <h2 class="record__name">${esc(f.name)}</h2>

    <dl class="record__grid">
      <div><dt>Location</dt><dd>${formatLat(f.lat)}, ${f.lonEast360.toFixed(2)}° E
        <span class="muted">(${w.toFixed(2)}° W)</span></dd></div>
      ${f.diameterKm ? `<div><dt>Size</dt><dd>${f.diameterKm.toLocaleString()} km across</dd></div>` : ""}
      ${f.quad ? `<div><dt>Quadrangle</dt><dd>${esc(f.quad.toUpperCase())}</dd></div>` : ""}
      ${f.approvalYear ? `<div><dt>Named</dt><dd>${f.approvalYear}</dd></div>` : ""}
    </dl>

    ${f.origin ? `<p class="record__origin"><span class="record__label">Etymology</span> ${esc(f.origin)}</p>` : ""}

    <div class="record__actions">
      <button class="btn" data-fly>Fly here</button>
      <a class="btn btn--ghost" href="${esc(f.url)}" target="_blank" rel="noopener">View in USGS Gazetteer ↗</a>
    </div>`;

  el.querySelector("[data-fly]")?.addEventListener("click", () => onFlyTo(f.id));
}

export function clearRecord(el: HTMLElement): void {
  el.hidden = true;
  el.innerHTML = "";
}
