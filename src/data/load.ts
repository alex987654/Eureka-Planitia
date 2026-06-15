import { asset } from "../lib/meta";
import type { MarsFeature } from "./types";

interface RawProps {
  feature_id: number;
  name: string;
  clean_name?: string;
  feature_type: string;
  type_code?: string;
  diameter_km?: number | null;
  lon_east360: number;
  quad?: string;
  continent?: string;
  ethnicity?: string;
  origin?: string;
  approval_year?: number | null;
  gazetteer_url?: string;
}

export async function loadFeatures(): Promise<MarsFeature[]> {
  const res = await fetch(asset("data/mars_features.geojson"), { cache: "no-cache" });
  if (!res.ok) throw new Error(`mars_features.geojson ${res.status}`);
  const fc = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: RawProps }[];
  };
  return fc.features.map((f) => {
    const p = f.properties;
    const [lon180, lat] = f.geometry.coordinates;
    return {
      id: p.feature_id,
      name: p.name,
      cleanName: p.clean_name ?? p.name,
      type: p.feature_type,
      typeCode: p.type_code ?? "",
      diameterKm: p.diameter_km ?? null,
      lat,
      lon180,
      lonEast360: p.lon_east360,
      quad: p.quad ?? "",
      continent: p.continent ?? "",
      ethnicity: p.ethnicity ?? "",
      origin: p.origin ?? "",
      approvalYear: p.approval_year ?? null,
      url: p.gazetteer_url ?? `https://planetarynames.wr.usgs.gov/Feature/${p.feature_id}`,
    } satisfies MarsFeature;
  });
}
