// Typed model + the educational metadata (descriptor-term meanings) that make
// this useful to a curious adult rather than just a dot on a globe.

export interface MarsFeature {
  id: number;
  name: string;
  cleanName: string;
  type: string;       // e.g. "Mons, montes"
  typeCode: string;   // e.g. "MO"
  diameterKm: number | null;
  lat: number;        // planetocentric
  lon180: number;     // +East, -180..180
  lonEast360: number; // +East, 0..360
  quad: string;       // MC-xx
  continent: string;
  ethnicity: string;
  origin: string;     // etymology
  approvalYear: number | null;
  url: string;        // gazetteer deep-link
}

// IAU descriptor terms -> plain-language meaning. Keyed by the singular Latin
// term (lower-case), which is the first token of `feature_type`.
export const DESCRIPTOR_MEANING: Record<string, string> = {
  "albedo": "a region distinguished by the amount of light it reflects",
  "catena": "a chain of craters",
  "cavus": "a hollow, irregular, steep-sided depression",
  "chaos": "a distinctive area of broken, jumbled terrain",
  "chasma": "a deep, elongated, steep-sided depression",
  "collis": "a small hill or knob",
  "crater": "a roughly circular depression",
  "dorsum": "a ridge",
  "fluctus": "a flow of erupted material",
  "fossa": "a long, narrow, shallow depression",
  "labes": "a landslide deposit",
  "labyrinthus": "a complex of intersecting valleys or ridges",
  "lingula": "a tongue-shaped extension of a plateau",
  "macula": "a dark spot",
  "mensa": "a flat-topped prominence with cliff-like edges (a mesa)",
  "mons": "a mountain",
  "palus": "a small plain",
  "patera": "an irregular crater, or one with complex, scalloped edges",
  "planitia": "a low plain",
  "planum": "a plateau or high plain",
  "rupes": "a scarp",
  "scopulus": "a lobate or irregular scarp",
  "serpens": "a sinuous feature alternating positive and negative relief",
  "sulcus": "subparallel furrows and ridges",
  "terra": "an extensive land mass",
  "tholus": "a small domical mountain or hill",
  "unda": "a field of dunes",
  "vallis": "a valley",
  "vastitas": "an extensive plain",
};

/** Plain-language label for a descriptor class, e.g. "Mons, montes" -> "mons". */
export function descriptorKey(featureType: string): string {
  return (featureType.split(",")[0] || "").trim().toLowerCase();
}

// --- Globe marker shape ----------------------------------------------------
// Very large or very tall features get a square glyph (vs the default circle) so
// scale reads on the globe. The catalogue has no elevation, so mountain heights
// come from a small curated lookup of the well-known tall Mars montes.
export const SQUARE_MIN_DIAMETER_KM = 1000;
export const MONS_TALL_MIN_KM = 5;

// Curated montes height (km) = max of (summit above areoid, relief above base), so a
// single `>= 5` test implements the "tall by either measure" union. Only montes UNDER
// 1000 km diameter need listing (≥1000 km are already squares via diameter). Keyed by
// exact gazetteer `name`; one line per addition.
export const MONS_HEIGHT_KM: Record<string, number> = {
  "Olympus Mons": 22, // ~21.9 km above datum
  "Ascraeus Mons": 18,
  "Arsia Mons": 18,
  "Pavonis Mons": 14,
  "Elysium Mons": 14, // ~14 above datum / ~12.6 relief
  "Alba Mons": 7, // broad shield, summit ~6.8
  "Aeolis Mons": 5.5, // Mt Sharp — summit below datum, ~5.5 km relief (union rule)
  "Apollinaris Mons": 5, // edifice ~5 km (borderline)
};

/** Globe glyph for a feature: a square for the very large / very tall, else a circle. */
export function markerShape(f: MarsFeature): "circle" | "square" {
  if ((f.diameterKm ?? 0) >= SQUARE_MIN_DIAMETER_KM) return "square";
  if (descriptorKey(f.type) === "mons" && (MONS_HEIGHT_KM[f.name] ?? 0) >= MONS_TALL_MIN_KM)
    return "square";
  return "circle";
}

export function descriptorMeaning(featureType: string): string | null {
  return DESCRIPTOR_MEANING[descriptorKey(featureType)] ?? null;
}

/** Classic west longitude (0..360) from +East 0..360. */
export function westLon(lonEast360: number): number {
  return (360 - lonEast360) % 360;
}

/** Raw quad is lowercase "mcNN"; render it as "MC-NN". */
export function quadLabel(quad: string): string {
  const m = /^mc0*(\d+)$/i.exec(quad.trim());
  return m ? `MC-${m[1].padStart(2, "0")}` : quad.toUpperCase();
}

export function formatLat(lat: number): string {
  if (Math.abs(lat) < 0.005) return "0.00°";
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}`;
}
