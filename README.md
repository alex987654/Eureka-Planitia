# Learn about Mars · Eureka Planitia

An educational study atlas of every officially named surface feature on Mars — its IAU name,
descriptor class, and location — for anyone who wants to learn about named features on Mars. Built with a CesiumJS 3D globe (colorized-MOLA imagery) and (soon) an SM-2 flashcard study layer. 

Web page: 
* [Eureka Planitia](https://alex987654.github.io/Eureka-Planitia)

## Source & attribution

Feature names and coordinates come from the **IAU / USGS Gazetteer of Planetary
Nomenclature** (<https://planetarynames.wr.usgs.gov/>). One source, one
attribution. (Globe imagery, added in Phase 1, is credited separately to
NASA/USGS Mars Trek.)

## How the auto-refresh works

GitHub Pages is static, so auto-refresh was implemented through CI:

1. `.github/workflows/refresh-and-deploy.yml` runs **weekly** (Mondays 06:00 UTC),
   on every push to `main`, and on manual dispatch.
2. It runs `scripts/fetch_mars_features.py`, which pulls the current catalogue
   from the gazetteer and writes `public/data/{mars_features.geojson, .csv, .md,
   meta.json}`.
3. Vite builds the site and the Action deploys it. The page reads `meta.json` and
   shows **"Synced from USGS · <date>"**.

Please note: the generator **refuses to overwrite** the committed snapshot if it parses
too few rows, and the workflow falls back to that snapshot if the gazetteer is
unreachable — a USGS outage can never break a deploy. `meta.last_updated` only
advances when the data actually changes (tracked by a content hash), giving you a
git history of IAU name changes.

The committed `public/data/` currently holds an **80-feature seed** (all montes,
planitiae, and chasmata) so the site works immediately. The first successful CI
run replaces it with the full ~2,000-feature catalogue.

## Data schema (`mars_features.geojson`)

Point features in **−180…180 +East, planetocentric latitude** (Cesium-ready).
Each `properties` object carries:

| field | meaning |
|---|---|
| `feature_id` | gazetteer id (also `gazetteer_url` deep-link) |
| `name`, `clean_name` | official name |
| `feature_type`, `type_code` | descriptor class (e.g. `Mons, montes`, `MO`) |
| `diameter_km` | feature size — drives the "biggest first" reveal on the globe |
| `lon_east360` | original 0–360 +East longitude |
| `quad` | quadrangle (MC-01…MC-30) |
| `continent`, `ethnicity` | the IAU naming-theme bucket |
| `origin` | etymology / why it's named that |
| `approval_year` | year the IAU approved it |

## Project name and branding

The MIT License applies to the materials in this repository, but does not grant rights to use the project name "Eureka Planitia" or any related branding.

Please use "Eureka Planitia" ONLY for accurate, non-misleading factual references to the original project, including attribution, fork notices, compatibility statements, and links to the original repository.

Please do not use "Eureka Planitia" or confusingly similar project names for any OTHER uses without prior written permission. 

