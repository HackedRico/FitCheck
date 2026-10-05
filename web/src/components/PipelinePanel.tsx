import type { ReactNode } from "react";

import type { PipelineStep } from "../api/client";
import { runsOnLabel } from "../lib/garments";
import { formatMs } from "../lib/time";
import { useApp } from "../state/app";
import { PIPELINE_KINDS, photoLeftOurHardware, type PipelineKind } from "../state/pipelines";
import { Icon } from "./Icons";
import { Sheet } from "./Sheet";

// =============================================================================
// Module Overview
// =============================================================================
// What ran where. `PipelinePanel` leads with the privacy badge, which reads
// "Photo never left hardware we control" unless a step that touched the person
// photo ran on a public API (ADR 0003), then lists every step of the last
// responses with adapter, model, licence, where it ran and its time.

const KIND_TITLE: Record<PipelineKind, string> = {
  scan: "Scan",
  judge: "Verdict",
  render: "Render",
  chat: "Stylist",
  closet: "Closet",
};

function StepRow({ step }: { step: PipelineStep }): ReactNode {
  const exposed = step.touched_person_image && step.adapter.runs_on === "public_api";
  return (
    <li className="pipe-step" data-skipped={step.skipped} data-warn={exposed}>
      <span className="pipe-name">{step.step}</span>
      <span className="pipe-adapter">
        {step.adapter.name}
        {step.adapter.model ? <em> · {step.adapter.model}</em> : null}
      </span>
      <span className="pipe-meta">
        <span className="pill">{runsOnLabel(step.adapter.runs_on)}</span>
        {step.adapter.license && <span className="pill">{step.adapter.license}</span>}
        {step.touched_person_image && <span className="pill pill-warn">person photo</span>}
        {step.cached && <span className="pill pill-warn">cached</span>}
        {step.skipped && <span className="pill">skipped</span>}
      </span>
      <span className="pipe-ms">{formatMs(step.ms)}</span>
    </li>
  );
}

/** The pipeline sheet with every recorded step and the engine's adapters. */
export function PipelinePanel(): ReactNode {
  const { pipelines, sheet, openSheet, engine } = useApp();
  const leaked = photoLeftOurHardware(pipelines.records);
  const recorded = PIPELINE_KINDS.flatMap((kind) => {
    const record = pipelines.records[kind];
    return record ? [record] : [];
  });

  return (
    <Sheet open={sheet === "pipeline"} title="Pipeline" onClose={() => openSheet(null)}>
      <p className="privacy-badge" data-warn={leaked}>
        <Icon name={leaked ? "warn" : "lock"} />
        {leaked
          ? "Warning: a step that touched your photo ran on a public API."
          : "Photo never left hardware we control"}
      </p>
      {recorded.length === 0 && <p className="muted">Nothing has run yet. Scan a garment to fill this in.</p>}
      {recorded.map((record) => (
        <section key={record.kind} className="pipe-group">
          <h3 className="kicker">
            {KIND_TITLE[record.kind]} · {formatMs(record.steps.reduce((n, s) => n + s.ms, 0))} ·{" "}
            {record.at.toLocaleTimeString()}
          </h3>
          <ol className="pipe-steps">
            {record.steps.map((step, i) => (
              <StepRow key={`${step.step}-${i}`} step={step} />
            ))}
          </ol>
        </section>
      ))}
      <section className="pipe-group">
        <h3 className="kicker">Adapters on this engine</h3>
        {engine.health ? (
          <ul className="pipe-steps">
            {Object.entries(engine.health.adapters).map(([slot, info]) => (
              <li key={slot} className="pipe-step">
                <span className="pipe-name">{slot}</span>
                <span className="pipe-adapter">
                  {info.name}
                  {info.model ? <em> · {info.model}</em> : null}
                </span>
                <span className="pipe-meta">
                  <span className="pill">{runsOnLabel(info.runs_on)}</span>
                  {info.license && <span className="pill">{info.license}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="error-line">
            {engine.error ?? "Asking the engine"}
            <button type="button" onClick={engine.refresh}>
              Retry
            </button>
          </p>
        )}
      </section>
    </Sheet>
  );
}
