import "./style.css";
import { loadMeta, formatDate, type Meta } from "./lib/meta";

const app = document.getElementById("app")!;

const PHASES: ReadonlyArray<{ n: string; title: string; body: string; done?: boolean }> = [
  { n: "0", title: "Data spine", body: "Self-refreshing catalogue from the USGS Gazetteer, with the last sync shown here.", done: true },
  { n: "1", title: "Explore", body: "A CesiumJS Mars globe with colorized-MOLA imagery; features revealed biggest-first, each with its full record." },
  { n: "2", title: "Study", body: "Flashcards with SM-2 spaced repetition: identify a feature, or recall where it sits." },
  { n: "3", title: "Recall & export", body: "Pick the closest pair among three; finish a session and export your score as a PDF." },
];

function readout(meta: Meta): string {
  const synced = formatDate(meta.last_checked);
  const seed = meta.is_seed
    ? `<span class="tag">seed sample</span>`
    : `<span class="tag tag--live"><span class="pulse" aria-hidden="true"></span>live</span>`;
  return `
    <dl class="readout" aria-label="Catalogue status">
      <div><dt>Catalogue</dt><dd>${meta.feature_count.toLocaleString()} features ${seed}</dd></div>
      <div><dt>Synced from USGS</dt><dd>${synced}</dd></div>
      <div><dt>Coordinates</dt><dd>${meta.coordinate_system} · 0–360</dd></div>
    </dl>`;
}

function render(meta: Meta): void {
  app.setAttribute("aria-busy", "false");
  app.innerHTML = `
    <header class="masthead">
      <p class="eyebrow">Gazetteer of Planetary Nomenclature</p>
      <h1>Mars<span class="middot">·</span>Named&nbsp;Features</h1>
      <p class="lede">A study atlas of every officially named place on Mars — its name,
        what kind of feature it is, and where it sits on the globe. Built for the
        curious adult who wants the real catalogue, not a flyover.</p>
      <div class="rule" aria-hidden="true"></div>
    </header>

    <section class="status">${readout(meta)}</section>

    <section class="roadmap" aria-label="Build roadmap">
      <h2>What's coming</h2>
      <ol class="phases">
        ${PHASES.map(
          (p) => `
          <li class="phase ${p.done ? "is-done" : ""}">
            <span class="phase__n">${p.n}</span>
            <div>
              <h3>${p.title}${p.done ? ' <span class="check" aria-label="shipping">— now</span>' : ""}</h3>
              <p>${p.body}</p>
            </div>
          </li>`
        ).join("")}
      </ol>
    </section>

    <footer class="colophon">
      Feature names and coordinates from the
      <a href="${meta.source_url}" rel="noopener">IAU / USGS ${meta.source.replace("IAU/USGS ", "")}</a>.
      ${meta.note ? `<br /><span class="note">${meta.note}.</span>` : ""}
    </footer>`;
}

function renderError(): void {
  app.setAttribute("aria-busy", "false");
  app.innerHTML = `
    <section class="status status--error" role="alert">
      <h2>Catalogue didn't load</h2>
      <p>The feature data at <code>data/meta.json</code> couldn't be read. If you're
        running locally, start the dev server with <code>npm run dev</code>. On a
        deployed site, check that the latest workflow run finished.</p>
    </section>`;
}

loadMeta().then(render).catch(renderError);
