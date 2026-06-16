import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
import * as Cesium from "cesium";
import { createViewer, MARS } from "./globe/mars";
import { createFeatureLayer } from "./globe/features";
import { createList } from "./explore/list";
import { renderRecord, clearRecord } from "./explore/record";
import { loadFeatures } from "./data/load";
import { loadMeta, formatDate } from "./lib/meta";
import { createStore } from "./study/store";
import { createStudyMode } from "./study/mode";
import type { StudyMode } from "./study/mode";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot(): Promise<void> {
  const globeEl = $("globe");
  const recordEl = $("record");
  const filtersEl = $("filters");
  const listEl = $("list");
  const syncEl = $("sync");
  const searchEl = $<HTMLInputElement>("search");
  const studyEl = $("study");
  const store = createStore();

  const [features, meta] = await Promise.all([loadFeatures(), loadMeta().catch(() => null)]);

  if (meta) {
    syncEl.textContent =
      `Synced ${formatDate(meta.last_checked)} · ${meta.feature_count.toLocaleString()} features` +
      (meta.is_seed ? " (seed)" : "");
  }

  const viewer = createViewer(globeEl);

  // Default "home" framing: straight down on the Valles Marineris hemisphere from
  // high orbit. Shared by the initial load and the re-center button so the button
  // returns to exactly the position the page opens in.
  const HOME_DESTINATION = Cesium.Cartesian3.fromDegrees(-70, 0, 1.5e7, MARS);
  const HOME_ORIENTATION = { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 };
  viewer.camera.setView({ destination: HOME_DESTINATION, orientation: HOME_ORIENTATION });

  const list = createList(filtersEl, listEl, features, {
    onPick: (id) => layer.select(id, { fly: true }),
  });

  let study: StudyMode | null = null;
  const layer = createFeatureLayer(viewer, features, (f) => {
    if (study?.isActive()) return; // in Study mode the panel owns the globe + UI
    if (f) {
      renderRecord(recordEl, f, (id) => layer.flyTo(id));
      list.highlight(f.id);
    } else {
      clearRecord(recordEl);
      list.highlight(null);
    }
  });

  recordEl.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-close]")) layer.select(null);
  });

  searchEl.addEventListener("input", () => list.setQuery(searchEl.value));

  $("toggle-list").addEventListener("click", () =>
    document.getElementById("app")!.classList.toggle("list-open"),
  );

  $("recenter").addEventListener("click", () => {
    viewer.camera.flyTo({
      destination: HOME_DESTINATION,
      orientation: HOME_ORIENTATION,
      duration: 1.0,
    });
    viewer.scene.requestRender();
  });

  study = createStudyMode({
    viewer,
    layer,
    features,
    store,
    appEl: document.getElementById("app")!,
    studyEl,
    recordEl,
    exploreBtn: $("mode-explore"),
    studyBtn: $("mode-study"),
    home: { destination: HOME_DESTINATION, orientation: HOME_ORIENTATION },
  });
  $("mode-explore").addEventListener("click", () => study?.setActive(false));
  $("mode-study").addEventListener("click", () => study?.setActive(true));

  window.addEventListener("pagehide", () => store.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) store.flush();
  });

  viewer.scene.requestRender();
}

boot().catch((err) => {
  console.error(err);
  $("globe").innerHTML =
    `<div class="globe-error" role="alert"><h2>Couldn't start the globe</h2>` +
    `<p>${String(err)}. If running locally, start with <code>npm run dev</code>.</p></div>`;
});
