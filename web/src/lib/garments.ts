import type { Category, ColorFamily, Decision, GarmentTags, RunsOn, TryOnRegion } from "../api/client";

// =============================================================================
// Module Overview
// =============================================================================
// Display facts about garments and verdicts that the UI needs but the engine
// does not send: the try-on `regionFor` a category (mirrors `fitcheck.domain`),
// colour swatches per colour family, dress-code words, and verdict wording.

// The categories a try-on renderer can repaint; shoes and accessories cannot be rendered
const REGION_BY_CATEGORY: Partial<Record<Category, TryOnRegion>> = {
  top: "upper",
  sweater: "upper",
  shirt: "upper",
  outerwear: "upper",
  dress: "full",
  bottom: "lower",
};

/** Return the try-on region for `category`, or `null` when a render cannot show it. */
export function regionFor(category: Category): TryOnRegion | null {
  return REGION_BY_CATEGORY[category] ?? null;
}

const SWATCH: Record<ColorFamily, string> = {
  black: "#141413",
  white: "#f7f5ef",
  grey: "#8d8b85",
  navy: "#1d2747",
  blue: "#2f6fd6",
  green: "#2f7d52",
  yellow: "#f1c232",
  red: "#c9302a",
  pink: "#ef9bbb",
  brown: "#76492b",
  beige: "#d8c6a5",
  multi: "conic-gradient(#c9302a 0 25%, #f1c232 0 50%, #2f7d52 0 75%, #2f6fd6 0)",
};

/** CSS background for a colour family's swatch. */
export function swatchFor(color: ColorFamily): string {
  return SWATCH[color];
}

// The engine scores formality 1 = gym to 5 = black tie; these are the words in between
const DRESS_CODE = ["gym", "casual", "smart casual", "formal", "black tie"] as const;

/** Dress-code words for a 1 to 5 formality score. */
export function dressCode(formality: number): string {
  const index = Math.min(Math.max(Math.round(formality), 1), 5) - 1;
  return DRESS_CODE[index] ?? "casual";
}

/** "1 garment", "3 garments". */
export function garmentCount(count: number): string {
  return `${count} ${count === 1 ? "garment" : "garments"}`;
}

/** A short noun phrase for a garment, such as "navy sweater". */
export function garmentName(tags: GarmentTags): string {
  return `${tags.color_family} ${tags.category}`;
}

interface DecisionWording {
  // The short label on the camera's last-verdict thumbnail
  word: string;
  // The sentence-case answer the result page leads with
  hero: string;
}

const DECISION_WORDING: Record<Decision, DecisionWording> = {
  buy: { word: "BUY", hero: "Buy it." },
  skip: { word: "SKIP", hero: "Skip it." },
  try_with: { word: "TRY-WITH", hero: "Try it first." },
};

/** The thumbnail label and the result page's lead sentence for a decision. */
export function decisionWording(decision: Decision): DecisionWording {
  return DECISION_WORDING[decision];
}

const RUNS_ON_LABEL: Record<RunsOn, string> = {
  this_machine: "this machine",
  self_hosted_gpu: "our GPU",
  snowflake: "Snowflake",
  public_api: "public API",
};

/** Plain words for where an adapter runs. */
export function runsOnLabel(runsOn: RunsOn): string {
  return RUNS_ON_LABEL[runsOn];
}
