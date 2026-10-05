import type { TryOnRegion } from "../api/client";

// =============================================================================
// Module Overview
// =============================================================================
// Pure geometry for the live preview (ADR 0004). `placeGarment` turns MediaPipe
// Pose landmarks into a `Placement`: where the cutout's top centre sits, how it
// is rotated and how big it is, so the garment follows shoulders and hips (upper),
// hips and ankles (lower), or shoulders and knees (a dress). `jointPair` reads
// the shoulders (or hips) a worn garment is pinned by, for the live preview and
// for stills alike. `smoothPlacement` and `smoothJoints` damp landmark jitter
// between frames.

/** A pose landmark in frame-normalised coordinates, as MediaPipe reports it. */
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

/** A point in pixels of the frame or image it belongs to. */
export interface Point {
  x: number;
  y: number;
}

/** A wearer's left and right joint: shoulders, or hips for a lower garment. */
export interface JointPair {
  left: Point;
  right: Point;
}

/** Where to draw the cutout, in frame pixels; `angle` rotates about the top centre. */
export interface Placement {
  topX: number;
  topY: number;
  angle: number;
  width: number;
  height: number;
}

// MediaPipe Pose landmark indices
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
export const LEFT_ANKLE = 27;
export const RIGHT_ANKLE = 28;

// Landmarks below this are guesses about joints the model cannot see
const MIN_VISIBILITY = 0.5;

type Frame = { width: number; height: number };

/** Landmark `index` in `frame` pixels, or `null` when the pose lacks it or barely sees it. */
export function landmarkPoint(landmarks: readonly Landmark[] | undefined, index: number, frame: Frame): Point | null {
  const mark = landmarks?.[index];
  if (!mark || (mark.visibility ?? 1) < MIN_VISIBILITY) return null;
  return { x: mark.x * frame.width, y: mark.y * frame.height };
}

/** The shoulders, or the hips for a lower garment, in `frame` pixels; `null` when either is out of view. */
export function jointPair(landmarks: readonly Landmark[], region: TryOnRegion, frame: Frame): JointPair | null {
  const lower = region === "lower";
  const left = landmarkPoint(landmarks, lower ? LEFT_HIP : LEFT_SHOULDER, frame);
  const right = landmarkPoint(landmarks, lower ? RIGHT_HIP : RIGHT_SHOULDER, frame);
  return left && right ? { left, right } : null;
}

interface RegionShape {
  // Fraction of the anchor span the garment reaches above the top anchor and below the bottom one
  above: number;
  below: number;
  // Garment width as a multiple of the joint-to-joint width at the top anchor
  widthOverJoints: number;
}

// Joint landmarks sit inside the body outline, so garments reach past them: collars rise
// above the shoulder joints, sleeves spread past them, and waistbands sit above the hip joints
const SHAPES: Record<TryOnRegion, RegionShape> = {
  upper: { above: 0.16, below: 0.14, widthOverJoints: 1.75 },
  lower: { above: 0.06, below: 0.04, widthOverJoints: 2.3 },
  full: { above: 0.1, below: 0.12, widthOverJoints: 1.7 },
};

/** Place a cutout of `aspect` (width / height) on the body, or `null` if the pose is not in view. */
export function placeGarment(
  landmarks: readonly Landmark[],
  region: TryOnRegion,
  frame: Frame,
  aspect: number,
): Placement | null {
  const px = (index: number): Point | null => landmarkPoint(landmarks, index, frame);

  const anchors = region === "lower" ? lowerAnchors(px) : upperAnchors(px, region);
  if (anchors === null) return null;

  const shape = SHAPES[region];
  const axis = sub(anchors.bottom, anchors.top);
  const span = length(axis);
  if (span < 1) return null;
  const down = scale(axis, 1 / span);

  const targetHeight = span * (1 + shape.above + shape.below);
  const targetWidth = anchors.jointWidth * shape.widthOverJoints;
  // One uniform scale that splits the difference between the height fit and the width fit,
  // so the cutout never stretches out of its own proportions
  const height = Math.sqrt((targetHeight * targetWidth) / aspect);
  const width = height * aspect;
  const top = sub(anchors.top, scale(down, span * shape.above));

  return { topX: top.x, topY: top.y, angle: Math.atan2(-down.x, down.y), width, height };
}

interface Anchors {
  top: Point;
  bottom: Point;
  jointWidth: number;
}

function upperAnchors(px: (index: number) => Point | null, region: TryOnRegion): Anchors | null {
  const left = px(LEFT_SHOULDER);
  const right = px(RIGHT_SHOULDER);
  if (!left || !right) return null;
  const top = midpoint(left, right);
  const jointWidth = distance(left, right);
  const hips = pair(px(LEFT_HIP), px(RIGHT_HIP));

  // Phone selfies often crop the hips; a torso is about 1.5 shoulder widths long
  const hipsOrGuess = hips ?? along(top, perpendicularDown(left, right), jointWidth * 1.5);
  if (region !== "full") return { top, bottom: hipsOrGuess, jointWidth };

  // A dress ends near the knees, and shoulder to knee is about twice shoulder to hip
  const knees = pair(px(LEFT_KNEE), px(RIGHT_KNEE));
  return { top, bottom: knees ?? extend(top, hipsOrGuess, 2), jointWidth };
}

function lowerAnchors(px: (index: number) => Point | null): Anchors | null {
  const left = px(LEFT_HIP);
  const right = px(RIGHT_HIP);
  if (!left || !right) return null;
  const top = midpoint(left, right);
  const ankles = pair(px(LEFT_ANKLE), px(RIGHT_ANKLE));
  const knees = pair(px(LEFT_KNEE), px(RIGHT_KNEE));
  // Knee to ankle is about as long as hip to knee, so a cropped frame still gets full-length legs
  const bottom = ankles ?? (knees ? extend(top, knees, 2) : null);
  if (bottom === null) return null;
  return { top, bottom, jointWidth: distance(left, right) };
}

/** Move each field of `previous` toward `next` by `alpha`; `null` resets the track. */
export function smoothPlacement(previous: Placement | null, next: Placement, alpha: number): Placement {
  if (previous === null) return next;
  const mix = (a: number, b: number): number => a + (b - a) * alpha;
  return {
    topX: mix(previous.topX, next.topX),
    topY: mix(previous.topY, next.topY),
    angle: mix(previous.angle, next.angle),
    width: mix(previous.width, next.width),
    height: mix(previous.height, next.height),
  };
}

/** Move each joint of `previous` toward `next` by `alpha`; `null` resets the track. */
export function smoothJoints(previous: JointPair | null, next: JointPair, alpha: number): JointPair {
  if (previous === null) return next;
  const mix = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha });
  return { left: mix(previous.left, next.left), right: mix(previous.right, next.right) };
}

// -----------------------------------------------------------------
// Vector helpers
// -----------------------------------------------------------------

function pair(a: Point | null, b: Point | null): Point | null {
  return a && b ? midpoint(a, b) : null;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}

function length(a: Point): number {
  return Math.hypot(a.x, a.y);
}

function distance(a: Point, b: Point): number {
  return length(sub(a, b));
}

function along(from: Point, direction: Point, amount: number): Point {
  return { x: from.x + direction.x * amount, y: from.y + direction.y * amount };
}

/** Extend the segment `from` to `to` so its length becomes `factor` times the original. */
function extend(from: Point, to: Point, factor: number): Point {
  return along(from, sub(to, from), factor);
}

/** Unit vector at right angles to the shoulder line, pointing down the frame. */
function perpendicularDown(left: Point, right: Point): Point {
  const line = sub(left, right);
  const span = length(line) || 1;
  const normal = { x: -line.y / span, y: line.x / span };
  return normal.y >= 0 ? normal : scale(normal, -1);
}
