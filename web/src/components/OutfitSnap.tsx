import { useEffect, useRef, useState, type ReactNode } from "react";

import { errorMessage } from "../api/client";
import { useObjectUrl } from "../lib/objectUrl";
import { formatMs, useElapsed } from "../lib/time";
import { useApp } from "../state/app";
import { renderOutfit, type Wearable } from "../state/outfit";
import { BeforeAfter } from "./BeforeAfter";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// A frame snapped from the live preview with the outfit on, compared with the
// owner as the camera saw them. The AI render paints every garment in turn,
// which takes one render's wait per garment, so it runs only when asked.

export interface Snapshot {
  person: Blob;
  image: Blob;
  worn: readonly Wearable[];
}

type RenderState =
  | { status: "idle" }
  | { status: "running"; startedAt: number }
  | { status: "done"; image: Blob }
  | { status: "stand-in" }
  | { status: "failed"; error: string };

interface OutfitSnapProps {
  snapshot: Snapshot;
  onClose: () => void;
}

/** The snapped outfit, with an AI render on request. */
export function OutfitSnap({ snapshot, onClose }: OutfitSnapProps): ReactNode {
  const { pipelines } = useApp();
  const [render, setRender] = useState<RenderState>({ status: "idle" });
  const elapsed = useElapsed(render.status === "running" ? render.startedAt : null);
  const shown = render.status === "done" ? render.image : snapshot.image;
  const personUrl = useObjectUrl(snapshot.person);
  const imageUrl = useObjectUrl(shown);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const makeRender = async (): Promise<void> => {
    setRender({ status: "running", startedAt: performance.now() });
    try {
      const image = await renderOutfit(snapshot.person, snapshot.worn, pipelines.record);
      if (alive.current) setRender(image ? { status: "done", image } : { status: "stand-in" });
    } catch (cause) {
      if (alive.current) setRender({ status: "failed", error: errorMessage(cause) });
    }
  };

  const pieces = snapshot.worn.length;
  return (
    <section className="fc-snap" role="dialog" aria-label="Your outfit">
      <header className="fc-snap-head">
        <button type="button" className="fc-round fc-back" onClick={onClose} aria-label="Back to the live preview">
          <Icon name="arrow" />
        </button>
        <h2>{pieces === 1 ? snapshot.worn[0]?.label : `${pieces} pieces on you`}</h2>
      </header>

      {personUrl && imageUrl && <BeforeAfter before={personUrl} after={imageUrl} beforeLabel="You" afterLabel="With it on" />}

      <div className="fc-snap-foot">
        {render.status === "idle" && (
          <>
            <p className="fc-muted">Snapped from the live preview, on this phone. The AI render adds drape and fit.</p>
            <button type="button" className="fc-btn is-primary" onClick={() => void makeRender()}>
              Make an AI render
            </button>
          </>
        )}
        {render.status === "running" && (
          <p className="fc-snap-wait">
            <span className="spinner" /> Dressing you{pieces > 1 ? `, one piece at a time` : ""}{" "}
            <span className="fc-mono">{formatMs(elapsed)}</span>
          </p>
        )}
        {render.status === "done" && <p className="fc-muted">AI render of the whole outfit.</p>}
        {render.status === "stand-in" && (
          <>
            <p className="fc-muted">No AI render is available right now, so this stays the on-device try-on.</p>
            <button type="button" className="fc-btn is-ghost" onClick={() => void makeRender()}>
              Try the AI render again
            </button>
          </>
        )}
        {render.status === "failed" && (
          <p className="fc-error">
            {render.error}
            <button type="button" onClick={() => void makeRender()}>
              Try again
            </button>
          </p>
        )}
        <button type="button" className="fc-btn is-ghost" onClick={onClose}>
          <Icon name="live" /> Keep trying things on
        </button>
      </div>
    </section>
  );
}
