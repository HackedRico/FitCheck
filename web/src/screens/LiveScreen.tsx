import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { api, errorMessage, type Garment } from "../api/client";
import { AddGarmentSheet } from "../components/AddGarmentSheet";
import { Icon } from "../components/Icons";
import { OutfitSnap, type Snapshot } from "../components/OutfitSnap";
import { OutfitTray } from "../components/OutfitTray";
import { captureFrame, useCamera, type Facing } from "../lib/camera";
import { encodeCanvas } from "../lib/canvas";
import { drawOnJoints, drawPlaced } from "../lib/composite";
import {
  jointPair,
  placeGarment,
  smoothJoints,
  smoothPlacement,
  type JointPair,
  type Landmark,
  type Placement,
} from "../lib/fit";
import type { GarmentSprite } from "../lib/garmentSprite";
import { createOccluder, type Occluder } from "../lib/occlusion";
import { loadPoseLandmarker } from "../lib/pose";
import { canGoBackInApp } from "../lib/route";
import { useApp } from "../state/app";
import { byLayer, candidateWearable, closetWearable, wearablesFromPhoto, type Wearable } from "../state/outfit";

// =============================================================================
// Module Overview
// =============================================================================
// The live preview (ADR 0004): the camera feed with the outfit drawn on the
// owner's body, in the browser, every frame. The tray along the bottom holds the
// candidate, the closet and anything brought in by link or photo; a top and a
// bottom can be worn together, bottoms drawn first. When a garment photo showed
// it worn, `extractGarment` kept the wearer's shoulders (or hips), and those map
// onto the owner's joints so the garment sits the way it was worn; otherwise the
// cutout's outline gives where the joints would sit. The owner's hair, face,
// neck and hands are drawn back over the garments (`createOccluder`). Snapping
// the candidate alone keeps that frame as its render; any other outfit opens in
// `OutfitSnap`.

// Higher follows faster, lower holds steadier against landmark jitter
const SMOOTHING = 0.45;
// The hair and skin mask costs about twice the pose, so it refreshes at most 15 times a second
const OCCLUSION_INTERVAL_MS = 66;

type PoseStatus = "loading" | "ready" | "failed";

/** One worn garment's sprite and where it sat last frame. */
interface Layer {
  key: string;
  item: Wearable;
  sprite: GarmentSprite;
  placement: Placement | null;
  joints: JointPair | null;
}

/** The outfit on the owner, live. */
export function LiveScreen(): ReactNode {
  const { flow, outfit, settings, pipelines, navigate } = useApp();
  const [facing, setFacing] = useState<Facing>("user");
  const camera = useCamera(facing, true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layersRef = useRef<Layer[]>([]);
  const [poseStatus, setPoseStatus] = useState<PoseStatus>("loading");
  const [tracking, setTracking] = useState(false);
  const [fps, setFps] = useState(0);
  const [dressing, setDressing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [closet, setCloset] = useState<Garment[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const candidate = flow.scan.status === "done" ? candidateWearable(flow.scan.value) : null;
  const owner = settings.owner;

  useEffect(() => {
    let cancelled = false;
    api
      .closet(owner)
      .then((garments) => {
        if (!cancelled) setCloset(garments);
      })
      .catch((error: unknown) => console.warn("[live] Closet did not load.", error));
    return () => {
      cancelled = true;
    };
  }, [owner]);

  const items = useMemo(() => {
    const fromCloset = closet.map((garment) => closetWearable(owner, garment));
    // Worn ones go last so a tile stays put when tapped; they only show there once off the list
    const all = [candidate, ...outfit.added, ...fromCloset, ...outfit.worn].filter((item): item is Wearable => item !== null);
    return all.filter((item, index) => all.findIndex((other) => other.key === item.key) === index);
  }, [candidate, outfit.added, outfit.worn, closet, owner]);

  // Cut out each worn garment, keeping where the last frame drew the ones still on
  useEffect(() => {
    let cancelled = false;
    const worn = byLayer(outfit.worn);
    setDressing(worn.length > 0);
    void Promise.allSettled(worn.map((item) => item.sprite())).then((results) => {
      if (cancelled) return;
      const previous = new Map(layersRef.current.map((layer) => [layer.key, layer]));
      const layers: Layer[] = [];
      const failed: string[] = [];
      results.forEach((result, index) => {
        const item = worn[index];
        if (!item) return;
        if (result.status === "rejected") {
          console.warn("[live] Garment did not load.", result.reason);
          failed.push(item.label);
          return;
        }
        const last = previous.get(item.key);
        layers.push({ key: item.key, item, sprite: result.value, placement: last?.placement ?? null, joints: last?.joints ?? null });
      });
      layersRef.current = layers;
      setDressing(false);
      setNotice(failed.length > 0 ? `The ${failed.join(" and the ")} did not load. Take it off and pick it again.` : null);
    });
    return () => {
      cancelled = true;
    };
  }, [outfit.worn]);

  useEffect(() => {
    if (camera.status !== "live") return undefined;
    let stopped = false;
    let frameHandle = 0;

    let occluder: Occluder | null = null;
    // Without it the garments still draw, only over the face and hands
    createOccluder()
      .then((ready) => {
        if (stopped) ready.close();
        else occluder = ready;
      })
      .catch((error: unknown) => console.warn("[live] Occlusion segmenter failed to load.", error));

    void (async () => {
      let landmarker;
      try {
        landmarker = await loadPoseLandmarker();
      } catch (error) {
        console.warn("[live] Pose model failed to load.", error);
        if (!stopped) setPoseStatus("failed");
        return;
      }
      if (stopped) return;
      setPoseStatus("ready");
      let lastVideoTime = -1;
      let frames = 0;
      let fpsSince = performance.now();
      let lastSeen = false;
      let lastOcclusion = 0;

      const draw = (): void => {
        if (stopped) return;
        const video = camera.videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (video && canvas && context && video.videoWidth > 0) {
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          const frame = { width: canvas.width, height: canvas.height };
          const layers = layersRef.current;
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const pose = landmarker.detectForVideo(video, performance.now()).landmarks[0];
            for (const layer of layers) fitLayer(layer, pose, frame);
            // A face moves little between frames, so the mask can lag the pose and save the time
            const now = performance.now();
            if (occluder && layers.length > 0 && now - lastOcclusion >= OCCLUSION_INTERVAL_MS) {
              lastOcclusion = now;
              occluder.update(video, now, pose);
            }
            const seen = pose !== undefined && (layers.length === 0 || layers.some((l) => l.joints ?? l.placement));
            if (seen !== lastSeen) {
              lastSeen = seen;
              setTracking(seen);
            }
            frames += 1;
          }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          for (const layer of layers) drawLayer(context, layer);
          if (occluder && layers.length > 0) occluder.draw(context, video);
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
      occluder?.close();
    };
  }, [camera.status, camera.videoRef]);

  const addPhoto = async (image: Blob): Promise<void> => {
    setSheetOpen(false);
    setAdding(true);
    setNotice(null);
    try {
      outfit.add(await wearablesFromPhoto(image, pipelines.record));
    } catch (cause) {
      setNotice(errorMessage(cause));
    } finally {
      setAdding(false);
    }
  };

  const snap = async (): Promise<void> => {
    const video = camera.videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let person: Blob;
    try {
      person = await captureFrame(video);
    } catch (cause) {
      setNotice(errorMessage(cause));
      return;
    }
    const image = await encodeCanvas(canvas, "image/png");
    if (!image) {
      setNotice("This browser could not save the frame. Try the snap again.");
      return;
    }
    const worn = outfit.worn;
    // The candidate alone is the verdict's own try-on, so the snap becomes its render
    if (candidate !== null && worn.length === 1 && worn[0]?.key === candidate.key) {
      flow.keepRender(image, person);
      navigate("result");
      return;
    }
    setSnapshot({ person, image, worn });
  };

  const back = (): void => {
    // Live is reached from the verdict, the closet or the camera; go back to whichever it was
    // Opened straight on #/live, there is no FitCheck screen behind it to go back to
    if (canGoBackInApp()) window.history.back();
    else navigate("home");
  };

  const hint =
    camera.error ??
    notice ??
    (poseStatus === "loading"
      ? "Loading the pose model"
      : poseStatus === "failed"
        ? "The pose model could not load. Check the connection and come back."
        : items.length === 0
          ? "Tap + to bring in a garment by shop link or photo"
          : outfit.worn.length === 0
            ? "Pick something below to put it on"
            : dressing
              ? "Getting the garment ready"
              : tracking
                ? null
                : "Step back until your shoulders and hips are in view");

  return (
    <section className="fc-cam is-dark fc-live">
      <video ref={camera.videoRef} className="live-source" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="fc-cam-feed" data-mirrored={facing === "user"} />
      <div className="fc-cam-shade" aria-hidden="true" />

      <header className="fc-topbar">
        <button type="button" className="fc-round fc-back" onClick={back} aria-label="Back">
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

      {hint && <p className="fc-cam-hint">{hint}</p>}

      <OutfitTray
        items={items}
        worn={outfit.worn}
        onToggle={outfit.toggle}
        onAdd={() => setSheetOpen(true)}
        adding={adding}
      />

      <footer className="fc-shutterbar">
        <span className="fc-round is-ghost" aria-hidden="true" />
        <button
          type="button"
          className="fc-shutter is-render"
          disabled={camera.status !== "live" || outfit.worn.length === 0}
          onClick={() => void snap()}
          aria-label="Snap the outfit"
        >
          <span />
        </button>
        <span className="fc-round is-ghost" aria-hidden="true" />
      </footer>
      <p className="fc-live-note">Snap for the full render, with drape and fit.</p>

      <AddGarmentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onGarment={(image) => void addPhoto(image)}
        title="Try something on"
        linkLabel="Found it online? Paste the link to the garment or outfit"
        busy={adding}
      />
      {snapshot && <OutfitSnap snapshot={snapshot} onClose={() => setSnapshot(null)} />}
    </section>
  );
}

// -----------------------------------------------------------------
// Fitting and drawing one worn garment
// -----------------------------------------------------------------

/** Move `layer` to where the owner's body is this frame, or clear it when out of view. */
function fitLayer(layer: Layer, pose: readonly Landmark[] | undefined, frame: { width: number; height: number }): void {
  const region = layer.item.region;
  const { sprite } = layer;
  if (sprite.anchors) {
    const next = pose ? jointPair(pose, region, frame) : null;
    layer.joints = next ? smoothJoints(layer.joints, next, SMOOTHING) : null;
  } else {
    const next = pose ? placeGarment(pose, region, frame, sprite.canvas.width / sprite.canvas.height) : null;
    layer.placement = next ? smoothPlacement(layer.placement, next, SMOOTHING) : null;
  }
}

function drawLayer(context: CanvasRenderingContext2D, layer: Layer): void {
  const garment = layer.sprite.canvas;
  if (layer.sprite.anchors && layer.joints) drawOnJoints(context, garment, layer.sprite.anchors, layer.joints);
  else if (layer.placement) drawPlaced(context, garment, layer.placement);
}
