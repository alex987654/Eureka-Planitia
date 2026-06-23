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

  const appEl = document.getElementById("app")!;
  study = createStudyMode({
    viewer,
    layer,
    features,
    store,
    appEl,
    studyEl,
    recordEl,
    home: { destination: HOME_DESTINATION, orientation: HOME_ORIENTATION },
  });

  // Three-way mode selector: Explore / Study / Feedback. Study owns its own
  // experience via setActive(); this coordinator owns the segmented-button state,
  // the Feedback class, and lazy-loading the embedded Tally form.
  const feedbackFrame = $("feedback").querySelector<HTMLIFrameElement>("iframe")!;
  const modeBtns: Record<"explore" | "study" | "feedback", HTMLElement> = {
    explore: $("mode-explore"),
    study: $("mode-study"),
    feedback: $("mode-feedback"),
  };
  function setMode(mode: "explore" | "study" | "feedback"): void {
    study?.setActive(mode === "study");
    appEl.classList.toggle("feedback", mode === "feedback");
    if (mode === "feedback" && !feedbackFrame.src && feedbackFrame.dataset.src) {
      feedbackFrame.src = feedbackFrame.dataset.src; // load Tally only on first open
    }
    for (const key of ["explore", "study", "feedback"] as const) {
      const on = key === mode;
      modeBtns[key].classList.toggle("is-on", on);
      modeBtns[key].setAttribute("aria-selected", String(on));
    }
    if (mode !== "feedback") viewer.scene.requestRender(); // repaint the globe on return
  }
  modeBtns.explore.addEventListener("click", () => setMode("explore"));
  modeBtns.study.addEventListener("click", () => setMode("study"));
  modeBtns.feedback.addEventListener("click", () => setMode("feedback"));
  setMode("explore");

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
