import type { ReactNode } from "react";

import type { Rendering, Step } from "../state/candidate";
import { useObjectUrl } from "../lib/objectUrl";
import { formatMs, useElapsed } from "../lib/time";
import { BeforeAfter } from "./BeforeAfter";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// The render stage of a candidate: a painting state with a live clock while the
// diffusion model works, then the before and after slider, labelled "cached"
// when the engine served a pre-computed render. Skips and failures say why.

interface RenderPanelProps {
  step: Step<Rendering>;
  person: Blob | null;
  onRetry: () => void;
  onOpenMe: () => void;
  onOpenLive: () => void;
  onExpand?: () => void;
}

const ORIGIN_LABEL: Record<Rendering["origin"], string> = {
  photo: "from your saved photo",
  live: "from the live preview snap",
  stylist: "asked for by the stylist",
};

/** Everything the render stage can show, from waiting to the finished slider. */
export function RenderPanel({ step, person, onRetry, onOpenMe, onOpenLive, onExpand }: RenderPanelProps): ReactNode {
  const personUrl = useObjectUrl(step.status === "done" ? step.value.person : person);
  const renderUrl = useObjectUrl(step.status === "done" ? step.value.image : null);
  const elapsed = useElapsed(step.status === "running" ? step.startedAt : null);

  switch (step.status) {
    case "idle":
      return null;
    case "running":
      return (
        <section className="render is-running" aria-live="polite">
          <div className="render-canvas">
            {personUrl && <img src={personUrl} alt="" className="render-ghost" />}
            <span className="render-stitch" aria-hidden="true" />
            <div className="render-status">
              <p className="kicker">Painting the render</p>
              <p className="render-clock display">{formatMs(elapsed)}</p>
            </div>
          </div>
          <p className="render-note">
            A diffusion model is painting the candidate onto your photo. The live preview is instant meanwhile.
          </p>
          <button type="button" className="btn btn-quiet" onClick={onOpenLive}>
            <Icon name="live" /> Live preview
          </button>
        </section>
      );
    case "done":
      return (
        <section className="render is-done">
          <header className="render-head">
            <h3 className="kicker">Render {ORIGIN_LABEL[step.value.origin]}</h3>
            <span className="render-tags">
              {step.value.cached && <span className="pill pill-warn">cached</span>}
              <span className="pill">{formatMs(step.ms)}</span>
              {onExpand && (
                <button type="button" className="icon-btn" onClick={onExpand} aria-label="Open the render full screen">
                  <Icon name="expand" />
                </button>
              )}
            </span>
          </header>
          {personUrl && renderUrl && <BeforeAfter before={personUrl} after={renderUrl} />}
        </section>
      );
    case "failed":
      return (
        <section className="render">
          <p className="error-line">
            The render did not finish. {step.error}
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          </p>
        </section>
      );
    case "skipped":
      return (
        <section className="render is-skipped">
          <p className="render-note">{step.reason}</p>
          {person === null ? (
            <button type="button" className="btn btn-quiet" onClick={onOpenMe}>
              <Icon name="person" /> Add your photo
            </button>
          ) : null}
          <button type="button" className="btn btn-quiet" onClick={onOpenLive}>
            <Icon name="live" /> Live preview
          </button>
        </section>
      );
  }
}
