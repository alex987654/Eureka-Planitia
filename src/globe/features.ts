import * as Cesium from "cesium";
import type { MarsFeature } from "../data/types";
import { markerShape } from "../data/types";
import type { ColloquialFeature, LandingSite } from "../data/supplementary";
import { surfacePosition } from "./mars";

const BASE_COLOR = Cesium.Color.fromCssColorString("#e9e5da").withAlpha(0.92);
const SELECT_COLOR = Cesium.Color.fromCssColorString("#d8a24e"); // highland amber
const OUTLINE = Cesium.Color.fromCssColorString("#14161b").withAlpha(0.85);
const LABEL_FILL = Cesium.Color.fromCssColorString("#f2efe6");
const LABEL_OUTLINE = Cesium.Color.fromCssColorString("#101216");

// Landing-site stars: theme blue (--basin) so they never read as feature markers;
// failed attempts keep the hollow glyph and an extra fade. Stars are historic
// study targets, so they're visible from any distance; their labels appear on
// approach. Colloquial rover-scale features are close-zoom-only dots.
const LANDING_COLOR = Cesium.Color.fromCssColorString("#5197c2").withAlpha(0.95);
const LANDING_FAIL_ALPHA = 0.75;
const LANDING_FAR = 4.0e7;
const LANDING_LABEL_FAR = 6.0e6;
const LANDING_PX = 16;
const COLLOQUIAL_FAR = 5.0e5; // a site fly-to parks the camera ~2.9e5 out, inside this
const COLLOQUIAL_PX = 4;
const COLLOQUIAL_COLOR = BASE_COLOR.withAlpha(0.8);

/** What a globe marker stands for; carried on the entity and in onSelect. */
export type Selection =
  | { kind: "feature"; f: MarsFeature }
  | { kind: "landing"; s: LandingSite }
  | { kind: "colloquial"; c: ColloquialFeature };

export function selectionId(sel: Selection): number {
  return sel.kind === "feature" ? sel.f.id : sel.kind === "landing" ? sel.s.id : sel.c.id;
}

function selectionSizeKm(sel: Selection): number | null {
  return sel.kind === "feature" ? sel.f.diameterKm : sel.kind === "colloquial" ? sel.c.sizeKm : null;
}

// Square glyph for very large / very tall features. Drawn once as a white canvas so
// billboard.color can tint it (white -> BASE_COLOR / amber -> SELECT_COLOR), exactly
// like the point states; the dark border stays dark under either tint. Billboard
// scale = desiredPx / GLYPH_IMG_PX renders it crisply at the wanted pixel size.
const GLYPH_IMG_PX = 64;
const SQUARE_IMAGE: HTMLCanvasElement = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = GLYPH_IMG_PX;
  const ctx = c.getContext("2d")!;
  const pad = 4; // keep the border off the canvas edge so it isn't clipped when scaled
  const x = pad;
  const w = GLYPH_IMG_PX - pad * 2;
  ctx.fillStyle = "#ffffff"; // white -> tinted by billboard.color
  ctx.fillRect(x, x, w, w);
  ctx.lineWidth = 4;
  ctx.strokeStyle = OUTLINE.toCssColorString();
  ctx.strokeRect(x, x, w, w);
  return c;
})();

// 4-point star for landing sites, same white-canvas-tinted-by-color scheme.
function starPath(ctx: CanvasRenderingContext2D): void {
  const cx = GLYPH_IMG_PX / 2;
  const outer = cx - 4;
  const inner = outer * 0.36;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i - Math.PI / 2;
    ctx.lineTo(cx + outer * Math.cos(a), cx + outer * Math.sin(a));
    ctx.lineTo(cx + inner * Math.cos(a + Math.PI / 4), cx + inner * Math.sin(a + Math.PI / 4));
  }
  ctx.closePath();
}

const STAR_IMAGE: HTMLCanvasElement = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = GLYPH_IMG_PX;
  const ctx = c.getContext("2d")!;
  ctx.lineJoin = "round";
  starPath(ctx);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = OUTLINE.toCssColorString();
  ctx.stroke();
  return c;
})();

// Failed attempts: hollow star — dark edging under a white (tinted) rim, plus a
// faint fill so the glyph's interior stays clickable.
const STAR_IMAGE_FAIL: HTMLCanvasElement = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = GLYPH_IMG_PX;
  const ctx = c.getContext("2d")!;
  ctx.lineJoin = "round";
  starPath(ctx);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = OUTLINE.toCssColorString();
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  return c;
})();

interface EntityExtra {
  sel: Selection;
  id: number;
  shape: "circle" | "square" | "star";
  basePx: number; // point pixelSize for circles; glyph side (px) for billboards
  baseFar: number;
  baseColor: Cesium.Color;
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
  /** Study mode: hide every name label (markers still show) so a "what is this?"
   * card can't be spoiled. Honors revealLabel(). */
  setLabelsHidden(hidden: boolean): void;
  /** Force one marker's name label visible (the flashcard flip); null hides all
   * again while labels are suppressed. */
  revealLabel(id: number | null): void;
  /** Study mode: hide the rover-scale colloquial dots entirely so they can't
   * clutter or mis-pick around a highlighted study target. */
  setColloquialHidden(hidden: boolean): void;
  /** Study mode: ignore globe clicks so a stray tap can't restyle the target. */
  setPickEnabled(on: boolean): void;
}

export interface LayerData {
  features: MarsFeature[];
  landingSites: LandingSite[];
  colloquial: ColloquialFeature[];
}

/** Colloquial markers sharing exact coordinates get spread on a small ring so
 * they stay individually clickable; card data keeps the honest coordinates. */
function displayOffsets(colloquial: ColloquialFeature[]): Map<number, [number, number]> {
  const groups = new Map<string, ColloquialFeature[]>();
  for (const c of colloquial) {
    const key = `${c.lat},${c.lon180}`;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const SPREAD_DEG = 0.02; // ~1.2 km on Mars
  const out = new Map<number, [number, number]>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.forEach((c, i) => {
      const a = (2 * Math.PI * i) / g.length;
      out.set(c.id, [SPREAD_DEG * Math.sin(a), SPREAD_DEG * Math.cos(a)]);
    });
  }
  return out;
}

export function createFeatureLayer(
  viewer: Cesium.Viewer,
  data: LayerData,
  onSelect: (sel: Selection | null) => void,
): FeatureLayer {
  const ds = new Cesium.CustomDataSource("mars-features");
  const byId = new Map<number, Cesium.Entity>();
  const colloquialEntities: Cesium.Entity[] = [];

  const scaleByDistance = new Cesium.NearFarScalar(1.0e5, 1.0, 3.0e7, 0.45);

  function labelFor(
    text: string,
    far: number,
    fade: [number, number] = [0.55, 0.78],
  ): Cesium.LabelGraphics {
    return new Cesium.LabelGraphics({
      text,
      font: "500 13px system-ui, sans-serif",
      fillColor: LABEL_FILL,
      outlineColor: LABEL_OUTLINE,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -10),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far * fade[1]),
      translucencyByDistance: new Cesium.NearFarScalar(far * fade[0], 1.0, far * fade[1], 0.0),
    });
  }

  function addEntity(
    sel: Selection,
    pos: Cesium.Cartesian3,
    shape: EntityExtra["shape"],
    px: number,
    far: number,
    baseColor: Cesium.Color,
    label: Cesium.LabelGraphics,
    image?: HTMLCanvasElement,
  ): Cesium.Entity {
    const id = selectionId(sel);
    const e = ds.entities.add({
      id: String(id),
      position: pos,
      point:
        shape === "circle"
          ? new Cesium.PointGraphics({
              pixelSize: px,
              color: baseColor,
              outlineColor: OUTLINE,
              outlineWidth: 1,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far),
              scaleByDistance,
            })
          : undefined,
      billboard:
        shape === "circle"
          ? undefined
          : new Cesium.BillboardGraphics({
              image,
              color: baseColor,
              scale: px / GLYPH_IMG_PX,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, far),
              scaleByDistance,
            }),
      label,
    });
    (e as unknown as { _x: EntityExtra })._x = { sel, id, shape, basePx: px, baseFar: far, baseColor };
    byId.set(id, e);
    return e;
  }

  for (const f of data.features) {
    const far = farForDiameter(f.diameterKm);
    const shape = markerShape(f);
    const px = shape === "square" ? squarePxForDiameter(f.diameterKm) : pixelForDiameter(f.diameterKm);
    addEntity(
      { kind: "feature", f },
      surfacePosition(f.lon180, f.lat),
      shape,
      px,
      far,
      BASE_COLOR,
      labelFor(f.name, far),
      shape === "square" ? SQUARE_IMAGE : undefined,
    );
  }

  for (const s of data.landingSites) {
    addEntity(
      { kind: "landing", s },
      surfacePosition(s.lon180, s.lat),
      "star",
      LANDING_PX,
      LANDING_FAR,
      s.success ? LANDING_COLOR : LANDING_COLOR.withAlpha(LANDING_FAIL_ALPHA),
      labelFor(s.name, LANDING_LABEL_FAR, [0.7, 1.0]),
      s.success ? STAR_IMAGE : STAR_IMAGE_FAIL,
    );
  }

  const offsets = displayOffsets(data.colloquial);
  for (const c of data.colloquial) {
    const [dLon, dLat] = offsets.get(c.id) ?? [0, 0];
    const e = addEntity(
      { kind: "colloquial", c },
      surfacePosition(c.lon180 + dLon, c.lat + dLat),
      "circle",
      COLLOQUIAL_PX,
      COLLOQUIAL_FAR,
      COLLOQUIAL_COLOR,
      labelFor(c.name, COLLOQUIAL_FAR),
    );
    colloquialEntities.push(e);
  }

  viewer.dataSources.add(ds);

  let current: Cesium.Entity | null = null;
  let labelsHidden = false;
  let revealedId: number | null = null;
  let pickEnabled = true;

  // Label visibility for study mode. `label.show` overrides distance/selection
  // styling, so a selected (highlighted) target can stay nameless until revealed.
  function applyLabelVisibility(e: Cesium.Entity): void {
    if (!e.label) return;
    const x = (e as unknown as { _x: EntityExtra })._x;
    e.label.show = new Cesium.ConstantProperty(!labelsHidden || x.id === revealedId);
  }

  function style(e: Cesium.Entity | null, selected: boolean): void {
    if (!e || !e.label || (!e.point && !e.billboard)) return;
    const x = (e as unknown as { _x: EntityExtra })._x;
    const color = new Cesium.ConstantProperty(selected ? SELECT_COLOR : x.baseColor);
    const ddc = new Cesium.ConstantProperty(
      new Cesium.DistanceDisplayCondition(0, selected ? Number.MAX_VALUE : x.baseFar),
    );
    if (e.billboard) {
      e.billboard.color = color;
      e.billboard.scale = new Cesium.ConstantProperty((selected ? x.basePx + 6 : x.basePx) / GLYPH_IMG_PX);
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
    const radius = Cesium.Math.clamp((selectionSizeKm(x.sel) ?? 60) * 1000 * 0.9, 1.2e5, 1.2e6);
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
    onSelect(current ? (current as unknown as { _x: EntityExtra })._x.sel : null);
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((m: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    if (!pickEnabled) return;
    const picked = viewer.scene.pick(m.position);
    const x = picked && picked.id && (picked.id as unknown as { _x?: EntityExtra })._x;
    select(x ? x.id : null);
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

  function setColloquialHidden(hidden: boolean): void {
    for (const e of colloquialEntities) e.show = !hidden;
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
    setColloquialHidden,
    setPickEnabled: (on: boolean) => {
      pickEnabled = on;
    },
  };
}
