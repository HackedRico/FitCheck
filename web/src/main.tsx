import "@fontsource/instrument-sans/latin-400";
import "@fontsource/instrument-sans/latin-600";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/flow.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AppProvider } from "./state/app";

// =============================================================================
// Module Overview
// =============================================================================
// Entry point: loads the bundled font and styles, then mounts `App` inside
// `AppProvider`. No service worker, so a rebuild never serves stale code.

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the `#root` element.");

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
