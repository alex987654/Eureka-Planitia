import * as Cesium from "cesium";
import { surfacePosition } from "./mars";

// Orientation cues at Mars's rotational poles: a bold "N" at lat +90 and "S" at
// lat -90. They live in their own data source (not the "mars-features" one), so
// Study mode's setLabelsHidden never touches them — the cues stay visible in
// every mode. Same label palette as the feature names (LABEL_FILL/LABEL_OUTLINE
// in features.ts, redefined here since those are module-private), just bolder.
const LABEL_FILL = Cesium.Color.fromCssColorString("#f2efe6");
const LABEL_OUTLINE = Cesium.Color.fromCssColorString("#101216");

function poleLabel(text: string): Cesium.LabelGraphics {
  return new Cesium.LabelGraphics({
    text,
    font: "700 16px system-ui, sans-serif", // bold, a touch larger than feature labels
    fillColor: LABEL_FILL,
    outlineColor: LABEL_OUTLINE,
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    // No distanceDisplayCondition/translucencyByDistance: shown at every zoom,
    // hidden only when the pole is on the far face (handled below).
  });
}

/** Add the "N"/"S" pole cues, hiding whichever pole is on the globe's far side. */
export function addPoleMarkers(viewer: Cesium.Viewer): void {
  const ds = new Cesium.CustomDataSource("poles");
  const poles = [
    { text: "N", pos: surfacePosition(0, 90) },
    { text: "S", pos: surfacePosition(0, -90) },
  ].map(({ text, pos }) => ({
    pos,
    r2: Cesium.Cartesian3.magnitudeSquared(pos), // |pole|^2 == R^2 (it's on the sphere)
    entity: ds.entities.add({ position: pos, label: poleLabel(text) }),
  }));
  viewer.dataSources.add(ds);

  // Hide the pole on the far side. A surface point p (|p| = R, on the Mars sphere
  // centred at the world origin) is on the near, camera-facing cap of the horizon
  // plane iff dot(p, eye) >= R^2. We scope this to just these two entities;
  // depthTestAgainstTerrain is a global flag that would also occlude the feature
  // markers, which intentionally show through.
  viewer.scene.preRender.addEventListener(() => {
    const eye = viewer.camera.positionWC;
    for (const { entity, pos, r2 } of poles) {
      const visible = Cesium.Cartesian3.dot(pos, eye) >= r2;
      // Write only on change: toggling show requests a render (requestRenderMode),
      // and the next preRender finds no change, so it settles instead of looping.
      if (entity.show !== visible) {
        entity.show = visible;
        viewer.scene.requestRender();
      }
    }
  });
}
