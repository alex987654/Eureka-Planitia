import * as Cesium from "cesium";
import type { MarsFeature } from "../data/types";
import { surfacePosition } from "./mars";

const BASE_COLOR = Cesium.Color.fromCssColorString("#e9e5da").withAlpha(0.92);
const SELECT_COLOR = Cesium.Color.fromCssColorString("#d8a24e"); // highland amber
const OUTLINE = Cesium.Color.fromCssColorString("#14161b").withAlpha(0.85);
const LABEL_FILL = Cesium.Color.fromCssColorString("#f2efe6");
const LABEL_OUTLINE = Cesium.Color.fromCssColorString("#101216");

interface EntityExtra {
  feature: MarsFeature;
  basePx: number;
  baseFar: number;
}

/** Bigger features become visible from farther away (camera distance, metres). */
function farForDiameter(d: number | null): number {
  const dd = d && d > 0 ? d : 60; // default medium for size-less features
  return Cesium.Math.clamp(dd * 12_000, 2.0e5, 4.0e7);
}

function pixelForDiameter(d: number | null): number {
  const dd = d && d > 0 ? d : 60;
  return Cesium.Math.clamp(3 + Math.log10(dd) * 2.0, 4, 9);
}

export interface FeatureLayer {
  select(id: number | null, opts?: { fly?: boolean }): void;
  flyTo(id: number): void;
  /** Study mode: hide every name label (points still show) so a "what is this?"
   * card can't be spoiled. Honors revealLabel(). */
  setLabelsHidden(hidden: boolean): void;
  /** Force one feature's name label visible (the flashcard flip); null hides all
   * again while labels are suppressed. */
  revealLabel(id: number | null): void;
}

export function createFeatureLayer(
  viewer: Cesium.Viewer,
  features: MarsFeature[],
  onSelect: (f: MarsFeature | null) => void,
): FeatureLayer {
  const ds = new Cesium.CustomDataSource("mars-features");
  const byId = new Map<number, Cesium.Entity>();

  for (const f of features) {
    const far = farForDiameter(f.diameterKm);
    const px = pixelForDiameter(f.diameterKm);
    const e = ds.entities.add({
      id: String(f.id),
      position: surfacePosition(f.lon180, f.lat),
      point: new Cesium.PointGraphics({
        pixelSize: px,
        color: BASE_COLOR,
        outlineColor: OUTLINE,
        outlineWidth: 1,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far),
        scaleByDistance: new Cesium.NearFarScalar(1.0e5, 1.0, 3.0e7, 0.45),
      }),
      label: new Cesium.LabelGraphics({
        text: f.name,
        font: "500 13px system-ui, sans-serif",
        fillColor: LABEL_FILL,
        outlineColor: LABEL_OUTLINE,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far * 0.78),
        translucencyByDistance: new Cesium.NearFarScalar(far * 0.55, 1.0, far * 0.78, 0.0),
      }),
    });
    (e as unknown as { _x: EntityExtra })._x = { feature: f, basePx: px, baseFar: far };
    byId.set(f.id, e);
  }

  viewer.dataSources.add(ds);

  let current: Cesium.Entity | null = null;
  let labelsHidden = false;
  let revealedId: number | null = null;

  // Label visibility for study mode. `label.show` overrides distance/selection
  // styling, so a selected (highlighted) target can stay nameless until revealed.
  function applyLabelVisibility(e: Cesium.Entity): void {
    if (!e.label) return;
    const x = (e as unknown as { _x: EntityExtra })._x;
    e.label.show = new Cesium.ConstantProperty(!labelsHidden || x.feature.id === revealedId);
  }

  function style(e: Cesium.Entity | null, selected: boolean): void {
    if (!e || !e.point || !e.label) return;
    const x = (e as unknown as { _x: EntityExtra })._x;
    e.point.color = new Cesium.ConstantProperty(selected ? SELECT_COLOR : BASE_COLOR);
    e.point.pixelSize = new Cesium.ConstantProperty(selected ? x.basePx + 5 : x.basePx);
    e.point.distanceDisplayCondition = new Cesium.ConstantProperty(
      new Cesium.DistanceDisplayCondition(0, selected ? Number.MAX_VALUE : x.baseFar),
    );
    e.label.distanceDisplayCondition = new Cesium.ConstantProperty(
      new Cesium.DistanceDisplayCondition(0, selected ? Number.MAX_VALUE : x.baseFar * 0.78),
    );
  }

  function flyToEntity(e: Cesium.Entity): void {
    const x = (e as unknown as { _x: EntityExtra })._x;
    const pos = (e.position as Cesium.ConstantPositionProperty).getValue(
      Cesium.JulianDate.now(),
    )!;
    // Frame the feature, but bound how far we pull back so Mars stays large in
    // view. Huge features (terrae, vast plains, Valles Marineris) would otherwise
    // fit a planet-sized sphere and shrink the globe almost out of the window.
    const radius = Cesium.Math.clamp((x.feature.diameterKm ?? 60) * 1000 * 0.9, 1.2e5, 1.2e6);
    // Steep, near-top-down pitch: a shallow angle centres the surface-point
    // bounding sphere whose upper half is empty space, which pushes the planet to
    // the bottom of the window. -75° keeps the globe filling and roughly centred
    // (and matches the straight-down home view) while keeping a slight 3D lean.
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(pos, radius), {
      duration: 1.0,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-75), 0),
    });
  }

  function select(id: number | null, opts: { fly?: boolean } = {}): void {
    const next = id != null ? byId.get(id) ?? null : null;
    if (current && current !== next) style(current, false);
    current = next;
    if (current) {
      style(current, true);
      if (opts.fly) flyToEntity(current);
    }
    viewer.scene.requestRender();
    onSelect(current ? (current as unknown as { _x: EntityExtra })._x.feature : null);
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((m: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = viewer.scene.pick(m.position);
    const f = picked && picked.id && (picked.id as unknown as { _x?: EntityExtra })._x;
    select(f ? f.feature.id : null);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  function setLabelsHidden(hidden: boolean): void {
    labelsHidden = hidden;
    for (const e of ds.entities.values) applyLabelVisibility(e);
    viewer.scene.requestRender();
  }

  function revealLabel(id: number | null): void {
    revealedId = id;
    for (const e of ds.entities.values) applyLabelVisibility(e);
    viewer.scene.requestRender();
  }

  return {
    select,
    flyTo: (id: number) => {
      const e = byId.get(id);
      if (e) flyToEntity(e);
    },
    setLabelsHidden,
    revealLabel,
  };
}
