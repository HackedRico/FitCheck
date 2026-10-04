import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "../components/Icons";
import { captureFrame, useCamera, type Facing } from "../lib/camera";
import { prepareCutout } from "../lib/cutout";
import { placeGarment, smoothPlacement, type Placement } from "../lib/fit";
import { loadPoseLandmarker } from "../lib/pose";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The live preview (ADR 0004): the camera feed with the candidate's cutout pinned
// to the owner's pose by MediaPipe Pose Landmarker, in the browser, every frame.
// The selfie view is mirrored like a mirror. Snap sends that frame to the
// diffusion renderer for the real render.

// Higher follows faster, lower holds steadier against landmark jitter
const SMOOTHING = 0.45;

type PoseStatus = "loading" | "ready" | "failed";

/** The candidate on the owner, live. */
export function LiveScreen(): ReactNode {
  const { flow, navigate } = useApp();
  const [facing, setFacing] = useState<Facing>("user");
  const camera = useCamera(facing, flow.scan.status === "done");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [poseStatus, setPoseStatus] = useState<PoseStatus>("loading");
  const [tracking, setTracking] = useState(false);
  const [fps, setFps] = useState(0);

  const candidate = flow.scan.status === "done" ? flow.scan.value : null;

  useEffect(() => {
    if (candidate === null || candidate.region === null || camera.status !== "live") return undefined;
    const region = candidate.region;
    let stopped = false;
    let frameHandle = 0;

    void (async () => {
      let landmarker;
      let garment: HTMLCanvasElement;
      try {
        [landmarker, garment] = await Promise.all([loadPoseLandmarker(), prepareCutout(candidate.cutout)]);
      } catch (error) {
        console.warn("[live] Pose model failed to load.", error);
        if (!stopped) setPoseStatus("failed");
        return;
      }
      if (stopped) return;
      setPoseStatus("ready");
      let placement: Placement | null = null;
      let lastVideoTime = -1;
      let frames = 0;
      let fpsSince = performance.now();
      let lastSeen = false;

      const draw = (): void => {
        if (stopped) return;
        const video = camera.videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (video && canvas && context && video.videoWidth > 0) {
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const result = landmarker.detectForVideo(video, performance.now());
            const pose = result.landmarks[0];
            const next = pose
              ? placeGarment(pose, region, { width: canvas.width, height: canvas.height }, garment.width / garment.height)
              : null;
            placement = next ? smoothPlacement(placement, next, SMOOTHING) : null;
            if ((placement !== null) !== lastSeen) {
              lastSeen = placement !== null;
              setTracking(lastSeen);
            }
            frames += 1;
          }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (placement) {
            context.save();
            context.translate(placement.topX, placement.topY);
            context.rotate(placement.angle);
            context.drawImage(garment, -placement.width / 2, 0, placement.width, placement.height);
            context.restore();
          }
          const now = performance.now();
          if (now - fpsSince > 1000) {
            setFps(Math.round((frames * 1000) / (now - fpsSince)));
            frames = 0;
            fpsSince = now;
          }
        }
        frameHandle = requestAnimationFrame(draw);
      };
      frameHandle = requestAnimationFrame(draw);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frameHandle);
    };
  }, [candidate, camera.status, camera.videoRef]);

  if (candidate === null) {
    return (
      <div className="fc-page fc-empty">
        <p className="fc-kicker">Live preview</p>
        <h1 className="display">Scan a garment first</h1>
        <p className="fc-muted">The live preview pins the garment to you on the camera, on this phone, in real time.</p>
        <button type="button" className="fc-btn is-primary" onClick={() => navigate("home")}>
          <Icon name="camera" /> Scan a garment
        </button>
      </div>
    );
  }

  const snap = async (): Promise<void> => {
    const video = camera.videoRef.current;
    if (!video) return;
    flow.requestRender(await captureFrame(video), "live");
    navigate("result");
  };

  const hint =
    candidate.region === null
      ? "The live preview covers tops, bottoms and dresses."
      : poseStatus === "loading"
        ? "Loading the pose model"
        : poseStatus === "failed"
          ? "The pose model could not load. Check the connection and come back."
          : tracking
            ? null
            : "Step back until your shoulders and hips are in view";

  return (
    <section className="fc-cam is-dark fc-live">
      <video ref={camera.videoRef} className="live-source" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="fc-cam-feed" data-mirrored={facing === "user"} />
      <div className="fc-cam-shade" aria-hidden="true" />

      <header className="fc-topbar">
        <button type="button" className="fc-round fc-back" onClick={() => navigate("result")} aria-label="Back to the verdict">
          <Icon name="arrow" />
        </button>
        <p className="fc-live-badge">
          <i data-on={tracking} /> {tracking ? "Tracking you" : "Live"} · on device · {fps} fps
        </p>
        <button
          type="button"
          className="fc-round"
          onClick={() => setFacing(facing === "user" ? "environment" : "user")}
          aria-label="Switch camera"
        >
          <Icon name="flip" />
        </button>
      </header>

      {(hint ?? camera.error) && <p className="fc-cam-hint">{camera.error ?? hint}</p>}

      <footer className="fc-shutterbar">
        <span className="fc-round is-ghost" aria-hidden="true" />
        <button
          type="button"
          className="fc-shutter is-render"
          disabled={camera.status !== "live" || candidate.region === null}
          onClick={() => void snap()}
          aria-label="Snap and render"
        >
          <span />
        </button>
        <span className="fc-round is-ghost" aria-hidden="true" />
      </footer>
      <p className="fc-live-note">Snap for the full render, with drape and fit.</p>
    </section>
  );
}
