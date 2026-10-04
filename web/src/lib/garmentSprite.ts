import type { ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

import type { TryOnRegion } from "../api/client";
import { prepareCutout } from "./cutout";

// =============================================================================
// Module Overview
// =============================================================================
// Turns a garment photo into a sprite the live preview can pin onto the owner.
// Shop photos usually show the garment on a model, so `extractGarment` runs two
// MediaPipe models (Apache-2.0) on the device: the multiclass selfie segmenter
// keeps only the "clothes" pixels, and Pose Landmarker finds where the model's
// shoulders or hips were, so the live preview can map those joints onto the
// owner's. Photos where no clothes are found fall back to `prepareCutout`.

const SEGMENTER_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
const POSE_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

// selfie_multiclass_256x256 categories: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other
const CLOTHES = 4;
// Large enough to keep knit and print detail at shoulder width on a phone screen
const MAX_SIDE = 768;
// Below this share of the band, the segmenter did not find a worn garment
const MIN_CLOTHES_SHARE = 0.04;
const MIN_VISIBILITY = 0.5;

// MediaPipe Pose landmark indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

export interface Point {
  x: number;
  y: number;
}

/** A garment ready to draw, with the joints it was worn at when a person wore it. */
export interface GarmentSprite {
  canvas: HTMLCanvasElement;
  // The wearer's left and right joint (shoulders, or hips for bottoms) in `canvas` pixels
  anchors: { left: Point; right: Point } | null;
}

/** Cut the garment out of `image` for `region`, keeping where the wearer's joints were. */
export async function extractGarment(image: Blob, region: TryOnRegion): Promise<GarmentSprite> {
  const source = await drawScaled(image);
  try {
    const sprite = await cutWornGarment(source, region);
    if (sprite) return sprite;
  } catch (error) {
    console.warn("[garment] On-device clothes segmentation failed; using the plain cutout.", error);
  }
  return { canvas: await prepareCutout(image), anchors: null };
}

// -----------------------------------------------------------------
// Worn garment: segment the clothes, crop to the region, keep anchors
// -----------------------------------------------------------------

async function cutWornGarment(source: HTMLCanvasElement, region: TryOnRegion): Promise<GarmentSprite | null> {
  const [segmenter, landmarker] = await Promise.all([loadSegmenter(), loadImagePose()]);
  const { width, height } = source;
  const pose = landmarker.detect(source).landmarks[0];
  const at = (index: number): Point | null => {
    const mark = pose?.[index];
    if (!mark || (mark.visibility ?? 1) < MIN_VISIBILITY) return null;
    return { x: mark.x * width, y: mark.y * height };
  };
  const lower = region === "lower";
  const left = at(lower ? LEFT_HIP : LEFT_SHOULDER);
  const right = at(lower ? RIGHT_HIP : RIGHT_SHOULDER);
  // Shop photos often crop the model's head, which hides the pose; the clothes still cut out
  const anchors = left && right ? { left, right } : null;
  const band = anchors ? regionBand(region, anchors.left, anchors.right, at, height) : { top: 0, bottom: height };

  const result = segmenter.segment(source);
  const mask = result.categoryMask;
  if (!mask) {
    result.close();
    return null;
  }
  const categories = mask.getAsUint8Array();
  const maskWidth = mask.width;
  const maskHeight = mask.height;
  result.close();

  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, width, height);
  let kept = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const my = Math.min(maskHeight - 1, Math.floor((y * maskHeight) / height));
    const inBand = y >= band.top && y <= band.bottom;
    for (let x = 0; x < width; x += 1) {
      const mx = Math.min(maskWidth - 1, Math.floor((x * maskWidth) / width));
      const keep = inBand && categories[my * maskWidth + mx] === CLOTHES;
      const alpha = (y * width + x) * 4 + 3;
      if (!keep) {
        pixels.data[alpha] = 0;
        continue;
      }
      kept += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bandArea = width * Math.max(1, band.bottom - band.top);
  if (maxX < 0 || kept < bandArea * MIN_CLOTHES_SHARE) return null;

  context.putImageData(pixels, 0, 0);
  const crop = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const canvas = makeCanvas(crop.width, crop.height);
  canvas.getContext("2d")?.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const shift = (p: Point): Point => ({ x: p.x - crop.x, y: p.y - crop.y });
  return { canvas, anchors: anchors ? { left: shift(anchors.left), right: shift(anchors.right) } : null };
}

/** The rows of the photo the garment can occupy, so a jacket does not take the trousers along. */
function regionBand(
  region: TryOnRegion,
  left: Point,
  right: Point,
  at: (index: number) => Point | null,
  height: number,
): { top: number; bottom: number } {
  const jointY = (left.y + right.y) / 2;
  const jointWidth = Math.hypot(left.x - right.x, left.y - right.y);
  const ankles = [at(LEFT_ANKLE), at(RIGHT_ANKLE)].filter((p): p is Point => p !== null);
  const ankleY = ankles.length > 0 ? Math.max(...ankles.map((p) => p.y)) : height;
  if (region === "lower") return { top: jointY - jointWidth * 0.35, bottom: ankleY + jointWidth * 0.3 };
  const hips = [at(LEFT_HIP), at(RIGHT_HIP)].filter((p): p is Point => p !== null);
  // A torso runs about 1.5 shoulder widths when the photo crops the hips
  const hipY = hips.length > 0 ? hips.reduce((sum, p) => sum + p.y, 0) / hips.length : jointY + jointWidth * 1.5;
  const torso = Math.max(1, hipY - jointY);
  // Collars rise above the shoulder joints; coats run past the hips
  if (region === "upper") return { top: jointY - torso * 0.45, bottom: hipY + torso * 0.55 };
  return { top: jointY - torso * 0.45, bottom: ankleY };
}

// -----------------------------------------------------------------
// Model loading, once per page
// -----------------------------------------------------------------

let segmenterPending: Promise<ImageSegmenter> | null = null;
let posePending: Promise<PoseLandmarker> | null = null;

function loadSegmenter(): Promise<ImageSegmenter> {
  segmenterPending ??= (async () => {
    const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
    return ImageSegmenter.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      { baseOptions: { modelAssetPath: SEGMENTER_URL }, runningMode: "IMAGE", outputCategoryMask: true, outputConfidenceMasks: false },
    );
  })().catch((error: unknown) => {
    segmenterPending = null;
    throw error;
  });
  return segmenterPending;
}

function loadImagePose(): Promise<PoseLandmarker> {
  // A separate IMAGE-mode landmarker: the live preview's VIDEO-mode one needs increasing timestamps
  posePending ??= (async () => {
    const { PoseLandmarker } = await import("@mediapipe/tasks-vision");
    return PoseLandmarker.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      { baseOptions: { modelAssetPath: POSE_URL }, runningMode: "IMAGE", numPoses: 1 },
    );
  })().catch((error: unknown) => {
    posePending = null;
    throw error;
  });
  return posePending;
}

// -----------------------------------------------------------------
// Canvas helpers
// -----------------------------------------------------------------

async function drawScaled(image: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
