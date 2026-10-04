import type { TryOnRegion, Point } from "./types";
import { placeGarment } from "./fit";
import { extractGarment } from "./garmentSprite";
import { loadImagePoseLandmarker } from "./pose";

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const MIN_VISIBILITY = 0.5;

export interface JointPair {
  left: Point;
  right: Point;
}

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

export async function compositeOnPerson(person: Blob, garment: Blob, region: TryOnRegion): Promise<Blob | null> {
  const [bitmap, sprite, landmarker] = await Promise.all([
    createImageBitmap(person),
    extractGarment(garment, region),
    loadImagePoseLandmarker(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pose = landmarker.detect(canvas).landmarks[0];
  if (!pose) return null;
  const frame = { width: canvas.width, height: canvas.height };
  const lower = region === "lower";
  const at = (index: number): Point | null => {
    const mark = pose[index];
    if (!mark || (mark.visibility ?? 1) < MIN_VISIBILITY) return null;
    return { x: mark.x * frame.width, y: mark.y * frame.height };
  };
  const left = at(lower ? LEFT_HIP : LEFT_SHOULDER);
  const right = at(lower ? RIGHT_HIP : RIGHT_SHOULDER);

  if (sprite.anchors && left && right) {
    drawOnJoints(context, sprite.canvas, sprite.anchors, { left, right });
  } else {
    const placement = placeGarment(pose, region, frame, sprite.canvas.width / sprite.canvas.height);
    if (!placement) return null;
    context.save();
    context.translate(placement.topX, placement.topY);
    context.rotate(placement.angle);
    context.drawImage(sprite.canvas, -placement.width / 2, 0, placement.width, placement.height);
    context.restore();
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
