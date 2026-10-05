import type { InteractiveSegmenterLegacy } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

import { cropCanvas, decodeScaled, type Rect } from "./canvas";
import { once } from "./once";

// =============================================================================
// Module Overview
// =============================================================================
// Readies a garment photo for the live preview. When the photo has no
// transparency, MediaPipe's Interactive Segmenter (Apache-2.0) cuts out the
// object under a short stroke through the middle of the frame, on the device:
// it keeps a white shirt on a white wall and drops a busy shop floor, where a
// colour key cannot. If that model cannot load, a flood fill from the edges keys
// out a plain background instead. `cleanMask` then drops what is not garment:
// the hanger hook, stray specks, and the light fringe along the outline, which it
// softens. The result is trimmed so the garment, not its canvas, gets pinned.

const SEGMENTER_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";
// Down the collar or waistband and across the chest or hips: on the garment in a centred
// product shot, and wide enough to cover an open jacket that shows the wall between its fronts
const STROKE = [
  { x: 0.5, y: 0.22 },
  { x: 0.5, y: 0.32 },
  { x: 0.42, y: 0.4 },
  { x: 0.5, y: 0.45 },
  { x: 0.58, y: 0.4 },
  { x: 0.5, y: 0.32 },
];
// The segmenter is unsure between these confidences; alpha ramps across them
const CONFIDENT_FROM = 0.3;
const CONFIDENT_TO = 0.7;
// A cutout outside this share of the photo missed the garment or took the whole frame
const MIN_GARMENT_SHARE = 0.03;
const MAX_GARMENT_SHARE = 0.95;
// Enough pixels for a garment drawn across a laptop camera's full frame
const MAX_SIDE = 768;
// RGB distance from the border colour that still counts as background
const KEY_TOLERANCE = 46;
// Neighbouring background pixels differ by less than this; a garment's outline by more
const KEY_STEP = 7;
// A border this varied is a busy shop floor; keying it would eat into the garment
const MAX_BORDER_SPREAD = 38;
const OPAQUE_ALPHA = 24;
// Hanger hooks, loops and tags are thinner than this share of the garment's width
const THIN_PART = 0.06;

/** Decode `png`, key out a plain background if it has no transparency, clean the outline and trim it. */
export async function prepareCutout(png: Blob): Promise<HTMLCanvasElement> {
  const source = await decodeScaled(png, MAX_SIDE);
  const { width, height } = source;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot draw the cutout.");

  const image = context.getImageData(0, 0, width, height);
  if (!hasTransparency(image)) {
    const original = new Uint8ClampedArray(image.data);
    const cut = await segmentGarment(source, image).catch((error: unknown) => {
      console.warn("[cutout] On-device segmenter unavailable; keying the background instead.", error);
      return false;
    });
    if (!cut) {
      image.data.set(original);
      keyOutBackground(image);
      // Nothing opaque left means the key ate the garment too; show the photo unkeyed instead
      if (opaqueBounds(image) === null) return source;
      // A key that leaves almost the whole photo found no plain background to remove
      if (opaqueShare(image) > 0.97) image.data.set(original);
    }
  }
  cleanMask(image);
  const bounds = opaqueBounds(image);
  if (bounds === null) return source;
  context.putImageData(image, 0, 0);
  return cropCanvas(source, bounds);
}

// -----------------------------------------------------------------
// Cutting out the garment with the segmenter
// -----------------------------------------------------------------

/** Set `image`'s alpha to the segmenter's garment mask; `false` when the mask is not plausible. */
async function segmentGarment(source: HTMLCanvasElement, image: ImageData): Promise<boolean> {
  const segmenter = await loadSegmenter();
  let confidence: Float32Array | null = null;
  let maskWidth = 0;
  let maskHeight = 0;
  // The legacy task calls back synchronously, and the mask is only valid inside the callback
  segmenter.segment(source, { scribble: STROKE }, (result) => {
    const mask = result.confidenceMasks?.[0];
    if (!mask) return;
    confidence = mask.getAsFloat32Array().slice();
    maskWidth = mask.width;
    maskHeight = mask.height;
  });
  const values: Float32Array | null = confidence;
  if (values === null || maskWidth === 0) return false;

  const { width, height, data } = image;
  let kept = 0;
  for (let y = 0; y < height; y += 1) {
    const my = Math.min(maskHeight - 1, Math.floor((y * maskHeight) / height));
    for (let x = 0; x < width; x += 1) {
      const mx = Math.min(maskWidth - 1, Math.floor((x * maskWidth) / width));
      const c = values[my * maskWidth + mx] ?? 0;
      const alpha = Math.min(1, Math.max(0, (c - CONFIDENT_FROM) / (CONFIDENT_TO - CONFIDENT_FROM)));
      data[(y * width + x) * 4 + 3] = Math.round(alpha * 255);
      if (alpha >= 0.5) kept += 1;
    }
  }
  const share = kept / Math.max(1, width * height);
  return share >= MIN_GARMENT_SHARE && share <= MAX_GARMENT_SHARE;
}

const loadSegmenter = once(async (): Promise<InteractiveSegmenterLegacy> => {
  const { InteractiveSegmenterLegacy } = await import("@mediapipe/tasks-vision");
  const create = (delegate: "GPU" | "CPU"): Promise<InteractiveSegmenterLegacy> =>
    InteractiveSegmenterLegacy.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      { baseOptions: { modelAssetPath: SEGMENTER_URL, delegate }, outputConfidenceMasks: true, outputCategoryMask: false },
    );
  // About 40 ms a garment on the GPU against most of a second on the CPU
  return create("GPU").catch((error: unknown) => {
    console.warn("[cutout] GPU delegate unavailable; segmenting garments on the CPU.", error);
    return create("CPU");
  });
});

// -----------------------------------------------------------------
// Cleaning the outline
// -----------------------------------------------------------------

/** Keep the garment's main body, drop thin parts and specks, and soften the outline, in place. */
function cleanMask(image: ImageData): void {
  const { width, height, data } = image;
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i += 1) solid[i] = (data[i * 4 + 3] ?? 0) >= 128 ? 1 : 0;
  const bounds = maskBounds(solid, width, height);
  if (bounds === null) return;

  // An opening (shrink, then grow back) erases anything thinner than twice the radius
  const radius = Math.max(1, Math.round(bounds.width * THIN_PART * 0.5));
  const opened = dilate(erode(solid, width, height, radius), width, height, radius);
  const body = largestComponent(opened, width);
  // Grow the body back a little over its own outline, so collar points keep their detail;
  // more would regrow the base of the hook
  const near = dilate(body, width, height, Math.ceil(radius / 2));
  const kept = new Uint8Array(solid.length);
  for (let i = 0; i < kept.length; i += 1) kept[i] = solid[i] && near[i] ? 1 : 0;

  // One pixel in from the key's edge sits clear of the background colour blended into it
  const inner = erode(kept, width, height, 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          sum += inner[ny * width + nx] ?? 0;
        }
      }
      const index = (y * width + x) * 4 + 3;
      data[index] = Math.min(data[index] ?? 0, Math.round((sum / 9) * 255));
    }
  }
}

function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return morph(mask, width, height, radius, 0);
}

function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return morph(mask, width, height, radius, 1);
}

/** Square erosion (`hit` 0) or dilation (`hit` 1), as two separable running passes. */
function morph(mask: Uint8Array, width: number, height: number, radius: number, hit: 0 | 1): Uint8Array {
  const pass = (source: Uint8Array, along: number, across: number, step: number, stride: number): Uint8Array => {
    const out = new Uint8Array(source.length);
    for (let a = 0; a < across; a += 1) {
      const base = a * stride;
      // Distance to the nearest `hit` pixel on each side, so every pixel is decided in O(1)
      const before = new Float64Array(along);
      let last = -Infinity;
      for (let i = 0; i < along; i += 1) {
        if (source[base + i * step] === hit) last = i;
        before[i] = i - last;
      }
      last = Infinity;
      for (let i = along - 1; i >= 0; i -= 1) {
        if (source[base + i * step] === hit) last = i;
        const nearest = Math.min(before[i] ?? Infinity, last - i);
        out[base + i * step] = nearest <= radius ? hit : 1 - hit;
      }
    }
    return out;
  };
  const rows = pass(mask, width, height, 1, width);
  return pass(rows, height, width, width, 1);
}

function largestComponent(mask: Uint8Array, width: number): Uint8Array {
  const label = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start]) continue;
    next += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = next;
    while (head < tail) {
      const pixel = queue[head++] ?? 0;
      const x = pixel % width;
      for (const n of [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, pixel - width, pixel + width]) {
        if (n < 0 || n >= mask.length || !mask[n] || label[n]) continue;
        label[n] = next;
        queue[tail++] = n;
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      best = next;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i += 1) out[i] = label[i] === best && best > 0 ? 1 : 0;
  return out;
}

function maskBounds(mask: Uint8Array, width: number, height: number): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function opaqueShare(image: ImageData): number {
  let opaque = 0;
  for (let i = 3; i < image.data.length; i += 4) if ((image.data[i] ?? 0) >= OPAQUE_ALPHA) opaque += 1;
  return opaque / Math.max(1, image.width * image.height);
}

// -----------------------------------------------------------------
// Keying out a plain background
// -----------------------------------------------------------------

function hasTransparency(image: ImageData): boolean {
  const { data } = image;
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < OPAQUE_ALPHA) clear += 1;
  return clear > image.width * image.height * 0.02;
}

/** Make background pixels connected to the border transparent, in place. */
function keyOutBackground(image: ImageData): void {
  const { width, height, data } = image;
  const border = borderPixels(width, height);
  const reference = averageColor(data, border);
  if (reference.spread > MAX_BORDER_SPREAD) return;

  // Decisions read a softened copy, so JPEG noise neither stops the fill nor lets it through
  const soft = boxBlur(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const pixel of border) {
    if (isBackground(soft, pixel, reference)) {
      visited[pixel] = 1;
      queue[tail++] = pixel;
    }
  }
  while (head < tail) {
    const pixel = queue[head++] ?? 0;
    data[pixel * 4 + 3] = 0;
    const x = pixel % width;
    const neighbours = [
      x > 0 ? pixel - 1 : -1,
      x < width - 1 ? pixel + 1 : -1,
      pixel - width,
      pixel + width,
    ];
    for (const next of neighbours) {
      if (next < 0 || next >= width * height || visited[next]) continue;
      // A step in colour is the garment's outline, even when the garment is as pale as the wall
      if (!isBackground(soft, next, reference) || step(soft, pixel, next) > KEY_STEP) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }
}

function step(data: Uint8ClampedArray, a: number, b: number): number {
  const dr = (data[a * 4] ?? 0) - (data[b * 4] ?? 0);
  const dg = (data[a * 4 + 1] ?? 0) - (data[b * 4 + 1] ?? 0);
  const db = (data[a * 4 + 2] ?? 0) - (data[b * 4 + 2] ?? 0);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** A 3 by 3 box blur of the colour channels. */
function boxBlur(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const ny = Math.min(height - 1, Math.max(0, y + dy));
            const nx = Math.min(width - 1, Math.max(0, x + dx));
            sum += data[(ny * width + nx) * 4 + c] ?? 0;
          }
        }
        out[(y * width + x) * 4 + c] = sum / 9;
      }
    }
  }
  return out;
}

function borderPixels(width: number, height: number): number[] {
  const pixels: number[] = [];
  for (let x = 0; x < width; x += 1) pixels.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y += 1) pixels.push(y * width, y * width + width - 1);
  return pixels;
}

interface Reference {
  r: number;
  g: number;
  b: number;
  spread: number;
}

function averageColor(data: Uint8ClampedArray, pixels: readonly number[]): Reference {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of pixels) {
    r += data[p * 4] ?? 0;
    g += data[p * 4 + 1] ?? 0;
    b += data[p * 4 + 2] ?? 0;
  }
  const n = Math.max(1, pixels.length);
  const mean = { r: r / n, g: g / n, b: b / n };
  let spread = 0;
  for (const p of pixels) spread += distance(data, p, mean);
  return { ...mean, spread: spread / n };
}

function distance(data: Uint8ClampedArray, pixel: number, color: { r: number; g: number; b: number }): number {
  const dr = (data[pixel * 4] ?? 0) - color.r;
  const dg = (data[pixel * 4 + 1] ?? 0) - color.g;
  const db = (data[pixel * 4 + 2] ?? 0) - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBackground(data: Uint8ClampedArray, pixel: number, reference: Reference): boolean {
  return distance(data, pixel, reference) <= KEY_TOLERANCE;
}

/** The bounding box of every opaque pixel, or `null` when none is opaque. */
function opaqueBounds(image: ImageData): Rect | null {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < OPAQUE_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
