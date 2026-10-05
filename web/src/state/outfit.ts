import { useCallback, useState } from "react";

import {
  api,
  garmentImageUrl,
  pngFromBase64,
  type Garment,
  type PipelineStep,
  type TryOnRegion,
} from "../api/client";
import { encodeCanvas } from "../lib/canvas";
import { framedForRender } from "../lib/framePerson";
import { extractGarment, extractWornGarment, type GarmentSprite } from "../lib/garmentSprite";
import { garmentName, regionFor } from "../lib/garments";
import { once } from "../lib/once";
import type { Candidate } from "./candidate";
import type { PipelineKind } from "./pipelines";

// =============================================================================
// Module Overview
// =============================================================================
// The outfit the live preview draws: at most one garment per body region, so a
// top and a bottom together, or one dress. A `Wearable` is any garment that can
// go on: the candidate, a closet garment, or one brought in by shop link or
// photo, where the photo's second worn piece comes along too. `renderOutfit`
// paints the whole outfit with one render pass per garment, bottoms first.

type RecordPipeline = (kind: PipelineKind, steps: readonly PipelineStep[]) => void;

export type WearableSource = "candidate" | "closet" | "added";

/** A garment that can go on the owner in the live preview. */
export interface Wearable {
  key: string;
  label: string;
  region: TryOnRegion;
  source: WearableSource;
  // A closet garment's stored image URL, or the garment image itself
  thumb: string | Blob;
  // The garment image sent to the renderer
  image: () => Promise<Blob>;
  sprite: () => Promise<GarmentSprite>;
}

export interface OutfitState {
  worn: readonly Wearable[];
  // Garments brought in by link or photo during this visit
  added: readonly Wearable[];
  wear: (item: Wearable) => void;
  toggle: (item: Wearable) => void;
  add: (items: readonly Wearable[]) => void;
}

// Bottoms go on first so a top hangs over the waistband
const LAYER: Readonly<{ [R in TryOnRegion]: number }> = { lower: 0, full: 1, upper: 2 };

/** The garments worn, in the order they are drawn and rendered. */
export function byLayer(worn: readonly Wearable[]): Wearable[] {
  return [...worn].sort((a, b) => LAYER[a.region] - LAYER[b.region]);
}

/** Hold the outfit for the live preview across screens. */
export function useOutfit(): OutfitState {
  const [worn, setWorn] = useState<readonly Wearable[]>([]);
  const [added, setAdded] = useState<readonly Wearable[]>([]);

  const wear = useCallback((item: Wearable) => setWorn((current) => putOn(current, item)), []);

  const toggle = useCallback((item: Wearable) => {
    setWorn((current) =>
      current.some((other) => other.key === item.key)
        ? current.filter((other) => other.key !== item.key)
        : putOn(current, item),
    );
  }, []);

  const add = useCallback((items: readonly Wearable[]) => {
    if (items.length === 0) return;
    setAdded((current) => [...items, ...current.filter((old) => !items.some((item) => item.key === old.key))]);
    setWorn((current) => items.reduce(putOn, current));
  }, []);

  return { worn, added, wear, toggle, add };
}

/** `worn` with `item` on and whatever covered the same part of the body off. */
function putOn(worn: readonly Wearable[], item: Wearable): Wearable[] {
  const clashes = (other: Wearable): boolean =>
    other.region === item.region || other.region === "full" || item.region === "full";
  return [...worn.filter((other) => other.key !== item.key && !clashes(other)), item];
}

// =============================================================================
// Making wearables
// =============================================================================

const fromCandidate = new WeakMap<Candidate, Wearable>();
const fromCloset = new Map<string, Wearable>();

/** The candidate as a wearable, or `null` when the live preview cannot show its category. */
export function candidateWearable(candidate: Candidate): Wearable | null {
  const region = candidate.region;
  if (region === null) return null;
  let item = fromCandidate.get(candidate);
  if (!item) {
    item = {
      key: `candidate:${crypto.randomUUID()}`,
      label: garmentName(candidate.tags),
      region,
      source: "candidate",
      thumb: candidate.cutout,
      image: () => Promise.resolve(candidate.cutout),
      sprite: once(() => extractGarment(candidate.cutout, region)),
    };
    fromCandidate.set(candidate, item);
  }
  return item;
}

/** A closet garment as a wearable, or `null` when it has no photo or cannot be shown on a body. */
export function closetWearable(owner: string, garment: Garment): Wearable | null {
  const region = regionFor(garment.tags.category);
  if (region === null || !garment.image_ref) return null;
  const key = `closet:${owner}:${garment.id}`;
  let item = fromCloset.get(key);
  if (!item) {
    const url = garmentImageUrl(owner, garment.id);
    const image = once(async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`The closet photo of the ${garment.tags.category} did not load.`);
      return response.blob();
    });
    item = {
      key,
      label: garment.tags.description,
      region,
      source: "closet",
      thumb: url,
      image,
      sprite: once(async () => extractGarment(await image(), region)),
    };
    fromCloset.set(key, item);
  }
  return item;
}

/**
 * Tag a garment photo and return it as a wearable, plus the other piece its wearer has on.
 * A shop photo of a top usually shows the model in trousers too, so both come along.
 */
export async function wearablesFromPhoto(photo: Blob, record: RecordPipeline): Promise<Wearable[]> {
  const out = await api.scan(photo);
  record("scan", out.pipeline);
  const region = regionFor(out.tags.category);
  if (region === null) {
    throw new Error(`That looks like ${out.tags.category}. The live preview covers tops, bottoms and dresses.`);
  }
  const cutout = pngFromBase64(out.cutout_png_base64);
  const id = crypto.randomUUID();
  const main: Wearable = {
    key: `added:${id}`,
    label: garmentName(out.tags),
    region,
    source: "added",
    thumb: cutout,
    image: () => Promise.resolve(cutout),
    sprite: once(() => extractGarment(cutout, region)),
  };
  if (region === "full") return [main];

  const otherRegion: TryOnRegion = region === "upper" ? "lower" : "upper";
  const other = await extractWornGarment(photo, otherRegion);
  if (other === null) return [main];
  const otherImage = await encodeCanvas(other.canvas, "image/png");
  if (otherImage === null) throw new Error("This browser cannot export the garment.");
  return [
    main,
    {
      key: `added:${id}:${otherRegion}`,
      label: `${otherRegion === "upper" ? "top" : "bottom"} from the same photo`,
      region: otherRegion,
      source: "added",
      thumb: otherImage,
      image: () => Promise.resolve(otherImage),
      sprite: () => Promise.resolve(other),
    },
  ];
}

// =============================================================================
// Rendering the whole outfit
// =============================================================================

/**
 * Paint every worn garment onto `person`, one render pass each, bottoms first.
 * Returns `null` when the renderer is only standing in, so the caller keeps its on-device image.
 */
export async function renderOutfit(person: Blob, worn: readonly Wearable[], record: RecordPipeline): Promise<Blob | null> {
  const framed = await framedForRender(person);
  if (framed === null) throw new Error("No one is visible in that frame. Step back so your whole body shows.");
  let current = framed;
  for (const item of byLayer(worn)) {
    const out = await api.render(current, await item.image(), item.region);
    record("render", out.pipeline);
    if (out.fallback) return null;
    current = pngFromBase64(out.image_png_base64);
  }
  return current;
}
