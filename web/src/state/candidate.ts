import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  errorMessage,
  pngFromBase64,
  type GarmentTags,
  type Location,
  type PipelineStep,
  type TryOnRegion,
  type Verdict,
  type WeekContext,
} from "../api/client";
import { compositeOnPerson } from "../lib/composite";
import { framedForRender } from "../lib/framePerson";
import { regionFor } from "../lib/garments";
import type { PipelineKind } from "./pipelines";

// =============================================================================
// Module Overview
// =============================================================================
// The scan-to-verdict-to-render flow for one candidate, with the latency
// choreography built in: tags land first, then the verdict, then a render starts
// on its own when there is a person photo. Each stage is a `Step` the UI draws as
// waiting, running with a clock, done with its time, failed or skipped. A newer
// scan or render silently wins over an older one still in flight.

export type Step<T> =
  | { status: "idle" }
  | { status: "running"; startedAt: number }
  | { status: "done"; value: T; ms: number }
  | { status: "failed"; error: string; ms: number }
  | { status: "skipped"; reason: string };

export interface Candidate {
  tags: GarmentTags;
  cutout: Blob;
  region: TryOnRegion | null;
}

export interface Judgement {
  verdict: Verdict;
  week: WeekContext;
}

export type RenderOrigin = "photo" | "live" | "stylist";

export interface Rendering {
  image: Blob;
  person: Blob;
  cached: boolean;
  origin: RenderOrigin;
  // True for a quick on-device try-on shown while the AI renderer is unavailable
  preview: boolean;
}

interface StepValues {
  scan: Candidate;
  judge: Judgement;
  render: Rendering;
}

type StepKey = keyof StepValues;
type Steps = { [K in StepKey]: Step<StepValues[K]> };

export interface FlowState extends Steps {
  id: number;
  frame: Blob | null;
}

export interface Flow extends FlowState {
  start: (frame: Blob) => void;
  retry: () => void;
  requestRender: (person: Blob, origin: RenderOrigin) => void;
  keepRender: (image: Blob, person: Blob) => void;
  reset: () => void;
}

export interface FlowDeps {
  owner: string;
  resolveLocation: () => Promise<Location | null>;
  record: (kind: PipelineKind, steps: readonly PipelineStep[]) => void;
  personPhoto: Blob | null;
}

const IDLE: Step<never> = { status: "idle" };
const EMPTY: FlowState = { id: 0, frame: null, scan: IDLE, judge: IDLE, render: IDLE };

/** Run scan, judge and render for each snapped frame and expose every stage's progress. */
export function useCandidateFlow(deps: FlowDeps): Flow {
  const [state, setState] = useState<FlowState>(EMPTY);
  // Async stages read the latest state and deps without re-creating every callback
  const stateRef = useRef(state);
  const depsRef = useRef(deps);
  const runId = useRef(0);
  const renderSeq = useRef(0);
  const lastRender = useRef<{ person: Blob; origin: RenderOrigin } | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    depsRef.current = deps;
  });

  const setStep = useCallback(
    <K extends StepKey>(key: K, step: Step<StepValues[K]>, isCurrent: () => boolean): void => {
      if (!isCurrent()) return;
      setState((current) => {
        // TS cannot tie a generic `K` to its own slot in a spread, so the pairing is asserted here
        return { ...current, [key]: step } as FlowState;
      });
    },
    [],
  );

  /** Run one stage, recording its progress; returns its value, or `null` if it failed. */
  const runStep = useCallback(
    async <K extends StepKey>(
      key: K,
      work: () => Promise<StepValues[K]>,
      isCurrent: () => boolean,
    ): Promise<StepValues[K] | null> => {
      const startedAt = performance.now();
      setStep(key, { status: "running", startedAt }, isCurrent);
      try {
        const value = await work();
        setStep(key, { status: "done", value, ms: performance.now() - startedAt }, isCurrent);
        return isCurrent() ? value : null;
      } catch (error) {
        console.warn(`[flow] ${key} failed.`, error);
        setStep(
          key,
          { status: "failed", error: errorMessage(error), ms: performance.now() - startedAt },
          isCurrent,
        );
        return null;
      }
    },
    [setStep],
  );

  const runRender = useCallback(
    async (id: number, candidate: Candidate, person: Blob, origin: RenderOrigin): Promise<void> => {
      const seq = ++renderSeq.current;
      const isCurrent = (): boolean => runId.current === id && renderSeq.current === seq;
      const region = candidate.region;
      if (region === null) {
        setStep("render", { status: "skipped", reason: "Renders cover tops, bottoms and dresses." }, isCurrent);
        return;
      }
      lastRender.current = { person, origin };
      await runStep(
        "render",
        async () => {
          const framed = await framedForRender(person);
          if (framed === null) {
            throw new Error("No one is visible in your photo. Retake it on the You screen, head to knees.");
          }
          const out = await api.render(framed, candidate.cutout, region);
          depsRef.current.record("render", out.pipeline);
          if (out.fallback) {
            // The engine's stand-in pastes the raw photo; the device can map the clothes onto you
            const local = await compositeOnPerson(framed, candidate.cutout, region).catch((error: unknown) => {
              console.warn("[flow] On-device preview failed; showing the engine's stand-in.", error);
              return null;
            });
            if (local) return { image: local, person: framed, cached: false, origin, preview: true };
          }
          return {
            image: pngFromBase64(out.image_png_base64),
            person: framed,
            cached: out.cached,
            origin,
            preview: out.fallback,
          };
        },
        isCurrent,
      );
    },
    [runStep, setStep],
  );

  const runFrom = useCallback(
    async (id: number, from: "scan" | "judge", frame: Blob): Promise<void> => {
      const isCurrent = (): boolean => runId.current === id;
      const scanned = stateRef.current.scan;
      const candidate =
        from === "judge" && scanned.status === "done"
          ? scanned.value
          : await runStep(
              "scan",
              async () => {
                const out = await api.scan(frame);
                depsRef.current.record("scan", out.pipeline);
                return {
                  tags: out.tags,
                  cutout: pngFromBase64(out.cutout_png_base64),
                  region: regionFor(out.tags.category),
                };
              },
              isCurrent,
            );
      if (candidate === null) return;

      const judged = await runStep(
        "judge",
        async () => {
          const { owner, resolveLocation, record } = depsRef.current;
          const location = await resolveLocation();
          const out = await api.judge(owner, candidate.tags, location);
          record("judge", out.pipeline);
          return { verdict: out.verdict, week: out.week };
        },
        isCurrent,
      );
      if (judged === null) return;

      const person = depsRef.current.personPhoto;
      if (person === null) {
        setStep("render", { status: "skipped", reason: "Add your photo on the You screen to see a render." }, isCurrent);
        return;
      }
      await runRender(id, candidate, person, "photo");
    },
    [runRender, runStep, setStep],
  );

  const start = useCallback(
    (frame: Blob) => {
      const id = ++runId.current;
      lastRender.current = null;
      setState({ ...EMPTY, id, frame });
      void runFrom(id, "scan", frame);
    },
    [runFrom],
  );

  const retry = useCallback(() => {
    const current = stateRef.current;
    if (current.frame === null) return;
    if (current.scan.status === "failed") void runFrom(current.id, "scan", current.frame);
    else if (current.judge.status === "failed") void runFrom(current.id, "judge", current.frame);
    else if (current.render.status === "failed" && current.scan.status === "done" && lastRender.current) {
      const { person, origin } = lastRender.current;
      void runRender(current.id, current.scan.value, person, origin);
    }
  }, [runFrom, runRender]);

  const requestRender = useCallback(
    (person: Blob, origin: RenderOrigin) => {
      const current = stateRef.current;
      if (current.scan.status !== "done") return;
      void runRender(current.id, current.scan.value, person, origin);
    },
    [runRender],
  );

  /** Keep a live-preview frame as the render, without a server call; a newer render wins. */
  const keepRender = useCallback((image: Blob, person: Blob) => {
    if (stateRef.current.scan.status !== "done") return;
    // Bumping the sequence drops any diffusion render still in flight for this scan
    renderSeq.current += 1;
    lastRender.current = { person, origin: "live" };
    setState((current) => ({
      ...current,
      render: { status: "done", value: { image, person, cached: false, origin: "live", preview: true }, ms: 0 },
    }));
  }, []);

  const reset = useCallback(() => {
    runId.current += 1;
    lastRender.current = null;
    setState({ ...EMPTY, id: runId.current });
  }, []);

  return { ...state, start, retry, requestRender, keepRender, reset };
}
