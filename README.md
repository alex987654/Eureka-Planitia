# Eureka Planitia · Learn about Mars

An educational study atlas of every officially named surface feature on Mars — its IAU name,
descriptor class, and location — for anyone who wants to learn about named features on Mars. Built with a CesiumJS 3D globe (colorized-MOLA imagery) and an SM-2 flashcard study layer.

Web page:

* [Eureka Planitia](https://alex987654.github.io/Eureka-Planitia)

## Source & attribution

Feature names and coordinates come from the **IAU / USGS Gazetteer of Planetary
Nomenclature** (<https://planetarynames.wr.usgs.gov/>). One source, one
attribution. (Globe imagery, added in Phase 1, is credited separately to
NASA/USGS Mars Trek.)

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

