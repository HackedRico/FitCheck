import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "../components/Icons";
import { captureFrame, useCamera, type Facing } from "../lib/camera";
import { placeGarment, smoothPlacement, type Landmark, type Placement } from "../lib/fit";
import { extractGarment, type GarmentSprite, type Point } from "../lib/garmentSprite";
import { loadPoseLandmarker } from "../lib/pose";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The live preview (ADR 0004): the camera feed with the candidate drawn on the
// owner's body, in the browser, every frame. When the garment photo showed it
// worn, `extractGarment` kept the wearer's shoulders (or hips), and those map
// onto the owner's joints so the garment sits the way it was worn; otherwise
// the cutout is fitted by `placeGarment`. Snap keeps that frame as the owner's
// "on you" image, no server needed.

// Higher follows faster, lower holds steadier against landmark jitter
const SMOOTHING = 0.45;
const MIN_VISIBILITY = 0.5;

// MediaPipe Pose landmark indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

type PoseStatus = "loading" | "ready" | "failed";

interface JointPair {
  left: Point;
  right: Point;
}

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
      let sprite: GarmentSprite;
      try {
        [landmarker, sprite] = await Promise.all([loadPoseLandmarker(), extractGarment(candidate.cutout, region)]);
      } catch (error) {
        console.warn("[live] Pose model failed to load.", error);
        if (!stopped) setPoseStatus("failed");
        return;
      }
      if (stopped) return;
      setPoseStatus("ready");
      const garment = sprite.canvas;
      const lower = region === "lower";
      let placement: Placement | null = null;
      let joints: JointPair | null = null;
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
          const frame = { width: canvas.width, height: canvas.height };
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const pose = landmarker.detectForVideo(video, performance.now()).landmarks[0];
            if (sprite.anchors) {
              const next = pose ? jointPair(pose, lower, frame) : null;
              joints = next ? smoothJoints(joints, next) : null;
            } else {
              const next = pose ? placeGarment(pose, region, frame, garment.width / garment.height) : null;
              placement = next ? smoothPlacement(placement, next, SMOOTHING) : null;
            }
            const seen = joints !== null || placement !== null;
            if (seen !== lastSeen) {
              lastSeen = seen;
              setTracking(seen);
            }
            frames += 1;
          }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (sprite.anchors && joints) {
            drawOnJoints(context, garment, sprite.anchors, joints);
          } else if (placement) {
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
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const person = await captureFrame(video);
    const composite = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (composite) flow.keepRender(composite, person);
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

// -----------------------------------------------------------------
// Mapping the wearer's joints onto the owner's
// -----------------------------------------------------------------

/** The owner's shoulders (or hips for bottoms) in frame pixels, or `null` when out of view. */
function jointPair(pose: readonly Landmark[], lower: boolean, frame: { width: number; height: number }): JointPair | null {
  const at = (index: number): Point | null => {
    const mark = pose[index];
    if (!mark || (mark.visibility ?? 1) < MIN_VISIBILITY) return null;
    return { x: mark.x * frame.width, y: mark.y * frame.height };
  };
  const left = at(lower ? LEFT_HIP : LEFT_SHOULDER);
  const right = at(lower ? RIGHT_HIP : RIGHT_SHOULDER);
  return left && right ? { left, right } : null;
}

function smoothJoints(previous: JointPair | null, next: JointPair): JointPair {
  if (previous === null) return next;
  const mix = (a: Point, b: Point): Point => ({
    x: a.x + (b.x - a.x) * SMOOTHING,
    y: a.y + (b.y - a.y) * SMOOTHING,
  });
  return { left: mix(previous.left, next.left), right: mix(previous.right, next.right) };
}

/** Draw `garment` so its wearer's joints land on the owner's: one scale, one turn, one shift. */
function drawOnJoints(context: CanvasRenderingContext2D, garment: HTMLCanvasElement, from: JointPair, to: JointPair): void {
  const fromSpan = { x: from.left.x - from.right.x, y: from.left.y - from.right.y };
  const toSpan = { x: to.left.x - to.right.x, y: to.left.y - to.right.y };
  const fromLength = Math.hypot(fromSpan.x, fromSpan.y);
  if (fromLength < 1) return;
  const scale = Math.hypot(toSpan.x, toSpan.y) / fromLength;
  const angle = Math.atan2(toSpan.y, toSpan.x) - Math.atan2(fromSpan.y, fromSpan.x);
  context.save();
  context.translate(to.right.x, to.right.y);
  context.rotate(angle);
  context.scale(scale, scale);
  context.translate(-from.right.x, -from.right.y);
  context.drawImage(garment, 0, 0);
  context.restore();
}
