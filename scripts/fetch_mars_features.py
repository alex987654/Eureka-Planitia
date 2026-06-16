#!/usr/bin/env python3
"""
fetch_mars_features.py  (v2)

Build the catalogue of IAU-approved Mars surface features from the USGS Gazetteer
of Planetary Nomenclature, with the rich attributes a serious learner wants:
etymology (origin), quadrangle, approval year, descriptor class, diameter, and a
deep-link to each feature's gazetteer page.

Source (single source -> single attribution):
    IAU / USGS Gazetteer of Planetary Nomenclature
    https://planetarynames.wr.usgs.gov/

Strategy:
  - Primary: one request to the "all Mars features" search results page, parsed
    from the HTML results table (stdlib only -- no pandas/lxml needed).
  - Fallback: if that returns too little (e.g. the page ever paginates), iterate
    the known descriptor classes and concatenate.
  - The script REFUSES to overwrite existing output if it parses too few rows, so
    a transient gazetteer problem can never clobber a good committed snapshot. It
    exits non-zero in that case; the CI workflow then keeps the committed data.

Coordinates: the gazetteer publishes planetocentric latitude, +East longitude on
a 0-360 grid. We keep that (lon_east360) and also emit -180..180 (lon180), which
is what CesiumJS expects.

Outputs (default into ./public/data so Vite serves them):
    mars_features.geojson   mars_features.csv   mars_features.md   meta.json

Usage:
    python3 scripts/fetch_mars_features.py                 # -> public/data
    python3 scripts/fetch_mars_features.py --out some/dir
"""
import argparse, csv, datetime, hashlib, json, os, re, sys, urllib.parse, urllib.request
from html.parser import HTMLParser

BASE = "https://planetarynames.wr.usgs.gov"
ALL_URL = BASE + "/SearchResults?Target=20_Mars"
SOURCE = "IAU/USGS Gazetteer of Planetary Nomenclature"
SOURCE_URL = BASE + "/"
GEN_VERSION = "2.0"
MIN_OK = 200  # refuse to write fewer than this (sanity guard)

# Descriptor classes for the fallback path (code_name as the gazetteer expects).
FEATURE_TYPES = [
    "1_Albedo Feature", "3_Catena, catenae", "4_Cavus, cavi", "5_Chaos, chaoses",
    "6_Chasma, chasmata", "7_Collis, colles", "9_Crater, craters", "10_Dorsum, dorsa",
    "15_Fluctus, fluctūs", "16_Fossa, fossae", "17_Labes, labēs",
    "18_Labyrinthus, labyrinthi", "48_Lingula, lingulae", "24_Macula, maculae",
    "26_Mensa, mensae", "27_Mons, montes", "29_Palus, paludes", "30_Patera, paterae",
    "31_Planitia, planitiae", "32_Planum, plana", "38_Rupes, rupēs",
    "39_Scopulus, scopuli", "55_Serpens, serpentes", "41_Sulcus, sulci",
    "42_Terra, terrae", "44_Tholus, tholi", "45_Unda, undae", "46_Vallis, valles",
    "47_Vastitas, vastitates",
]

HEADER_MAP = {
    "feature id": "feature_id", "feature name": "name",
    "clean feature name": "clean_name", "diameter": "diameter",
    "center latitude": "lat", "center longitude": "lon360",
    "coordinate system": "coordinate_system", "continent": "continent",
    "ethnicity": "ethnicity", "feature type": "feature_type",
    "feature type code": "type_code", "quad": "quad",
    "approval status": "approval_status", "approval date": "approval_date",
    "reference": "reference", "origin": "origin",
    "additional info": "additional_info", "last updated": "last_updated",
    "target": "target",
}


class TableParser(HTMLParser):
    """Collect every <table> as a list of rows; each row a list of cell texts."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self._tbl, self._row, self._cell, self._in = [], None, None, None, False

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._tbl = []
        elif tag == "tr" and self._tbl is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell, self._in = [], True

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._in:
            self._row.append(re.sub(r"\s+", " ", "".join(self._cell)).strip())
            self._cell, self._in = None, False
        elif tag == "tr" and self._row is not None:
            self._tbl.append(self._row)
            self._row = None
        elif tag == "table" and self._tbl is not None:
            self.tables.append(self._tbl)
            self._tbl = None

    def handle_data(self, data):
        if self._in:
            self._cell.append(data)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "mars-features/2.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode("utf-8", "replace")


def results_table(html_text: str):
    # The page contains a small legend table whose header also says "Feature
    # Name", so pick the LARGEST matching table (the real results grid), not the
    # first one we encounter.
    p = TableParser()
    p.feed(html_text)
    best = None
    for t in p.tables:
        if t and any("feature name" in (c or "").lower() for c in t[0]):
            if best is None or len(t) > len(best):
                best = t
    return best


def _num(s):
    s = (s or "").strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _year(s):
    m = re.search(r"(\d{4})", s or "")
    return int(m.group(1)) if m else None


def _lon180(x: float) -> float:
    return round(x - 360.0, 4) if x > 180.0 else round(x, 4)


def rows_to_records(table) -> list[dict]:
    if not table or len(table) < 2:
        return []
    keys = [HEADER_MAP.get(re.sub(r"\s+", " ", h.strip().lower())) for h in table[0]]
    out = []
    for row in table[1:]:
        if len(row) < len(keys):
            continue
        d = {k: v for k, v in zip(keys, row) if k}
        if d.get("approval_status", "").strip().lower() != "approved":
            continue
        lat, lon = _num(d.get("lat")), _num(d.get("lon360"))
        if lat is None or lon is None:
            continue
        try:
            fid = int(re.sub(r"\D", "", d.get("feature_id", "")) or 0) or None
        except ValueError:
            fid = None
        out.append({
            "feature_id": fid,
            "name": d.get("name", "").strip(),
            "clean_name": d.get("clean_name", "").strip(),
            "feature_type": d.get("feature_type", "").strip(),
            "type_code": d.get("type_code", "").strip(),
            "diameter_km": _num(d.get("diameter")),
            "lat": round(lat, 4),
            "lon_east360": round(lon, 4),
            "lon180": _lon180(lon),
            "quad": d.get("quad", "").strip(),
            "continent": d.get("continent", "").strip(),
            "ethnicity": d.get("ethnicity", "").strip(),
            "origin": d.get("origin", "").strip(),
            "approval_year": _year(d.get("approval_date")),
            "approval_status": "Approved",
            "gazetteer_url": f"{BASE}/Feature/{fid}" if fid else "",
            "source": SOURCE,
        })
    return out


def gather() -> list[dict]:
    recs = rows_to_records(results_table(fetch(ALL_URL)))
    if len(recs) >= 500:
        return recs
    print(f"all-features returned {len(recs)} rows; falling back to per-class.",
          file=sys.stderr)
    seen, out = set(), []
    for ft in FEATURE_TYPES:
        url = f"{BASE}/SearchResults?Target=20_Mars&Feature%20Type={urllib.parse.quote(ft)}"
        try:
            for r in rows_to_records(results_table(fetch(url))):
                k = (r["feature_id"], r["name"])
                if k not in seen:
                    seen.add(k)
                    out.append(r)
        except Exception as e:  # noqa: BLE001
            print(f"  warn {ft}: {e}", file=sys.stderr)
    return out


def _load_prev_meta(out_dir):
    try:
        with open(os.path.join(out_dir, "meta.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return None


def write(records: list[dict], out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    records.sort(key=lambda r: (r["feature_type"], r["name"]))

    geo = {"type": "FeatureCollection",
           "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:IAU:2015:49900"}},
           "features": []}
    for r in records:
        props = {k: v for k, v in r.items() if k not in ("lat", "lon180")}
        geo["features"].append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lon180"], r["lat"]]},
            "properties": props,
        })
    with open(os.path.join(out_dir, "mars_features.geojson"), "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False)

    fields = ["feature_id", "name", "clean_name", "feature_type", "type_code",
              "diameter_km", "lat", "lon_east360", "lon180", "quad", "continent",
              "ethnicity", "approval_year", "origin", "gazetteer_url", "source"]
    with open(os.path.join(out_dir, "mars_features.csv"), "w", newline="",
              encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in records:
            w.writerow({k: r.get(k, "") for k in fields})

    by_type: dict[str, list] = {}
    for r in records:
        by_type.setdefault(r["feature_type"] or "Unknown", []).append(r)
    md = ["# Named Mars Surface Features\n",
          f"Source: {SOURCE} ({SOURCE_URL}). Planetocentric latitude, +East longitude.\n",
          f"**{len(records)} approved features** across {len(by_type)} descriptor classes.\n"]
    for ftype in sorted(by_type):
        rs = by_type[ftype]
        md.append(f"\n## {ftype}  ({len(rs)})\n")
        md.append("| Feature | Lat (°) | Lon (−180…180) | Diameter (km) | Year |")
        md.append("|---|---:|---:|---:|---:|")
        for r in rs:
            md.append(f"| {r['name']} | {r['lat']:.2f} | {r['lon180']:.2f} | "
                      f"{(r['diameter_km'] if r['diameter_km'] is not None else '')} | "
                      f"{r['approval_year'] or ''} |")
    with open(os.path.join(out_dir, "mars_features.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")

    content_hash = hashlib.sha256(
        json.dumps([(r["feature_id"], r["lat"], r["lon180"]) for r in records],
                   sort_keys=True).encode()).hexdigest()[:16]
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    prev = _load_prev_meta(out_dir)
    last_updated = prev["last_updated"] if (prev and prev.get("content_hash") == content_hash) else now
    meta = {"source": SOURCE, "source_url": SOURCE_URL, "target": "Mars",
            "coordinate_system": "Planetocentric, +East",
            "last_checked": now, "last_updated": last_updated,
            "feature_count": len(records), "content_hash": content_hash,
            "generator_version": GEN_VERSION}
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {len(records)} features to {out_dir}/")
    for ftype in sorted(by_type):
        print(f"  {len(by_type[ftype]):>4}  {ftype}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/data", help="output directory")
    args = ap.parse_args()
    try:
        records = gather()
    except Exception as e:  # noqa: BLE001
        sys.exit(f"ERROR fetching gazetteer: {e}")
    if len(records) < MIN_OK:
        sys.exit(f"Only parsed {len(records)} features (< {MIN_OK}); "
                 "refusing to overwrite the committed snapshot.")
    write(records, args.out)


if __name__ == "__main__":
    main()
