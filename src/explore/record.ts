import type { MarsFeature } from "../data/types";
import { descriptorMeaning, formatLat, quadLabel, westLon } from "../data/types";

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

/** The info-card body (no panel chrome) shared by the Explore record and the
 * Study flip side: descriptor + meaning, name, location/size/quad/year, etymology. */
export function recordInnerHtml(f: MarsFeature): string {
  const meaning = descriptorMeaning(f.type);
  const w = westLon(f.lonEast360);
  return `
    <p class="record__eyebrow">${esc(f.type)}${meaning ? ` — ${esc(meaning)}` : ""}</p>
    <h2 class="record__name">${esc(f.name)}</h2>

    <dl class="record__grid">
      <div><dt>Location</dt><dd>${formatLat(f.lat)}, ${f.lonEast360.toFixed(2)}° E
        <span class="muted">(${w.toFixed(2)}° W)</span></dd></div>
      ${f.diameterKm ? `<div><dt>Size</dt><dd>${f.diameterKm.toLocaleString()} km across</dd></div>` : ""}
      ${f.quad ? `<div><dt>Quadrangle</dt><dd>${esc(quadLabel(f.quad))}</dd></div>` : ""}
      ${f.approvalYear ? `<div><dt>Named</dt><dd>${f.approvalYear}</dd></div>` : ""}
    </dl>

    ${f.origin ? `<p class="record__origin"><span class="record__label">Etymology</span> ${esc(f.origin)}</p>` : ""}`;
}

export function renderRecord(
  el: HTMLElement,
  f: MarsFeature,
  onFlyTo: (id: number) => void,
): void {
  el.hidden = false;
  el.classList.remove("is-min"); // each feature opens expanded
  el.innerHTML = `
    <button class="record__min" data-min-record type="button" aria-label="Minimize details" title="Minimize"></button>
    <button class="record__close" aria-label="Close details" data-close>×</button>
    ${recordInnerHtml(f)}

    <div class="record__actions">
      <button class="btn" data-fly>Fly here</button>
      <a class="btn btn--ghost" href="${esc(f.url)}" target="_blank" rel="noopener">View in USGS Gazetteer ↗</a>
    </div>`;

  el.querySelector("[data-fly]")?.addEventListener("click", () => onFlyTo(f.id));
}

export function clearRecord(el: HTMLElement): void {
  el.hidden = true;
  el.classList.remove("is-min");
  el.innerHTML = "";
}
