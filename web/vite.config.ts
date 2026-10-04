import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// =============================================================================
// Module Overview
// =============================================================================
// Dev and preview servers for the FitCheck PWA. Both serve HTTPS with a
// self-signed certificate, because a phone only opens the camera in a secure
// context, and both proxy `/api` to the engine so the phone needs one origin.

export default defineConfig(({ mode }) => {
  // `FITCHECK_ENGINE_URL` in the shell or `web/.env` points the proxy at another engine
  const env = loadEnv(mode, ".", "FITCHECK_");
  const engineUrl = env.FITCHECK_ENGINE_URL ?? "http://localhost:8000";
  // `FITCHECK_HTTP=1` serves plain http, for a tunnel that adds its own https in front
  const plainHttp = env.FITCHECK_HTTP === "1";
  const proxy = {
    "/api": {
      target: engineUrl,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
    },
  };
  return {
    plugins: plainHttp ? [react()] : [react(), basicSsl({ name: "fitcheck-dev" })],
    server: { host: true, proxy },
    preview: { host: true, proxy },
    build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  };
});
