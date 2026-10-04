import type { TryOnRegion } from "./types";

export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

import type { Point } from "./types";

export interface Placement {
  topX: number;
  topY: number;
  angle: number;
  width: number;
  height: number;
}

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

const MIN_VISIBILITY = 0.5;

interface RegionShape {
  above: number;
  below: number;
  widthOverJoints: number;
}

const SHAPES: Record<TryOnRegion, RegionShape> = {
  upper: { above: 0.16, below: 0.14, widthOverJoints: 1.75 },
  lower: { above: 0.06, below: 0.04, widthOverJoints: 2.3 },
  full: { above: 0.1, below: 0.12, widthOverJoints: 1.7 },
};

export function placeGarment(
  landmarks: readonly Landmark[],
  region: TryOnRegion,
  frame: { width: number; height: number },
  aspect: number,
): Placement | null {
  const px = (index: number): Point | null => {
    const mark = landmarks[index];
    if (!mark || (mark.visibility ?? 1) < MIN_VISIBILITY) return null;
    return { x: mark.x * frame.width, y: mark.y * frame.height };
  };

  const anchors = region === "lower" ? lowerAnchors(px) : upperAnchors(px, region);
  if (anchors === null) return null;

  const shape = SHAPES[region];
  const axis = sub(anchors.bottom, anchors.top);
  const span = length(axis);
  if (span < 1) return null;
  const down = scale(axis, 1 / span);

  const targetHeight = span * (1 + shape.above + shape.below);
  const targetWidth = anchors.jointWidth * shape.widthOverJoints;
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

  const hipsOrGuess = hips ?? along(top, perpendicularDown(left, right), jointWidth * 1.5);
  if (region !== "full") return { top, bottom: hipsOrGuess, jointWidth };

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
  const bottom = ankles ?? (knees ? extend(top, knees, 2) : null);
  if (bottom === null) return null;
  return { top, bottom, jointWidth: distance(left, right) };
}

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

function extend(from: Point, to: Point, factor: number): Point {
  return along(from, sub(to, from), factor);
}

function perpendicularDown(left: Point, right: Point): Point {
  const line = sub(left, right);
  const span = length(line) || 1;
  const normal = { x: -line.y / span, y: line.x / span };
  return normal.y >= 0 ? normal : scale(normal, -1);
}
