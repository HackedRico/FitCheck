const MAX_SIDE = 512;
const KEY_TOLERANCE = 46;
const MAX_BORDER_SPREAD = 38;
const OPAQUE_ALPHA = 24;

export async function prepareCutout(png: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(png);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const source = makeCanvas(width, height);
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot draw the cutout.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const original = context.getImageData(0, 0, width, height);
  if (hasTransparency(original)) return cropTo(source, opaqueBounds(original));

  const keyed = new ImageData(new Uint8ClampedArray(original.data), width, height);
  keyOutBackground(keyed);
  const bounds = opaqueBounds(keyed);
  if (bounds === null) return source;
  context.putImageData(keyed, 0, 0);
  return cropTo(source, bounds);
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function hasTransparency(image: ImageData): boolean {
  const { data } = image;
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < OPAQUE_ALPHA) clear += 1;
  return clear > image.width * image.height * 0.02;
}

function keyOutBackground(image: ImageData): void {
  const { width, height, data } = image;
  const border = borderPixels(width, height);
  const reference = averageColor(data, border);
  if (reference.spread > MAX_BORDER_SPREAD) return;

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const pixel of border) {
    if (isBackground(data, pixel, reference)) {
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
      visited[next] = 1;
      if (isBackground(data, next, reference)) queue[tail++] = next;
    }
  }
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

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function opaqueBounds(image: ImageData): Bounds | null {
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

function cropTo(source: HTMLCanvasElement, bounds: Bounds | null): HTMLCanvasElement {
  if (bounds === null) return source;
  const cropped = makeCanvas(bounds.width, bounds.height);
  cropped.getContext("2d")?.drawImage(source, -bounds.x, -bounds.y);
  return cropped;
}
