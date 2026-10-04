import type { ReactNode } from "react";

import type { FlowState, Step } from "../state/candidate";
import { formatMs, useElapsed } from "../lib/time";

// =============================================================================
// Module Overview
// =============================================================================
// The three-stage rail above the verdict: tags, verdict, render. Each stage shows
// waiting, a live clock while it runs, its time when done, or why it stopped, so
// the screen always says what is happening during model latency.

interface StageProps {
  index: number;
  label: string;
  step: Step<unknown>;
}

function Stage({ index, label, step }: StageProps): ReactNode {
  const elapsed = useElapsed(step.status === "running" ? step.startedAt : null);
  const status = (() => {
    switch (step.status) {
      case "idle":
        return "waiting";
      case "running":
        return formatMs(elapsed);
      case "done":
        return formatMs(step.ms);
      case "failed":
        return "failed";
      case "skipped":
        return "skipped";
    }
  })();

  return (
    <li className="rail-stage" data-status={step.status}>
      <span className="rail-num">{String(index).padStart(2, "0")}</span>
      <span className="rail-label">{label}</span>
      <span className="rail-time" aria-live="polite">
        {step.status === "running" && <span className="spinner" aria-hidden="true" />}
        {status}
      </span>
      <span className="rail-bar" aria-hidden="true" />
    </li>
  );
}

/** Progress for the scan, verdict and render of the current candidate. */
export function ProgressRail({ flow }: { flow: FlowState }): ReactNode {
  return (
    <ol className="rail" aria-label="Progress">
      <Stage index={1} label="Tags" step={flow.scan} />
      <Stage index={2} label="Verdict" step={flow.judge} />
      <Stage index={3} label="Render" step={flow.render} />
    </ol>
  );
}
