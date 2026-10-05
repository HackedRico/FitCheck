import { useState, type ReactNode } from "react";

import { errorMessage } from "../api/client";
import { AddGarmentSheet } from "../components/AddGarmentSheet";
import { Icon } from "../components/Icons";
import { captureFrame, useCamera } from "../lib/camera";
import { decisionWording } from "../lib/garments";
import { useObjectUrl } from "../lib/objectUrl";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The camera, full screen, and the only thing on it is the shutter. A snap, a
// picked photo or a pasted shop link starts the flow and moves straight to the
// result. The corners hold the live preview, the closet, the owner's photo and
// the last verdict.

/** Point at a garment and snap, or bring one in by link or photo. */
export function HomeScreen(): ReactNode {
  const { flow, person, navigate } = useApp();
  const camera = useCamera("environment", true);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const photoUrl = useObjectUrl(person.photo);
  const lastFrameUrl = useObjectUrl(flow.frame);

  const begin = (frame: Blob): void => {
    flow.start(frame);
    navigate("result");
  };

  const snap = async (): Promise<void> => {
    const video = camera.videoRef.current;
    if (!video) return;
    try {
      const frame = await captureFrame(video);
      setFlash((n) => n + 1);
      begin(frame);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const live = camera.status === "live";
  const lastDecision = flow.judge.status === "done" ? flow.judge.value.verdict.decision : null;
  const hint = live
    ? "Fit the garment inside the frame"
    : camera.status === "starting"
      ? "Starting the camera"
      : "No camera here. Tap + to paste a shop link or pick a photo.";

  return (
    <section className="fc-cam is-dark">
      <video ref={camera.videoRef} className="fc-cam-feed" playsInline muted autoPlay />
      {!live && <div className="fc-cam-empty" aria-hidden="true" />}
      <div className="fc-cam-shade" aria-hidden="true" />
      <span className="fc-frame" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {flash > 0 && <span key={flash} className="fc-flash" aria-hidden="true" />}

      <header className="fc-topbar">
        <p className="fc-wordmark">
          Fit<span>Check</span>
        </p>
        <div className="fc-topbar-actions">
          <button type="button" className="fc-round" onClick={() => navigate("live")} aria-label="Try clothes on live">
            <Icon name="live" />
          </button>
          <button type="button" className="fc-round" onClick={() => navigate("closet")} aria-label="Closet">
            <Icon name="hanger" />
          </button>
          <button
            type="button"
            className="fc-round fc-avatar"
            data-empty={photoUrl === null}
            onClick={() => navigate("you")}
            aria-label="Your photo"
          >
            {photoUrl ? <img src={photoUrl} alt="" /> : <Icon name="person" />}
          </button>
        </div>
      </header>

      <p className="fc-cam-hint">{error ?? hint}</p>

      <footer className="fc-shutterbar">
        {lastFrameUrl ? (
          <button
            type="button"
            className="fc-last"
            data-decision={lastDecision ?? undefined}
            onClick={() => navigate("result")}
            aria-label="Back to the last verdict"
          >
            <img src={lastFrameUrl} alt="" />
            {lastDecision && <span>{decisionWording(lastDecision).word}</span>}
          </button>
        ) : (
          <span className="fc-round is-ghost" aria-hidden="true" />
        )}
        <button type="button" className="fc-shutter" onClick={() => void snap()} disabled={!live} aria-label="Snap the garment">
          <span />
        </button>
        <button type="button" className="fc-round" onClick={() => setAdding(true)} aria-label="Paste a shop link or pick a photo">
          <Icon name="plus" />
        </button>
      </footer>

      <AddGarmentSheet
        open={adding}
        camera={false}
        onClose={() => setAdding(false)}
        onGarment={(image) => {
          setAdding(false);
          begin(image);
        }}
      />
    </section>
  );
}
