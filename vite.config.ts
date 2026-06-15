import { defineConfig } from "vite";

// On GitHub Project Pages the site is served from /<repo>/, so the workflow sets
// VITE_BASE="/<repo>/". Locally it defaults to "/".
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
