import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
import * as Cesium from "cesium";
import { createViewer, MARS } from "./globe/mars";
import { createFeatureLayer } from "./globe/features";
import { createList } from "./explore/list";
import { renderRecord, clearRecord } from "./explore/record";
import { loadFeatures } from "./data/load";
import { loadMeta, formatDate } from "./lib/meta";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot(): Promise<void> {
  const globeEl = $("globe");
  const recordEl = $("record");
  const filtersEl = $("filters");
  const listEl = $("list");
  const syncEl = $("sync");
  const searchEl = $<HTMLInputElement>("search");

  const [features, meta] = await Promise.all([loadFeatures(), loadMeta().catch(() => null)]);

  if (meta) {
    syncEl.textContent =
      `Synced ${formatDate(meta.last_checked)} · ${meta.feature_count.toLocaleString()} features` +
      (meta.is_seed ? " (seed)" : "");
  }

  const viewer = createViewer(globeEl);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-70, 0, 1.5e7, MARS), // Valles Marineris hemisphere
  });

  const list = createList(filtersEl, listEl, features, {
    onPick: (id) => layer.select(id, { fly: true }),
  });

  const layer = createFeatureLayer(viewer, features, (f) => {
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

  viewer.scene.requestRender();
}

boot().catch((err) => {
  console.error(err);
  $("globe").innerHTML =
    `<div class="globe-error" role="alert"><h2>Couldn't start the globe</h2>` +
    `<p>${String(err)}. If running locally, start with <code>npm run dev</code>.</p></div>`;
});
