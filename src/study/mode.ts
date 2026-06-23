// Coordinates Explore <-> Study. The only module that connects the (Cesium-free)
// study panel to the globe and to the DOM regions. Entering Study hides the
// Explore chrome (via the .study class on #app) and suppresses all name labels;
// the panel then drives per-card camera + label reveals through these hooks.

import type * as Cesium from "cesium";
import type { FeatureLayer } from "../globe/features";
import type { MarsFeature } from "../data/types";
import type { Store } from "./store";
import { clearRecord } from "../explore/record";
import { createStudyPanel } from "./panel";
import type { SessionCard } from "./deck";

export interface StudyModeDeps {
  viewer: Cesium.Viewer;
  layer: FeatureLayer;
  features: MarsFeature[];
  store: Store;
  appEl: HTMLElement;
  studyEl: HTMLElement;
  recordEl: HTMLElement;
  home: {
    destination: Cesium.Cartesian3;
    orientation: { heading: number; pitch: number; roll: number };
  };
}

export interface StudyMode {
  setActive(on: boolean): void;
  isActive(): boolean;
}

export function createStudyMode(deps: StudyModeDeps): StudyMode {
  const { viewer, layer, features, store, appEl, studyEl, recordEl, home } = deps;
  let active = false;

  function flyHome(): void {
    viewer.camera.flyTo({
      destination: home.destination,
      orientation: home.orientation,
      duration: 0.8,
    });
    viewer.scene.requestRender();
  }

  const panel = createStudyPanel(
    studyEl,
    { features, store },
    {
      onShowFront(card: SessionCard) {
        if (card.direction === "locate") {
          // Highlight + fly to the target; its name stays hidden (labels suppressed).
          layer.revealLabel(null);
          layer.select(card.feature.id, { fly: true });
        } else {
          // Name shown in the panel; don't betray the location.
          layer.select(null);
          layer.revealLabel(null);
          flyHome();
        }
      },
      onReveal(card: SessionCard) {
        if (card.direction === "locate") {
          layer.revealLabel(card.feature.id);
        } else {
          layer.select(card.feature.id, { fly: true });
          layer.revealLabel(card.feature.id);
        }
      },
      onSessionEnd() {
        layer.revealLabel(null);
        layer.select(null);
      },
    },
  );

  function setActive(on: boolean): void {
    if (on === active) return;
    active = on;
    if (on) {
      layer.select(null);
      clearRecord(recordEl);
      appEl.classList.add("study");
      studyEl.hidden = false;
      layer.setLabelsHidden(true);
      panel.showPicker();
    } else {
      panel.showPicker(); // reset panel state so its keyboard shortcuts go inert
      layer.setLabelsHidden(false);
      layer.select(null);
      appEl.classList.remove("study");
      studyEl.hidden = true;
      store.flush();
    }
  }

  return { setActive, isActive: () => active };
}
