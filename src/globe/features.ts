import * as Cesium from "cesium";
import type { MarsFeature } from "../data/types";
import { markerShape } from "../data/types";
import { surfacePosition } from "./mars";

const BASE_COLOR = Cesium.Color.fromCssColorString("#e9e5da").withAlpha(0.92);
const SELECT_COLOR = Cesium.Color.fromCssColorString("#d8a24e"); // highland amber
const OUTLINE = Cesium.Color.fromCssColorString("#14161b").withAlpha(0.85);
const LABEL_FILL = Cesium.Color.fromCssColorString("#f2efe6");
const LABEL_OUTLINE = Cesium.Color.fromCssColorString("#101216");

// Square glyph for very large / very tall features. Drawn once as a white canvas so
// billboard.color can tint it (white -> BASE_COLOR / amber -> SELECT_COLOR), exactly
// like the point states; the dark border stays dark under either tint. Billboard
// scale = desiredPx / SQUARE_IMG_PX renders it crisply at the wanted pixel size.
const SQUARE_IMG_PX = 64;
const SQUARE_IMAGE: HTMLCanvasElement = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = SQUARE_IMG_PX;
  const ctx = c.getContext("2d")!;
  const pad = 4; // keep the border off the canvas edge so it isn't clipped when scaled
  const x = pad;
  const w = SQUARE_IMG_PX - pad * 2;
  ctx.fillStyle = "#ffffff"; // white -> tinted by billboard.color
  ctx.fillRect(x, x, w, w);
  ctx.lineWidth = 4;
  ctx.strokeStyle = OUTLINE.toCssColorString();
  ctx.strokeRect(x, x, w, w);
  return c;
})();

interface EntityExtra {
  feature: MarsFeature;
  shape: "circle" | "square";
  basePx: number; // point pixelSize for circles; square side (px) for squares
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

/** Square side (px) — notably larger than the 4–9 px circles it replaces. */
function squarePxForDiameter(d: number | null): number {
  const dd = d && d > 0 ? d : 1000;
  return Cesium.Math.clamp(7 + Math.log10(dd) * 3.0, 13, 20);
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

  const scaleByDistance = new Cesium.NearFarScalar(1.0e5, 1.0, 3.0e7, 0.45);

  for (const f of features) {
    const far = farForDiameter(f.diameterKm);
    const shape = markerShape(f);
    const px = shape === "square" ? squarePxForDiameter(f.diameterKm) : pixelForDiameter(f.diameterKm);
    const e = ds.entities.add({
      id: String(f.id),
      position: surfacePosition(f.lon180, f.lat),
      point:
        shape === "square"
          ? undefined
          : new Cesium.PointGraphics({
              pixelSize: px,
              color: BASE_COLOR,
              outlineColor: OUTLINE,
              outlineWidth: 1,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far),
              scaleByDistance,
            }),
      billboard:
        shape === "square"
          ? new Cesium.BillboardGraphics({
              image: SQUARE_IMAGE,
              color: BASE_COLOR,
              scale: px / SQUARE_IMG_PX,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far),
              scaleByDistance,
            })
          : undefined,
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
    (e as unknown as { _x: EntityExtra })._x = { feature: f, shape, basePx: px, baseFar: far };
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
    if (!e || !e.label || (!e.point && !e.billboard)) return;
    const x = (e as unknown as { _x: EntityExtra })._x;
    const color = new Cesium.ConstantProperty(selected ? SELECT_COLOR : BASE_COLOR);
    const ddc = new Cesium.ConstantProperty(
      new Cesium.DistanceDisplayCondition(0, selected ? Number.MAX_VALUE : x.baseFar),
    );
    if (x.shape === "square" && e.billboard) {
      e.billboard.color = color;
      e.billboard.scale = new Cesium.ConstantProperty((selected ? x.basePx + 6 : x.basePx) / SQUARE_IMG_PX);
      e.billboard.distanceDisplayCondition = ddc;
    } else if (e.point) {
      e.point.color = color;
      e.point.pixelSize = new Cesium.ConstantProperty(selected ? x.basePx + 5 : x.basePx);
      e.point.distanceDisplayCondition = ddc;
    }
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
