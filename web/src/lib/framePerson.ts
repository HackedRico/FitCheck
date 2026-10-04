import { loadImagePoseLandmarker } from "./pose";

// =============================================================================
// Module Overview
// =============================================================================
// Readies a person photo for diffusion try-on. Those models expect one person
// filling a 3:4 portrait; a wide webcam shot of a room with a small figure in it
// makes them erase the person instead of dressing them. `framePerson` finds the
// largest person with Pose Landmarker on the device and crops a 3:4 portrait
// around them. The photo never leaves the device for this step.

// Try-on models work in portrait 3:4 (Leffa renders 768x1024)
const PORTRAIT = 3 / 4;
// Landmarks below this are guesses about joints outside the frame
const MIN_VISIBILITY = 0.3;
// Landmarks stop at the eyes and the ankles; leave room for hair, hats and shoes
const HEAD_ROOM = 0.14;
const FOOT_ROOM = 0.05;
const SIDE_ROOM = 0.3;
// A person shorter than this share of the photo is too small for a good render
const MIN_FILL = 0.45;

/** A person photo cropped for try-on, and how well the person showed in the original. */
export interface FramedPerson {
  image: Blob;
  found: boolean;
  // The person's height as a share of the original photo's height, 0 when not found
  fill: number;
  // How many people the photo shows; more than one risks dressing the wrong person
  people: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Crop `photo` to a 3:4 portrait around its largest person; unchanged if no one is found. */
export async function framePerson(photo: Blob): Promise<FramedPerson> {
  const bitmap = await createImageBitmap(photo);
  const width = bitmap.width;
  const height = bitmap.height;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  source.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();

  const landmarker = await loadImagePoseLandmarker();
  const boxes: Box[] = [];
  let people = 0;
  // The detector shrinks its input to a small square, so a small figure in a wide shot
  // vanishes; overlapping square windows across the frame give it room to be seen
  for (const window of searchWindows(width, height)) {
    const view = window.whole ? source : cropCanvas(source, window);
    const poses = landmarker.detect(view).landmarks;
    people = Math.max(people, poses.length);
    for (const pose of poses) {
      const marks = pose.filter((mark) => (mark.visibility ?? 1) >= MIN_VISIBILITY);
      if (marks.length < 6) continue;
      boxes.push({
        left: window.left + Math.min(...marks.map((m) => m.x)) * view.width,
        right: window.left + Math.max(...marks.map((m) => m.x)) * view.width,
        top: window.top + Math.min(...marks.map((m) => m.y)) * view.height,
        bottom: window.top + Math.max(...marks.map((m) => m.y)) * view.height,
      });
    }
    if (boxes.length > 0 && window.whole) break;
  }
  if (boxes.length === 0) return { image: photo, found: false, fill: 0, people: 0 };

  // The owner is the biggest figure; bystanders in a shared room are smaller or partial
  const person = boxes.reduce((best, box) => (area(box) > area(best) ? box : best));
  const fill = Math.min(1, (person.bottom - person.top) / height);
  const crop = portraitAround(person, width, height);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.right - crop.left);
  canvas.height = Math.round(crop.bottom - crop.top);
  canvas.getContext("2d")?.drawImage(source, crop.left, crop.top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  return { image: image ?? photo, found: true, fill, people };
}

interface SearchWindow {
  left: number;
  top: number;
  size: number;
  width: number;
  height: number;
  whole: boolean;
}

/** The whole photo first, then overlapping squares across a wide or tall photo. */
function searchWindows(width: number, height: number): SearchWindow[] {
  const windows: SearchWindow[] = [{ left: 0, top: 0, size: Math.max(width, height), width, height, whole: true }];
  const side = Math.min(width, height);
  const span = Math.max(width, height) - side;
  if (span < side * 0.2) return windows;
  // Half-window steps, so anyone straddling a seam is whole in some window
  const steps = Math.ceil(span / (side / 2));
  for (let i = 0; i <= steps; i += 1) {
    const offset = Math.round((span * i) / steps);
    windows.push(
      width >= height
        ? { left: offset, top: 0, size: side, width: side, height: side, whole: false }
        : { left: 0, top: offset, size: side, width: side, height: side, whole: false },
    );
  }
  return windows;
}

function cropCanvas(source: HTMLCanvasElement, window: SearchWindow): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = window.width;
  canvas.height = window.height;
  canvas.getContext("2d")?.drawImage(source, window.left, window.top, window.width, window.height, 0, 0, window.width, window.height);
  return canvas;
}

/** Whether a framed photo is good enough to promise a convincing render. */
export function isWellFramed(framed: FramedPerson): boolean {
  return framed.found && framed.fill >= MIN_FILL && framed.people <= 1;
}

/** A 3:4 box around `person` with room for head and feet, kept inside the photo. */
function portraitAround(person: Box, width: number, height: number): Box {
  const tall = person.bottom - person.top;
  const top = person.top - tall * HEAD_ROOM;
  const bottom = person.bottom + tall * FOOT_ROOM;
  let boxHeight = bottom - top;
  let boxWidth = Math.max((person.right - person.left) * (1 + SIDE_ROOM), boxHeight * PORTRAIT);
  boxHeight = boxWidth / PORTRAIT;
  // A crop larger than the photo shrinks to fit, keeping 3:4
  const scale = Math.min(1, width / boxWidth, height / boxHeight);
  boxWidth *= scale;
  boxHeight *= scale;
  const centreX = (person.left + person.right) / 2;
  const centreY = (top + bottom) / 2;
  const left = clamp(centreX - boxWidth / 2, 0, width - boxWidth);
  const boxTop = clamp(centreY - boxHeight / 2, 0, height - boxHeight);
  return { left, top: boxTop, right: left + boxWidth, bottom: boxTop + boxHeight };
}

function area(box: Box): number {
  return (box.right - box.left) * (box.bottom - box.top);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
