import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
import { cpSync } from "node:fs";
import path from "node:path";

// On GitHub Project Pages the site is served from /<repo>/, so the workflow sets
// VITE_BASE="/<repo>/". Locally it defaults to "/".
const base = process.env.VITE_BASE ?? "/";
const outDir = "dist";

// vite-plugin-cesium externalizes the `cesium` import to window.Cesium and injects
// <script src="<base>cesium/Cesium.js"> + the widgets stylesheet. Its built-in asset
// copy, however, is broken for a non-root base: it writes the Build/Cesium tree to
// dist/<base>/cesium/... (the base is baked in twice) while the HTML requests it at
// <base>/cesium/..., so on GitHub Pages every Cesium asset 404s and the globe never
// boots. We copy the tree to the correct dist/cesium/ ourselves so the runtime,
// Workers, Assets and Widgets land exactly where the injected tags expect them.
const copyCesiumAssets = {
  name: "copy-cesium-assets",
  apply: "build",
  closeBundle() {
    cpSync("node_modules/cesium/Build/Cesium", path.join(outDir, "cesium"), {
      recursive: true,
    });
  },
};

export default defineConfig({
  base,
  plugins: [cesium(), copyCesiumAssets],
  build: {
    target: "es2020",
    outDir,
  },
});
