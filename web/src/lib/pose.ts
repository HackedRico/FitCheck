import type { PoseLandmarker, PoseLandmarkerOptions } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

import { once } from "./once";

// =============================================================================
// Module Overview
// =============================================================================
// Loads MediaPipe Pose Landmarker (Apache-2.0) once per page: a VIDEO-mode one for
// the live preview and an IMAGE-mode one for stills (garment photos, person photos).
// The wasm runtime is bundled with the app so it loads from our own origin; the
// model file comes from Google's model bucket unless `VITE_POSE_MODEL_URL` points
// at a local copy. Everything runs in the browser; no frame leaves the phone.

const DEFAULT_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const MODEL_URL = import.meta.env.VITE_POSE_MODEL_URL ?? DEFAULT_MODEL_URL;
// Stills are not latency bound, so they get the larger, more accurate model
const IMAGE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
// Enough to tell the subject from a bystander in the same photo
const IMAGE_MAX_POSES = 3;

/** Return the shared Pose Landmarker, creating it on first call. */
export const loadPoseLandmarker: () => Promise<PoseLandmarker> = once(createLandmarker);

/** Return the shared IMAGE-mode Pose Landmarker for stills, creating it on first call. */
export const loadImagePoseLandmarker: () => Promise<PoseLandmarker> = once(async () => {
  // A separate instance: the live preview's VIDEO-mode one needs increasing timestamps
  const { PoseLandmarker } = await import("@mediapipe/tasks-vision");
  return PoseLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    { baseOptions: { modelAssetPath: IMAGE_MODEL_URL }, runningMode: "IMAGE", numPoses: IMAGE_MAX_POSES },
  );
});

async function createLandmarker(): Promise<PoseLandmarker> {
  // Lazy import keeps the 1 MB vision bundle out of the first page load
  const { PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = { wasmLoaderPath, wasmBinaryPath };
  try {
    return await PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch (error) {
    console.warn("[pose] GPU delegate unavailable; running Pose Landmarker on the CPU.", error);
    return PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

function options(delegate: "GPU" | "CPU"): PoseLandmarkerOptions {
  return {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
}
