export interface Meta {
  source: string;
  source_url: string;
  target: string;
  coordinate_system: string;
  last_checked: string; // ISO 8601 UTC
  last_updated: string; // ISO 8601 UTC
  feature_count: number;
  content_hash: string;
  generator_version: string;
  note?: string;
  is_seed?: boolean;
}

/** Resolve a path inside the deployed base (handles GitHub Project Pages subpaths). */
export function asset(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

export async function loadMeta(): Promise<Meta> {
  const res = await fetch(asset("data/meta.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error(`meta.json ${res.status}`);
  return (await res.json()) as Meta;
}

/** "2026-06-15T00:16Z" -> "15 June 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
