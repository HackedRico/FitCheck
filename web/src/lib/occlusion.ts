import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

import { landmarkPoint, LEFT_SHOULDER, RIGHT_SHOULDER, type Landmark, type Point } from "./fit";
import { SEGMENTER_URL } from "./garmentSprite";
import { once } from "./once";

// =============================================================================
// Module Overview
// =============================================================================
// Puts the owner back in front of the garment in the live preview. A pasted
// garment covers the chin, the neck and any hand in front of the body, which is
// what makes it read as a sticker. Each frame, MediaPipe's multiclass selfie
// segmenter (Apache-2.0) marks hair and skin; `draw` copies those pixels from the
// camera over the garments. Skin counts only at the neck and the hands, so bare
// shoulders and arms still go under a garment that covers them.

// selfie_multiclass_256x256 categories
const HAIR = 1;
const BODY_SKIN = 2;
const FACE_SKIN = 3;

// MediaPipe Pose landmark indices for the wrists and fingertips
const HANDS = [15, 16, 17, 18, 19, 20, 21, 22];
// A hand reaches this share of the shoulder span from its wrist and fingertip landmarks
const HAND_REACH = 0.3;

/** Hair and skin from the camera, drawn back over the garments. */
export interface Occluder {
  /** Find the owner's hair, face, neck and hands in this video frame. */
  update: (video: HTMLVideoElement, timestamp: number, pose: readonly Landmark[] | undefined) => void;
  /** Copy those pixels from `video` over whatever `context` holds. */
  draw: (context: CanvasRenderingContext2D, video: HTMLVideoElement) => void;
  close: () => void;
}

/** Load the segmenter and return an occluder for the live preview. */
export async function createOccluder(): Promise<Occluder> {
  const segmenter = await loadSegmenter();
  const mask = document.createElement("canvas");
  const maskContext = mask.getContext("2d");
  const layer = document.createElement("canvas");
  const layerContext = layer.getContext("2d");
  if (!maskContext || !layerContext) throw new Error("This browser cannot draw the occlusion mask.");
  let pixels: ImageData | null = null;
  let ready = false;

  return {
    update(video, timestamp, pose) {
      const result = segmenter.segmentForVideo(video, timestamp);
      const categories = result.categoryMask;
      if (!categories) {
        result.close();
        return;
      }
      const { width, height } = categories;
      const values = categories.getAsUint8Array();
      if (pixels === null || pixels.width !== width || pixels.height !== height) {
        mask.width = width;
        mask.height = height;
        pixels = maskContext.createImageData(width, height);
      }
      const inFront = frontTest(pose, width, height);
      const data = pixels.data;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = y * width + x;
          data[i * 4 + 3] = inFront(values[i] ?? 0, x, y) ? 255 : 0;
        }
      }
      result.close();
      maskContext.putImageData(pixels, 0, 0);
      ready = true;
    },
    draw(context, video) {
      if (!ready) return;
      const { width, height } = context.canvas;
      if (layer.width !== width) layer.width = width;
      if (layer.height !== height) layer.height = height;
      layerContext.globalCompositeOperation = "copy";
      layerContext.drawImage(video, 0, 0, width, height);
      // The mask is 256 px across; smoothing it up to the frame feathers the outline
      layerContext.globalCompositeOperation = "destination-in";
      layerContext.imageSmoothingEnabled = true;
      layerContext.imageSmoothingQuality = "high";
      layerContext.drawImage(mask, 0, 0, width, height);
      context.drawImage(layer, 0, 0);
    },
    close() {
      ready = false;
    },
  };
}

/** Which mask pixels go in front: hair and face always, skin only at the neck and hands. */
function frontTest(
  pose: readonly Landmark[] | undefined,
  width: number,
  height: number,
): (category: number, x: number, y: number) => boolean {
  const frame = { width, height };
  const left = landmarkPoint(pose, LEFT_SHOULDER, frame);
  const right = landmarkPoint(pose, RIGHT_SHOULDER, frame);
  const shoulderY = left && right ? (left.y + right.y) / 2 : -1;
  const reach = left && right ? Math.hypot(left.x - right.x, left.y - right.y) * HAND_REACH : 0;
  const hands = HANDS.map((index) => landmarkPoint(pose, index, frame)).filter((hand): hand is Point => hand !== null);

  return (category, x, y) => {
    if (category === HAIR || category === FACE_SKIN) return true;
    if (category !== BODY_SKIN) return false;
    if (y < shoulderY) return true;
    return hands.some((hand) => Math.hypot(hand.x - x, hand.y - y) <= reach);
  };
}

const loadSegmenter = once(async (): Promise<ImageSegmenter> => {
  const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const create = (delegate: "GPU" | "CPU"): Promise<ImageSegmenter> =>
    ImageSegmenter.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      {
        baseOptions: { modelAssetPath: SEGMENTER_URL, delegate },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      },
    );
  return create("GPU").catch((error: unknown) => {
    console.warn("[occlusion] GPU delegate unavailable; segmenting on the CPU.", error);
    return create("CPU");
  });
});
