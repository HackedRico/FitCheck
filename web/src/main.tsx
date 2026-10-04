import "@fontsource/big-shoulders-display/latin-900";
import "@fontsource/instrument-serif/latin-400-italic";
import "@fontsource/instrument-sans/latin-400";
import "@fontsource/instrument-sans/latin-600";
import "@fontsource/dm-mono/latin-500";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AppProvider } from "./state/app";

// =============================================================================
// Module Overview
// =============================================================================
// Entry point: loads the bundled fonts and styles, then mounts `App` inside
// `AppProvider`. No service worker, so a hackathon rebuild never serves stale code.

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the `#root` element.");

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
