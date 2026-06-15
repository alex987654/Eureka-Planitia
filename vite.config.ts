import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

// On GitHub Project Pages the site is served from /<repo>/, so the workflow sets
// VITE_BASE="/<repo>/". Locally it defaults to "/".
// vite-plugin-cesium copies Cesium's static assets and sets CESIUM_BASE_URL.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [cesium()],
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
