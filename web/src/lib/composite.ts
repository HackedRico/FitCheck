import type { TryOnRegion } from "../api/client";
import { encodeCanvas, makeCanvas } from "./canvas";
import { jointPair, placeGarment, type JointPair, type Placement } from "./fit";
import { extractGarment } from "./garmentSprite";
import { loadImagePoseLandmarker } from "./pose";

// =============================================================================
// Module Overview
// =============================================================================
// A quick try-on made entirely on the device, for when no AI render is available:
// the garment's clothes are cut out, and its wearer's shoulders (or hips) are
// mapped onto the person's, the same way the live preview works. `drawOnJoints`
// is the shared mapping, `drawPlaced` the fallback for a garment with no joints;
// `compositeOnPerson` builds a whole still.

/** Draw `garment` so its wearer's joints land on the person's: one scale, one turn, one shift. */
export function drawOnJoints(
  context: CanvasRenderingContext2D,
  garment: HTMLCanvasElement,
  from: JointPair,
  to: JointPair,
): void {
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

/** Draw `garment` at `placement`, its top centre pinned and turned about that point. */
export function drawPlaced(context: CanvasRenderingContext2D, garment: HTMLCanvasElement, placement: Placement): void {
  context.save();
  context.translate(placement.topX, placement.topY);
  context.rotate(placement.angle);
  context.drawImage(garment, -placement.width / 2, 0, placement.width, placement.height);
  context.restore();
}

/** Put `garment` on the person in `person` as a PNG, or `null` if no body is visible. */
export async function compositeOnPerson(person: Blob, garment: Blob, region: TryOnRegion): Promise<Blob | null> {
  const [bitmap, sprite, landmarker] = await Promise.all([
    createImageBitmap(person),
    extractGarment(garment, region),
    loadImagePoseLandmarker(),
  ]);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pose = landmarker.detect(canvas).landmarks[0];
  if (!pose) return null;
  const frame = { width: canvas.width, height: canvas.height };
  const joints = sprite.anchors ? jointPair(pose, region, frame) : null;
  if (sprite.anchors && joints) {
    drawOnJoints(context, sprite.canvas, sprite.anchors, joints);
  } else {
    const placement = placeGarment(pose, region, frame, sprite.canvas.width / sprite.canvas.height);
    if (!placement) return null;
    drawPlaced(context, sprite.canvas, placement);
  }
  return encodeCanvas(canvas, "image/png");
}
