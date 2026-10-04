import { useCallback, useState } from "react";

import type { PipelineStep } from "../api/client";

// =============================================================================
// Module Overview
// =============================================================================
// The pipeline panel's memory: the steps of the last response of each kind.
// `photoLeftOurHardware` is the privacy badge's rule (ADR 0003): it is true only
// when a step that touched the person photo ran on a public API.

export type PipelineKind = "scan" | "judge" | "render" | "chat" | "closet";

export const PIPELINE_KINDS: readonly PipelineKind[] = ["scan", "judge", "render", "chat", "closet"];

export interface PipelineRecord {
  kind: PipelineKind;
  steps: readonly PipelineStep[];
  at: Date;
}

export type PipelineRecords = Partial<Record<PipelineKind, PipelineRecord>>;

export interface PipelinesState {
  records: PipelineRecords;
  record: (kind: PipelineKind, steps: readonly PipelineStep[]) => void;
}

/** Keep the latest pipeline per request kind. */
export function usePipelines(): PipelinesState {
  const [records, setRecords] = useState<PipelineRecords>({});
  const record = useCallback((kind: PipelineKind, steps: readonly PipelineStep[]) => {
    setRecords((current) => ({ ...current, [kind]: { kind, steps, at: new Date() } }));
  }, []);
  return { records, record };
}

/** True when any recorded step sent the person photo to a public API. */
export function photoLeftOurHardware(records: PipelineRecords): boolean {
  return PIPELINE_KINDS.some((kind) =>
    (records[kind]?.steps ?? []).some(
      (step) => step.touched_person_image === true && step.adapter.runs_on === "public_api",
    ),
  );
}
