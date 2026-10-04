import type { PoseLandmarker, PoseLandmarkerOptions } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

// =============================================================================
// Module Overview
// =============================================================================
// Loads MediaPipe Pose Landmarker (Apache-2.0) once per page for the live preview.
// The wasm runtime is bundled with the app so it loads from our own origin; the
// model file comes from Google's model bucket unless `VITE_POSE_MODEL_URL` points
// at a local copy. Everything runs in the browser; no frame leaves the phone.

const DEFAULT_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const MODEL_URL = import.meta.env.VITE_POSE_MODEL_URL ?? DEFAULT_MODEL_URL;

let pending: Promise<PoseLandmarker> | null = null;

/** Return the shared Pose Landmarker, creating it on first call. */
export function loadPoseLandmarker(): Promise<PoseLandmarker> {
  pending ??= createLandmarker().catch((error: unknown) => {
    // Forget the failure so the next visit to the live preview can try again
    pending = null;
    throw error;
  });
  return pending;
}

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
