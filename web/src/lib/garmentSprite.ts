import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

import type { TryOnRegion } from "../api/client";
import { cropCanvas, decodeScaled } from "./canvas";
import { prepareCutout } from "./cutout";
import {
  jointPair,
  landmarkPoint,
  LEFT_ANKLE,
  LEFT_HIP,
  RIGHT_ANKLE,
  RIGHT_HIP,
  type JointPair,
  type Point,
} from "./fit";
import { once } from "./once";
import { loadImagePoseLandmarker } from "./pose";

// =============================================================================
// Module Overview
// =============================================================================
// Turns a garment photo into a sprite the live preview can pin onto the owner.
// Shop photos usually show the garment on a model, so `extractGarment` runs two
// MediaPipe models (Apache-2.0) on the device: the multiclass selfie segmenter
// keeps only the "clothes" pixels, and Pose Landmarker finds where the model's
// shoulders or hips were, so the live preview can map those joints onto the
// owner's. A product shot with no one in it goes to `prepareCutout` instead, and
// `outlineAnchors` reads where a wearer's shoulders (or hips) would sit from the
// garment's outline, so every garment is pinned the same way. `extractWornGarment`
// pulls a second piece out of an outfit photo, and only when a wearer is visible.

export const SEGMENTER_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

// selfie_multiclass_256x256 categories: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other
const CLOTHES = 4;
const PERSON: ReadonlySet<number> = new Set([1, 2, 3]);
// Hair or skin on at least this share of the photo means someone is wearing the garment
const MIN_PERSON_SHARE = 0.01;
// Large enough to keep knit and print detail at shoulder width on a phone screen
const MAX_SIDE = 768;
// Below this share of the band, the segmenter did not find a worn garment
const MIN_CLOTHES_SHARE = 0.04;

/** A garment ready to draw, with the joints it was worn at when a person wore it. */
export interface GarmentSprite {
  canvas: HTMLCanvasElement;
  // The wearer's left and right joint (shoulders, or hips for bottoms) in `canvas` pixels
  anchors: JointPair | null;
}

/** Cut the garment out of `image` for `region`, keeping where the wearer's joints were. */
export async function extractGarment(image: Blob, region: TryOnRegion): Promise<GarmentSprite> {
  const source = await decodeScaled(image, MAX_SIDE);
  try {
    const sprite = await cutWornGarment(source, region);
    if (sprite) return sprite;
  } catch (error) {
    console.warn("[garment] On-device clothes segmentation failed; using the plain cutout.", error);
  }
  const canvas = await prepareCutout(image);
  return { canvas, anchors: outlineAnchors(canvas, region) };
}

/** The `region` garment a person wears in `image`, or `null` when nobody visibly wears one there. */
export async function extractWornGarment(image: Blob, region: TryOnRegion): Promise<GarmentSprite | null> {
  try {
    const sprite = await cutWornGarment(await decodeScaled(image, MAX_SIDE), region);
    // Without the wearer's joints there is no telling a worn piece from a stray patch of fabric
    return sprite?.anchors ? sprite : null;
  } catch (error) {
    console.warn("[garment] On-device clothes segmentation failed.", error);
    return null;
  }
}

// -----------------------------------------------------------------
// Product shot: find where the joints would sit from the garment's outline
// -----------------------------------------------------------------

// A top's shoulder seams sit within this share of its width below the collar
const SHOULDER_BAND = 0.18;
// The widest row in that band, give or take, is the line across the shoulder seams
const SHOULDER_ROW = 0.95;
// Shoulder joints sit inside the shoulder seams, hip joints inside the hips
const SEAMS_OVER_JOINTS = 1.3;
const HIPS_OVER_JOINTS = 1.45;
// Hip joints sit below the waistband, by this share of the waistband's width
const HIP_DROP = 0.2;

/**
 * Where a wearer's shoulders (or hips) would be on a garment nobody wears, from its outline:
 * the shoulder seams of a top or dress, the waistband of a bottom. `null` if there is no outline.
 */
function outlineAnchors(canvas: HTMLCanvasElement, region: TryOnRegion): JointPair | null {
  const { width, height } = canvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || width < 8 || height < 8) return null;
  const alpha = context.getImageData(0, 0, width, height).data;
  const extent = (y: number): { left: number; right: number } | null => {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if ((alpha[(y * width + x) * 4 + 3] ?? 0) < 128) continue;
      if (left < 0) left = x;
      right = x;
    }
    return left < 0 ? null : { left, right };
  };
  const span = (y: number): number => {
    const e = extent(y);
    return e ? e.right - e.left : 0;
  };
  // The first row wider than a collar tip or the stub of a hanger is the garment's top
  let top = 0;
  while (top < height && span(top) < width * 0.25) top += 1;
  if (top >= height) return null;

  if (region === "lower") {
    const waist = extent(top);
    if (!waist) return null;
    const middle = (waist.left + waist.right) / 2;
    const half = (waist.right - waist.left) / 2 / HIPS_OVER_JOINTS;
    const y = top + (waist.right - waist.left) * HIP_DROP;
    return { left: { x: middle + half, y }, right: { x: middle - half, y } };
  }

  const band = Math.min(height - 1, top + Math.round(width * SHOULDER_BAND));
  let widest = 0;
  for (let y = top; y <= band; y += 1) widest = Math.max(widest, span(y));
  let row = top;
  while (row < band && span(row) < widest * SHOULDER_ROW) row += 1;
  const seams = extent(row);
  if (!seams) return null;
  const middle = (seams.left + seams.right) / 2;
  const half = (seams.right - seams.left) / 2 / SEAMS_OVER_JOINTS;
  // The garment faces the camera, so the wearer's left shoulder is on the image's right
  return { left: { x: middle + half, y: row }, right: { x: middle - half, y: row } };
}

// -----------------------------------------------------------------
// Worn garment: segment the clothes, crop to the region, keep anchors
// -----------------------------------------------------------------

async function cutWornGarment(source: HTMLCanvasElement, region: TryOnRegion): Promise<GarmentSprite | null> {
  const [segmenter, landmarker] = await Promise.all([loadSegmenter(), loadImagePoseLandmarker()]);
  const { width, height } = source;
  const pose = landmarker.detect(source).landmarks[0];
  const at = (index: number): Point | null => landmarkPoint(pose, index, source);
  // Shop photos often crop the model's head, which hides the pose; the clothes still cut out
  const anchors = pose ? jointPair(pose, region, source) : null;
  const band = anchors ? regionBand(region, anchors, at, height) : { top: 0, bottom: height };

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
  // With no skin or hair in view, any pose is one the model imagined in a product shot, and the
  // "clothes" mask a coarse guess at it; the plain cutout follows its outline at full resolution
  if (share(categories, PERSON) < MIN_PERSON_SHARE) return null;

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
  const canvas = cropCanvas(source, crop);
  const shift = (p: Point): Point => ({ x: p.x - crop.x, y: p.y - crop.y });
  return { canvas, anchors: anchors ? { left: shift(anchors.left), right: shift(anchors.right) } : null };
}

/** The rows of the photo the garment can occupy, so a jacket does not take the trousers along. */
function regionBand(
  region: TryOnRegion,
  { left, right }: JointPair,
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

function share(categories: Uint8Array, wanted: ReadonlySet<number>): number {
  let count = 0;
  for (const category of categories) if (wanted.has(category)) count += 1;
  return count / Math.max(1, categories.length);
}

// -----------------------------------------------------------------
// Model loading, once per page
// -----------------------------------------------------------------

const loadSegmenter = once(async (): Promise<ImageSegmenter> => {
  const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
  return ImageSegmenter.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    { baseOptions: { modelAssetPath: SEGMENTER_URL }, runningMode: "IMAGE", outputCategoryMask: true, outputConfidenceMasks: false },
  );
});
