import type { MarsFeature } from "../data/types";
import { descriptorMeaning, formatLat, quadLabel, westLon } from "../data/types";
import type { ColloquialFeature, LandingSite } from "../data/supplementary";
import { formatDate } from "../lib/meta";

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

function locationHtml(lat: number, lonEast360: number): string {
  const w = westLon(lonEast360);
  return `${formatLat(lat)}, ${lonEast360.toFixed(2)}° E
    <span class="muted">(${w.toFixed(2)}° W)</span>`;
}

/** Date-only ISO strings must be formatted as local dates, or a west-of-UTC
 * timezone shows the previous day. */
function dateHtml(iso: string): string {
  return esc(formatDate(iso + "T00:00"));
}

/** The info-card body (no panel chrome) shared by the Explore record and the
 * Study flip side: descriptor + meaning, name, location/size/quad/year, etymology. */
export function recordInnerHtml(f: MarsFeature): string {
  const meaning = descriptorMeaning(f.type);
  const aka = (f.aka ?? [])
    .map(
      (a) =>
        `<p class="record__aka">Also known as <strong>${esc(a.alias)}</strong>` +
        `${a.year ? ` <span class="muted">(${a.year})</span>` : ""} — ${esc(a.description)}</p>`,
    )
    .join("");
  return `
    <p class="record__eyebrow">${esc(f.type)}${meaning ? ` — ${esc(meaning)}` : ""}</p>
    <h2 class="record__name">${esc(f.name)}</h2>
    ${aka}

    <dl class="record__grid">
      <div><dt>Location</dt><dd>${locationHtml(f.lat, f.lonEast360)}</dd></div>
      ${f.diameterKm ? `<div><dt>Size</dt><dd>${f.diameterKm.toLocaleString()} km across</dd></div>` : ""}
      ${f.quad ? `<div><dt>Quadrangle</dt><dd>${esc(quadLabel(f.quad))}</dd></div>` : ""}
      ${f.approvalYear ? `<div><dt>Named</dt><dd>${f.approvalYear}</dd></div>` : ""}
    </dl>

    ${f.origin ? `<p class="record__origin"><span class="record__label">Etymology</span> ${esc(f.origin)}</p>` : ""}`;
}

/** Landing-site card body, shared by Explore and the Study flip side. */
export function landingInnerHtml(s: LandingSite, nearby: ColloquialFeature[]): string {
  const chips = nearby
    .map((c) => `<button class="chip" type="button" data-goto="${c.id}">${esc(c.name)}</button>`)
    .join("");
  return `
    <p class="record__eyebrow${s.success ? "" : " is-failure"}">Landing site — ${esc(s.outcome)}</p>
    <h2 class="record__name">${esc(s.name)}</h2>

    <dl class="record__grid">
      ${s.mission !== s.name ? `<div><dt>Mission</dt><dd>${esc(s.mission)}</dd></div>` : ""}
      <div><dt>Craft</dt><dd>${esc(s.craft)}</dd></div>
      <div><dt>Agency</dt><dd>${esc(s.agency)} · ${esc(s.country)}</dd></div>
      <div><dt>Launched</dt><dd>${dateHtml(s.launchDate)}</dd></div>
      <div><dt>Landed</dt><dd>${dateHtml(s.landingDate)}</dd></div>
      <div><dt>Region</dt><dd>${esc(s.region)}</dd></div>
      ${s.memorialName ? `<div><dt>Memorial station</dt><dd>${esc(s.memorialName)}</dd></div>` : ""}
      <div><dt>Location</dt><dd>${locationHtml(s.lat, s.lonEast360)}</dd></div>
    </dl>

    ${s.notes ? `<p class="record__origin"><span class="record__label">Notes</span> ${esc(s.notes)}</p>` : ""}
    ${nearby.length ? `<div class="record__nearby"><span class="record__label">Named features near this site</span><div class="record__chips">${chips}</div></div>` : ""}
    ${s.source ? `<p class="record__source">${esc(s.source)}</p>` : ""}`;
}

/** Colloquial (informal) feature card body. */
export function colloquialInnerHtml(c: ColloquialFeature, host: LandingSite | null): string {
  return `
    <p class="record__eyebrow">${esc(c.className)} — informal name</p>
    <h2 class="record__name">${esc(c.name)}</h2>

    <dl class="record__grid">
      <div><dt>Location</dt><dd>${locationHtml(c.lat, c.lonEast360)}</dd></div>
      ${c.sizeKm ? `<div><dt>Size</dt><dd>${c.sizeKm.toLocaleString()} km across</dd></div>` : ""}
      <div><dt>Region</dt><dd>${esc(c.region)}</dd></div>
      ${c.year ? `<div><dt>Named</dt><dd>${c.year}</dd></div>` : ""}
    </dl>

    ${c.description ? `<p class="record__origin"><span class="record__label">About</span> ${esc(c.description)}</p>` : ""}
    ${host ? `<div class="record__nearby"><div class="record__chips"><button class="chip" type="button" data-goto="${host.id}">Near the ${esc(host.name)} landing site</button></div></div>` : ""}`;
}

function renderShell(el: HTMLElement, body: string, actions: string): void {
  el.hidden = false;
  el.classList.remove("is-min"); // each feature opens expanded
  el.innerHTML = `
    <button class="record__min" data-min-record type="button" aria-label="Minimize details" title="Minimize"></button>
    <button class="record__close" aria-label="Close details" data-close>×</button>
    ${body}

    <div class="record__actions">${actions}</div>`;
}

export function renderRecord(
  el: HTMLElement,
  f: MarsFeature,
  onFlyTo: (id: number) => void,
): void {
  renderShell(
    el,
    recordInnerHtml(f),
    `<button class="btn" data-fly>Fly here</button>
     <a class="btn btn--ghost" href="${esc(f.url)}" target="_blank" rel="noopener">View in USGS Gazetteer ↗</a>`,
  );
  el.querySelector("[data-fly]")?.addEventListener("click", () => onFlyTo(f.id));
}

export function renderLandingRecord(
  el: HTMLElement,
  s: LandingSite,
  nearby: ColloquialFeature[],
  opts: { onFlyTo: (id: number) => void; onPickNearby: (id: number) => void },
): void {
  renderShell(el, landingInnerHtml(s, nearby), `<button class="btn" data-fly>Fly here</button>`);
  el.querySelector("[data-fly]")?.addEventListener("click", () => opts.onFlyTo(s.id));
  for (const b of el.querySelectorAll<HTMLButtonElement>("[data-goto]")) {
    b.addEventListener("click", () => opts.onPickNearby(Number(b.dataset.goto)));
  }
}

export function renderColloquialRecord(
  el: HTMLElement,
  c: ColloquialFeature,
  host: LandingSite | null,
  opts: { onFlyTo: (id: number) => void; onPickHost: (id: number) => void },
): void {
  renderShell(el, colloquialInnerHtml(c, host), `<button class="btn" data-fly>Fly here</button>`);
  el.querySelector("[data-fly]")?.addEventListener("click", () => opts.onFlyTo(c.id));
  for (const b of el.querySelectorAll<HTMLButtonElement>("[data-goto]")) {
    b.addEventListener("click", () => opts.onPickHost(Number(b.dataset.goto)));
  }
}

export function clearRecord(el: HTMLElement): void {
  el.hidden = true;
  el.classList.remove("is-min");
  el.innerHTML = "";
}
