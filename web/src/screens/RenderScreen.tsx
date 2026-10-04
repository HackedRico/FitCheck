import type { ReactNode } from "react";

import { RenderPanel } from "../components/RenderPanel";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The render on its own screen, large enough for the projector: the before and
// after slider for the latest render of the candidate, whoever asked for it.

/** The latest render, full screen. */
export function RenderScreen(): ReactNode {
  const { flow, person, navigate } = useApp();
  if (flow.render.status === "idle") {
    return (
      <div className="empty">
        <p className="kicker">Render</p>
        <h1>Nothing rendered yet</h1>
        <p>Scan a garment, add your photo in Me, and the render appears here.</p>
        <button type="button" className="btn btn-solid" onClick={() => navigate("scan")}>
          Scan a garment
        </button>
      </div>
    );
  }
  return (
    <div className="render-screen">
      <RenderPanel
        step={flow.render}
        person={person.photo}
        onRetry={flow.retry}
        onOpenMe={() => navigate("me")}
        onOpenLive={() => navigate("live")}
      />
      <button type="button" className="btn btn-quiet" onClick={() => navigate("scan")}>
        Back to the verdict
      </button>
    </div>
  );
}
