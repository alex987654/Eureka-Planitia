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

// Load the Tally feedback form on first open (kept off the page until then). Uses
// Tally's embed.js so its dynamicHeight can size the iframe to its content — that's
// what removes the form's inner scrollbar. Falls back to a direct src if the embed
// script is blocked.
function loadFeedbackForm(frame: HTMLIFrameElement): void {
  if (frame.dataset.loaded) return;
  frame.dataset.loaded = "1";
  const url = frame.dataset.src ?? "";
  frame.setAttribute("data-tally-src", url);
  const tally = () => (window as unknown as { Tally?: { loadEmbeds(): void } }).Tally;
  if (tally()) {
    tally()!.loadEmbeds();
    return;
  }
  const s = document.createElement("script");
  s.src = "https://tally.so/widgets/embed.js";
  s.onload = () => tally()?.loadEmbeds();
  s.onerror = () => { frame.src = url; }; // embed.js unavailable -> load form directly
  document.body.appendChild(s);
}

async function boot(): Promise<void> {
  const globeEl = $("globe");
  const recordEl = $("record");
  const filtersEl = $("filters");
  const listEl = $("list");
  const syncEl = $("sync");
  const searchEl = $<HTMLInputElement>("search");
  const studyEl = $("study");
  const appEl = $("app");
  const topbarEl = $("topbar");
  const catalogueEl = $("catalogue");
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
    onPick: (id) => {
      layer.select(id, { fly: true });
      appEl.classList.remove("list-open"); // close the drawer after a pick (phones)
    },
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

  // Catalogue drawer (phones): open via the "Features" button; close via the ✕,
  // a tap outside, picking a row (onPick), or switching modes (setMode).
  $("toggle-list").addEventListener("click", () => appEl.classList.toggle("list-open"));

  const drawerClose = document.createElement("button");
  drawerClose.className = "drawer-close";
  drawerClose.type = "button";
  drawerClose.setAttribute("aria-label", "Close features");
  drawerClose.textContent = "×";
  catalogueEl.prepend(drawerClose);
  drawerClose.addEventListener("click", () => appEl.classList.remove("list-open"));

  appEl.addEventListener("click", (e) => {
    if (!appEl.classList.contains("list-open")) return;
    const t = e.target as HTMLElement;
    if (!t.closest("#catalogue") && !t.closest("#toggle-list")) {
      appEl.classList.remove("list-open"); // tap-outside (scrim) closes it
    }
  });

  // Search lives in the top bar on desktop; on phones it moves into the drawer
  // (top of the catalogue). The single input keeps its existing list.setQuery wiring.
  const phone = window.matchMedia(
    "(max-width: 640px), (max-width: 900px) and (max-height: 480px)",
  );
  function placeSearch(isPhone: boolean): void {
    if (isPhone) {
      if (searchEl.parentElement !== catalogueEl) catalogueEl.insertBefore(searchEl, filtersEl);
    } else if (searchEl.parentElement !== topbarEl) {
      topbarEl.insertBefore(searchEl, syncEl);
    }
  }
  placeSearch(phone.matches);

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
    appEl.classList.remove("list-open"); // don't leave the drawer/scrim stuck across modes
    study?.setActive(mode === "study");
    appEl.classList.toggle("feedback", mode === "feedback");
    if (mode === "feedback") loadFeedbackForm(feedbackFrame);
    for (const key of ["explore", "study", "feedback"] as const) {
      const on = key === mode;
      modeBtns[key].classList.toggle("is-on", on);
      modeBtns[key].setAttribute("aria-selected", String(on));
    }
    // Globe was display:none in Feedback — resize before repainting on the way back.
    if (mode !== "feedback") {
      viewer.resize();
      viewer.scene.requestRender();
    }
  }
  modeBtns.explore.addEventListener("click", () => setMode("explore"));
  modeBtns.study.addEventListener("click", () => setMode("study"));
  modeBtns.feedback.addEventListener("click", () => setMode("feedback"));
  setMode("explore");

  // requestRenderMode means a viewport/orientation/breakpoint size change needs an
  // explicit resize + render, or the globe can show stale/stretched after the change.
  const nudge = () => {
    viewer.resize();
    viewer.scene.requestRender();
  };
  window.addEventListener("resize", nudge);
  window.addEventListener("orientationchange", () => setTimeout(nudge, 250));
  phone.addEventListener("change", (e) => {
    placeSearch(e.matches);
    nudge();
  });

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
