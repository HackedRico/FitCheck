// =============================================================================
// Module Overview
// =============================================================================
// Canvas plumbing shared by the on-device image steps (cutouts, garment
// sprites, person framing, composites): make a canvas, decode a photo onto one
// at a working size, copy out a rectangle, and encode one back to a blob.

/** A rectangle in canvas pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A blank canvas of the given size. */
export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Decode `image` onto a canvas no longer than `maxSide` on either side, ready for pixel reads. */
export async function decodeScaled(image: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** A new canvas holding `rect` of `source`. */
export function cropCanvas(source: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const canvas = makeCanvas(rect.width, rect.height);
  canvas.getContext("2d")?.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas;
}

/** Encode `canvas` as `type`, or `null` when the browser cannot. */
export function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
