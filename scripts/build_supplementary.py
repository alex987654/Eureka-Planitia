#!/usr/bin/env python3
"""
build_supplementary.py

Build the machine-readable supplementary catalogue (probe landing sites +
colloquial/informal feature names) from the hand-authored sources in
public/data/supplementary/:

    mars_landing_sites.csv        -> landing_sites[]
    mars_features_colloquial.md   -> aliases[] (rows marked "(official name)")
                                     + colloquial[] (rover-scale informal features)

Aliases are resolved against public/data/mars_features.geojson by exact feature
name so the app can attach them to the official record; an unresolvable alias is
warned about and dropped (never fails the build). Landing attempts without
coordinates (Mars 7 missed the planet) are omitted entirely. Each colloquial
feature is assigned its nearest landing site within 1.5 deg great-circle as
"host", which powers the "named features near this site" links.

IDs are namespaced far above the gazetteer's feature ids (max ~16k):
    landing sites  9_000_000 + landing_id   (stable -- persisted by study mode)
    colloquial     9_100_000 + alpha index  (BUILD-LOCAL -- must never be persisted)

Like fetch_mars_features.py, the script refuses to write if it parses
implausibly few rows, so a bad edit can't clobber a good committed snapshot.

Usage:
    python3 scripts/build_supplementary.py            # -> public/data/supplementary/supplementary.json
    python3 scripts/build_supplementary.py --check    # verify committed output is current (CI)
"""
import argparse, csv, datetime, json, math, os, re, sys

VERSION = 1
LANDING_ID_BASE = 9_000_000
COLLOQUIAL_ID_BASE = 9_100_000
HOST_MAX_DEG = 1.5
MIN_SITES, MIN_ALIASES, MIN_COLLOQUIAL = 15, 3, 60
ALIAS_MARKER = "(official name)"

# Concise globe/study label per landing_id (fallback: the mission column).
SHORT_NAME = {
    1: "Mars 2", 2: "Mars 3", 3: "Mars 6", 5: "Viking 1", 6: "Viking 2",
    7: "Pathfinder", 8: "Mars Polar Lander", 9: "Deep Space 2", 10: "Spirit",
    11: "Opportunity", 12: "Phoenix", 13: "Curiosity", 14: "InSight",
    15: "Perseverance", 16: "Beagle 2", 17: "Schiaparelli", 18: "Zhurong",
}


def _num(s):
    s = (s or "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _int(s):
    s = (s or "").strip()
    try:
        return int(s)
    except ValueError:
        return None


def central_angle_deg(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return math.degrees(2 * math.asin(min(1.0, math.sqrt(a))))


def read_landing_sites(path):
    sites = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            landing_id = _int(row.get("landing_id"))
            lat, lon180 = _num(row.get("lat")), _num(row.get("lon180"))
            if landing_id is None:
                continue
            if lat is None or lon180 is None:
                continue  # missed the planet (Mars 7) -- omit entirely
            outcome = (row.get("outcome") or "").strip()
            sites.append({
                "id": LANDING_ID_BASE + landing_id,
                "landing_id": landing_id,
                "name": SHORT_NAME.get(landing_id, (row.get("mission") or "").strip()),
                "mission": (row.get("mission") or "").strip(),
                "craft": (row.get("lander_or_rover") or "").strip(),
                "agency": (row.get("agency") or "").strip(),
                "country": (row.get("country") or "").strip(),
                "launch_date": (row.get("launch_date") or "").strip(),
                "landing_date": (row.get("landing_date") or "").strip(),
                "region": (row.get("region") or "").strip(),
                "memorial_name": (row.get("memorial_site_name") or "").strip(),
                "lat": lat,
                "lon180": lon180,
                "lon_east360": _num(row.get("lon_east360")),
                "success": outcome == "Success",
                "outcome": outcome,
                "notes": (row.get("notes") or "").strip(),
                "source": (row.get("source") or "").strip(),
            })
    sites.sort(key=lambda s: s["landing_id"])
    return sites


def class_short(class_name):
    """'Hill, butte, mesa' -> 'hill'; 'Crater (informal)' -> 'crater'."""
    s = class_name.replace("(informal)", "").strip()
    return s.split(",")[0].strip().lower()


def read_colloquial(path):
    """Parse the markdown tables -> (alias rows, colloquial rows), raw dicts."""
    aliases, colloquial = [], []
    section = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            m = re.match(r"^##\s+(.+?)\s+\((\d+)\)\s*$", line)
            if m:
                section = m.group(1).strip()
                continue
            if not line.startswith("|") or section is None:
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 7 or cells[0] == "Feature" or set(cells[0]) <= {"-", ":"}:
                continue
            name, region, lat_s, lon_s, size_s, year_s, desc = cells[:7]
            lat, lon180 = _num(lat_s), _num(lon_s)
            if lat is None or lon180 is None:
                print(f"::warning::colloquial row without coordinates skipped: {name}")
                continue
            row = {
                "name": name, "region": region, "lat": lat, "lon180": lon180,
                "size_km": _num(size_s), "year": _int(year_s),
                "description": desc, "class_name": section,
            }
            if ALIAS_MARKER in region:
                aliases.append(row)
            else:
                colloquial.append(row)
    return aliases, colloquial


def load_official_ids(geojson_path):
    with open(geojson_path, encoding="utf-8") as f:
        fc = json.load(f)
    return {
        ft["properties"]["name"]: ft["properties"]["feature_id"]
        for ft in fc.get("features", [])
    }


def build(root):
    supp_dir = os.path.join(root, "public", "data", "supplementary")
    sites = read_landing_sites(os.path.join(supp_dir, "mars_landing_sites.csv"))
    alias_rows, colloquial_rows = read_colloquial(
        os.path.join(supp_dir, "mars_features_colloquial.md"))
    official = load_official_ids(os.path.join(root, "public", "data", "mars_features.geojson"))

    aliases = []
    for r in alias_rows:
        target = r["region"].split(ALIAS_MARKER)[0].strip()
        fid = official.get(target)
        if fid is None:
            print(f"::warning::alias '{r['name']}' -> '{target}' not in gazetteer; dropped.")
            continue
        aliases.append({
            "alias": r["name"], "official_id": fid, "official_name": target,
            "year": r["year"], "description": r["description"],
        })
    aliases.sort(key=lambda a: a["alias"])

    colloquial = []
    for i, r in enumerate(sorted(colloquial_rows, key=lambda r: r["name"])):
        host = None
        best = HOST_MAX_DEG
        for s in sites:
            d = central_angle_deg(r["lat"], r["lon180"], s["lat"], s["lon180"])
            if d <= best:
                host, best = s["id"], d
        size = r["size_km"] if r["size_km"] else None  # 0.0 / blank -> null
        colloquial.append({
            "id": COLLOQUIAL_ID_BASE + i,
            "name": r["name"],
            "class_name": r["class_name"],
            "class_short": class_short(r["class_name"]),
            "region": r["region"],
            "lat": r["lat"],
            "lon180": r["lon180"],
            "lon_east360": round((r["lon180"] + 360.0) % 360.0, 4),
            "size_km": size,
            "year": r["year"],
            "description": r["description"],
            "host_landing_id": host,
        })

    return {
        "version": VERSION,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"aliases": len(aliases), "colloquial": len(colloquial),
                   "landing_sites": len(sites)},
        "aliases": aliases,
        "colloquial": colloquial,
        "landing_sites": sites,
    }


def _payload(doc):
    return {k: v for k, v in (doc or {}).items() if k != "generated"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="repository root")
    ap.add_argument("--check", action="store_true",
                    help="verify the committed supplementary.json is current")
    args = ap.parse_args()

    doc = build(args.root)
    c = doc["counts"]
    if (c["landing_sites"] < MIN_SITES or c["aliases"] < MIN_ALIASES
            or c["colloquial"] < MIN_COLLOQUIAL):
        sys.exit(f"Parsed too little (sites={c['landing_sites']}, aliases={c['aliases']}, "
                 f"colloquial={c['colloquial']}); refusing to overwrite the committed snapshot.")

    out_path = os.path.join(args.root, "public", "data", "supplementary", "supplementary.json")
    prev = None
    try:
        with open(out_path, encoding="utf-8") as f:
            prev = json.load(f)
    except Exception:  # noqa: BLE001
        pass

    if args.check:
        if prev is None or _payload(prev) != _payload(doc):
            sys.exit("supplementary.json is out of date; run "
                     "`python3 scripts/build_supplementary.py` and commit the result.")
        print("supplementary.json is up to date.")
        return

    if prev is not None and _payload(prev) == _payload(doc):
        doc["generated"] = prev["generated"]  # unchanged content -> byte-stable file
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {out_path}: {c['landing_sites']} landing sites, "
          f"{c['aliases']} aliases, {c['colloquial']} colloquial features.")


if __name__ == "__main__":
    main()
