import { useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { ClosetMatches } from "../components/ClosetMatches";
import { Icon } from "../components/Icons";
import { ProgressRail } from "../components/ProgressRail";
import { RenderPanel } from "../components/RenderPanel";
import { TagChips } from "../components/TagChips";
import { VerdictCard, VerdictPending } from "../components/VerdictCard";
import { WeekStrip } from "../components/WeekStrip";
import { captureFrame, shrinkImage, useCamera } from "../lib/camera";
import { useObjectUrl } from "../lib/objectUrl";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The scan screen: the rear camera full screen with a snap button and a photo
// fallback. A snap freezes the frame and runs the flow, and the panel fills in
// order: tag chips, then the hang-tag verdict, then the render, closet and week.

/** Point, snap, and read the verdict. */
export function ScanScreen(): ReactNode {
  const { flow, person, settings, navigate, openSheet } = useApp();
  const hasFrame = flow.frame !== null;
  const camera = useCamera("environment", !hasFrame);
  const frameUrl = useObjectUrl(flow.frame);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [flash, setFlash] = useState(0);
  const [snapError, setSnapError] = useState<string | null>(null);

  const snap = async (): Promise<void> => {
    const video = camera.videoRef.current;
    if (!video) return;
    try {
      const frame = await captureFrame(video);
      setFlash((n) => n + 1);
      setSnapError(null);
      flow.start(frame);
    } catch (error) {
      setSnapError(error instanceof Error ? error.message : String(error));
    }
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) flow.start(await shrinkImage(file));
  };

  const tags = flow.scan.status === "done" ? flow.scan.value.tags : null;
  const judged = flow.judge.status === "done" ? flow.judge.value : null;

  return (
    <section className="scan" data-has-frame={hasFrame}>
      <div className="stage">
        {hasFrame ? (
          frameUrl && <img className="stage-media" src={frameUrl} alt="The snapped garment" />
        ) : (
          <video ref={camera.videoRef} className="stage-media" playsInline muted autoPlay />
        )}
        <span className="viewfinder" aria-hidden="true" />
        {flow.scan.status === "running" && <span className="scanline" aria-hidden="true" />}
        {flash > 0 && <span key={flash} className="shutter-flash" aria-hidden="true" />}
        {!hasFrame && (
          <p className="stage-hint">
            {camera.status === "live" || camera.status === "starting"
              ? "Point at a garment"
              : (camera.error ?? "Use a photo of the garment")}
          </p>
        )}
        <div className="shutter-row">
          <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Use a photo">
            <Icon name="upload" />
          </button>
          {hasFrame ? (
            <button type="button" className="btn btn-solid" onClick={flow.reset}>
              <Icon name="camera" /> New scan
            </button>
          ) : (
            <button
              type="button"
              className="shutter"
              onClick={() => void snap()}
              disabled={camera.status !== "live"}
              aria-label="Snap the garment"
            />
          )}
          <span className="icon-btn is-ghost" aria-hidden="true" />
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void pick(event)} />
      </div>

      {snapError && <p className="error-line">{snapError}</p>}

      {hasFrame && (
        <div className="panel">
          <ProgressRail flow={flow} />
          {flow.scan.status === "failed" ? (
            <p className="error-line">
              Could not read the tags. {flow.scan.error}
              <button type="button" onClick={flow.retry}>
                Try again
              </button>
            </p>
          ) : (
            <TagChips tags={tags} />
          )}
          {flow.judge.status === "running" && <VerdictPending />}
          {flow.judge.status === "failed" && (
            <p className="error-line">
              No verdict. {flow.judge.error}
              <button type="button" onClick={flow.retry}>
                Try again
              </button>
            </p>
          )}
          {judged && (
            <>
              <VerdictCard verdict={judged.verdict} />
              <div className="panel-actions" data-decision={judged.verdict.decision}>
                <button type="button" className="btn btn-accent" onClick={() => navigate("live")}>
                  <Icon name="live" /> See it on you live
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => openSheet("stylist")}>
                  <Icon name="chat" /> Ask the stylist
                </button>
              </div>
              <RenderPanel
                step={flow.render}
                person={person.photo}
                onRetry={flow.retry}
                onOpenMe={() => navigate("me")}
                onOpenLive={() => navigate("live")}
                onExpand={() => navigate("render")}
              />
              <ClosetMatches owner={settings.owner} verdict={judged.verdict} />
              <WeekStrip week={judged.week} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
