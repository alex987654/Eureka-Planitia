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

export function descriptorMeaning(featureType: string): string | null {
  return DESCRIPTOR_MEANING[descriptorKey(featureType)] ?? null;
}

/** Classic west longitude (0..360) from +East 0..360. */
export function westLon(lonEast360: number): number {
  return (360 - lonEast360) % 360;
}

export function formatLat(lat: number): string {
  if (Math.abs(lat) < 0.005) return "0.00°";
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}`;
}
