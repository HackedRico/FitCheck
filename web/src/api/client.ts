import createClient from "openapi-fetch";

import type { components, paths } from "./schema";

// =============================================================================
// Module Overview
// =============================================================================
// The one place the web app talks to the engine. `api` wraps the generated
// `openapi-fetch` client with one function per route, turns every failure into an
// `ApiError` with a readable message, and sends images as multipart `Blob`s.
// Types come from `schema.d.ts`, generated from `web/openapi.json` by `npm run gen:api`.

type Schemas = components["schemas"];

export type GarmentTags = Schemas["GarmentTags"];
export type Garment = Schemas["Garment-Output"];
export type Verdict = Schemas["Verdict-Output"];
export type Decision = Schemas["Decision"];
export type Reason = Schemas["Reason"];
export type WeekContext = Schemas["WeekContext"];
export type DayForecast = Schemas["DayForecast"];
export type CalendarEvent = Schemas["CalendarEvent"];
export type Location = Schemas["Location"];
export type PipelineStep = Schemas["PipelineStep"];
export type AdapterInfo = Schemas["AdapterInfo"];
export type RunsOn = Schemas["RunsOn"];
export type TryOnRegion = Schemas["TryOnRegion"];
export type Category = Schemas["Category"];
export type ColorFamily = Schemas["ColorFamily"];
export type ChatTurn = Schemas["ChatTurn"];
export type StylistReply = Schemas["StylistReply"];
export type HealthOut = Schemas["HealthOut"];
export type ScanOut = Schemas["ScanOut"];
export type JudgeOut = Schemas["JudgeOut"];
export type RenderOut = Schemas["RenderOut"];
export type ChatOut = Schemas["ChatOut"];
export type AddOut = Schemas["AddOut"];
export type LinkOut = Schemas["LinkOut"];
export type ClosetScanOut = Schemas["ClosetScanOut"];
export type ChatIn = Schemas["ChatIn"];

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

// Diffusion try-on on a cold GPU or a public Space can take minutes; tagging and chat seconds
const TIMEOUT_MS = { quick: 20_000, model: 90_000, render: 240_000 } as const;

const client = createClient<paths>({ baseUrl: API_BASE });

// =============================================================================
// Errors
// =============================================================================

/** A failed engine call; `status` is 0 when the engine could not be reached at all. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Return a short message for any thrown value, for showing under a failed step. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Await an `openapi-fetch` call and return its data, or throw an `ApiError`. */
async function unwrap<T>(call: () => Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call();
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      throw new ApiError(0, "The engine took too long to answer.", { cause });
    }
    throw new ApiError(0, `Cannot reach the engine at ${API_BASE}. Is \`make api\` running?`, {
      cause,
    });
  }
  if (result.data !== undefined) return result.data;
  throw new ApiError(result.response.status, describeFailure(result.response.status, result.error));
}

/** Turn FastAPI's `{detail}` body, a string or a validation list, into one line. */
function describeFailure(status: number, body: unknown): string {
  const detail = isRecord(body) ? body.detail : undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first: unknown = detail[0];
    if (isRecord(first) && typeof first.msg === "string") return `Invalid request: ${first.msg}`;
  }
  return `The engine answered ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// =============================================================================
// Multipart bodies
// =============================================================================

type FormValue = Blob | string | number | null | undefined;

/**
 * Build `body` and `bodySerializer` for a multipart route.
 * The generated schema types binary fields as `string`, so the fields are cast to the
 * route's body type here, once, and travel as real `Blob`s in the `FormData`.
 */
function multipart<Body>(fields: { [K in keyof Body]: FormValue }): {
  body: Body;
  bodySerializer: () => FormData;
} {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields) as [string, FormValue][]) {
    if (value === null || value === undefined) continue;
    if (value instanceof Blob) form.append(name, value, fileNameFor(name, value));
    else form.append(name, String(value));
  }
  return { body: fields as unknown as Body, bodySerializer: () => form };
}

function fileNameFor(field: string, blob: Blob): string {
  const extension = blob.type.split("/")[1] ?? "bin";
  return `${field}.${extension}`;
}

// =============================================================================
// Routes
// =============================================================================

/** Every engine route the web app calls, typed from the OpenAPI contract. */
export const api = {
  /** List the adapter in every engine slot. */
  health: (): Promise<HealthOut> =>
    unwrap(() => client.GET("/health", { signal: AbortSignal.timeout(TIMEOUT_MS.quick) })),

  /** Cut out and tag one garment photo. */
  scan: (image: Blob): Promise<ScanOut> =>
    unwrap(() =>
      client.POST("/scan", {
        ...multipart<Schemas["Body_scan_scan_post"]>({ image }),
        signal: AbortSignal.timeout(TIMEOUT_MS.model),
      }),
    ),

  /** Fetch the garment image behind a shop or image link. */
  link: (url: string): Promise<LinkOut> =>
    unwrap(() => client.POST("/link", { body: { url }, signal: AbortSignal.timeout(TIMEOUT_MS.model) })),

  /** Get the verdict for `tags` against `owner`'s closet and week. */
  judge: (owner: string, tags: GarmentTags, location: Location | null): Promise<JudgeOut> =>
    unwrap(() =>
      client.POST("/judge", {
        body: { owner, tags, location },
        signal: AbortSignal.timeout(TIMEOUT_MS.model),
      }),
    ),

  /** Paint `garment` onto the person photo; the engine holds the photo in memory only. */
  render: (person: Blob, garment: Blob, region: TryOnRegion): Promise<RenderOut> =>
    unwrap(() =>
      client.POST("/render", {
        ...multipart<Schemas["Body_render_render_post"]>({ person, garment, region, seed: null }),
        signal: AbortSignal.timeout(TIMEOUT_MS.render),
      }),
    ),

  /** Ask the stylist one question with the conversation so far. */
  chat: (body: ChatIn): Promise<ChatOut> =>
    unwrap(() => client.POST("/chat", { body, signal: AbortSignal.timeout(TIMEOUT_MS.model) })),

  /** List `owner`'s closet. */
  closet: (owner: string): Promise<Garment[]> =>
    unwrap(() =>
      client.GET("/closet/{owner}", {
        params: { path: { owner } },
        signal: AbortSignal.timeout(TIMEOUT_MS.quick),
      }),
    ),

  /** Add one garment photo to `owner`'s closet, letting the engine tag it; keeps the shop link. */
  addToCloset: (owner: string, image: Blob, sourceUrl: string | null = null): Promise<AddOut> =>
    unwrap(() =>
      client.POST("/closet/{owner}", {
        params: { path: { owner } },
        ...multipart<Schemas["Body_add_to_closet_closet__owner__post"]>({
          image,
          tags_json: null,
          price: null,
          source: "closet",
          source_url: sourceUrl,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS.model),
      }),
    ),

  /** Find every garment in a photo of a rack or closet and add them all to `owner`'s closet. */
  scanCloset: (owner: string, image: Blob): Promise<ClosetScanOut> =>
    unwrap(() =>
      client.POST("/closet/{owner}/scan", {
        params: { path: { owner } },
        ...multipart<Schemas["Body_scan_closet_closet__owner__scan_post"]>({ image }),
        // Tagging up to 20 garments in one answer takes far longer than one garment
        signal: AbortSignal.timeout(TIMEOUT_MS.render),
      }),
    ),

  /** Delete every garment in `owner`'s closet; returns how many went. */
  forgetCloset: async (owner: string): Promise<number> => {
    const result = await unwrap(() =>
      client.DELETE("/closet/{owner}", {
        params: { path: { owner } },
        signal: AbortSignal.timeout(TIMEOUT_MS.quick),
      }),
    );
    return result.deleted;
  },
};

/** URL of a closet garment's stored cutout, for an `<img src>`. */
export function garmentImageUrl(owner: string, garmentId: string): string {
  return `${API_BASE}/closet/${encodeURIComponent(owner)}/${encodeURIComponent(garmentId)}/image`;
}

/** Decode a base64 PNG from the engine into a `Blob`. */
export function pngFromBase64(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}
