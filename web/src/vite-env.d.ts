/// <reference types="vite/client" />

// =============================================================================
// Module Overview
// =============================================================================
// Build-time env vars the app reads through `import.meta.env`. `VITE_API_BASE`
// overrides the `/api` prefix when the engine is served from another origin;
// `VITE_POSE_MODEL_URL` points the live preview at a local copy of the pose model.

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_POSE_MODEL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
