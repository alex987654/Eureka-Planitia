import * as Cesium from "cesium";

// The Mars MEAN-RADIUS SPHERE. We deliberately avoid the biaxial ellipsoid
// (3396190 x 3376200), which is known to break Cesium's globe rendering. Cesium
// ships Ellipsoid.MARS (a sphere with Mars's mean radii); we fall back to an
// explicit construction for older versions. Using a sphere also means feature
// points and the equirectangular MOLA tiles share one datum, so they align.
const MARS_MEAN_RADIUS_M = 3_396_190; // IAU mean Mars sphere (matches USGS/Trek products)
export const MARS: Cesium.Ellipsoid =
  (Cesium.Ellipsoid as unknown as { MARS?: Cesium.Ellipsoid }).MARS ??
  new Cesium.Ellipsoid(MARS_MEAN_RADIUS_M, MARS_MEAN_RADIUS_M, MARS_MEAN_RADIUS_M);

// NASA Mars Trek — colorized MOLA shaded relief (global 463 m), RESTful WMTS.
// Trek serves these tiles as JPEG (the .png endpoint 404s), so request image/jpeg.
const TREK_MOLA =
  "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m" +
  "/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";

export function createViewer(container: HTMLElement): Cesium.Viewer {
  // Make every Cesium default use the Mars sphere (must precede Viewer creation).
  Cesium.Ellipsoid.default = MARS;

  const viewer = new Cesium.Viewer(container, {
    globe: new Cesium.Globe(MARS),
    mapProjection: new Cesium.GeographicProjection(MARS),
    baseLayer: false, // we add Mars imagery ourselves; no Cesium ion needed
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    animation: false,
    timeline: false,
    selectionIndicator: false,
    infoBox: false, // we render our own record panel
    requestRenderMode: true, // static study scene — render on demand
    maximumRenderTimeChange: Infinity,
  });

  viewer.imageryLayers.addImageryProvider(
    new Cesium.WebMapTileServiceImageryProvider({
      url: TREK_MOLA,
      layer: "Mars_MGS_MOLA_ClrShade_merge_global_463m",
      style: "default",
      tileMatrixSetID: "default028mm",
      // Global equirectangular set: 2 tiles wide x 1 tall at level 0 (Cesium default).
      tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid: MARS }),
      maximumLevel: 7,
      format: "image/jpeg",
      credit: new Cesium.Credit("Imagery: NASA/USGS Mars Trek (MOLA colorized hillshade)"),
    }),
  );

  const scene = viewer.scene;
  // Mars, not Earth: no blue atmosphere; uniform lighting so no feature hides in
  // a dark night side; a tan base color while tiles stream in.
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#3a2a20");
  scene.backgroundColor = Cesium.Color.fromCssColorString("#0c0d11");

  // A trackball-style study globe: the camera may SPIN and ZOOM, but not tilt or
  // free-look. Tilt/look are what let a drag (especially one starting off the
  // globe's limb, on the black background) pitch the camera away from the planet
  // — that's what made Mars drift off-centre and slide out of view. With them
  // off, the camera always orbits and faces the planet's centre, so the globe
  // stays centred and can never disappear. Programmatic moves (the home view and
  // "Fly here") set the camera directly, so they're unaffected.
  const cam = scene.screenSpaceCameraController;
  cam.minimumZoomDistance = 30_000;
  cam.maximumZoomDistance = 4.0e7;
  cam.enableTilt = false;
  cam.enableLook = false;
  cam.enableTranslate = false; // a 3D globe doesn't pan; off for safety

  return viewer;
}

/** Surface position on the Mars sphere for a feature. */
export function surfacePosition(lon180: number, lat: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(lon180, lat, 0, MARS);
}
