import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base so the build works under any GitHub Pages path,
// behind a reverse-proxy, or served from a local dev server with
// different origins — the extension is loaded in an iframe whose
// URL is rewritten by Y-app (buildExtensionSrc appends ?host=…&instance=…).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
});
