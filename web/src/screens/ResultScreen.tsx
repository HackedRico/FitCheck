import { useRef, type ReactNode } from "react";

import type { Garment, Reason, Verdict } from "../api/client";
import { BeforeAfter } from "../components/BeforeAfter";
import { ClosetMatches } from "../components/ClosetMatches";
import { Icon } from "../components/Icons";
import { StylistChat } from "../components/StylistChat";
import { TagChips } from "../components/TagChips";
import { WeekStrip } from "../components/WeekStrip";
import { decisionWording, garmentName } from "../lib/garments";
import { useObjectUrl } from "../lib/objectUrl";
import { formatMs, useElapsed } from "../lib/time";
import { useApp } from "../state/app";
import type { Step } from "../state/candidate";
import { candidateWearable } from "../state/outfit";
import { photoLeftOurHardware } from "../state/pipelines";

// =============================================================================
// Module Overview
// =============================================================================
// One scan, told top to bottom: the snapped garment, a checklist while the
// engine works, then the verdict in large type, the garment on the owner, why,
// what it goes with and the week. A dock pinned to the bottom keeps the stylist,
// "scan another" and "try it live" under the thumb the whole way down.

const REASON_LABEL: Record<Reason["code"], string> = {
  duplicates: "Already own",
  fills_weather_gap: "Weather",
  fits_event: "Your plans",
  pairs_well: "Goes with",
  few_pairings: "Goes with",
  statement_piece: "Bold print",
};

/** The story of the current scan. */
export function ResultScreen(): ReactNode {
  const { flow, outfit, navigate, settings } = useApp();
  const onYouRef = useRef<HTMLElement | null>(null);
  const frameUrl = useObjectUrl(flow.frame);

  if (flow.frame === null) {
    return (
      <section className="fc-page fc-empty">
        <p className="fc-kicker">No scan yet</p>
        <h1 className="display">Point at a garment</h1>
        <button type="button" className="fc-btn is-primary" onClick={() => navigate("home")}>
          <Icon name="camera" /> Open the camera
        </button>
      </section>
    );
  }

  const tags = flow.scan.status === "done" ? flow.scan.value.tags : null;
  const judged = flow.judge.status === "done" ? flow.judge.value : null;
  const decision = judged?.verdict.decision;

  const scanAnother = (): void => {
    flow.reset();
    navigate("home");
  };

  const tryLive = (): void => {
    const candidate = flow.scan.status === "done" ? candidateWearable(flow.scan.value) : null;
    if (candidate) outfit.wear(candidate);
    navigate("live");
  };

  return (
    <section className="fc-page fc-result" data-decision={decision}>
      <header className="fc-topbar is-solid">
        <button type="button" className="fc-round fc-back" onClick={() => navigate("home")} aria-label="Back to the camera">
          <Icon name="arrow" />
        </button>
        <p className="fc-topbar-title">{tags ? garmentName(tags) : "Reading the garment"}</p>
        <PrivacyDot />
      </header>

      <div className="fc-specimen" data-state={flow.scan.status}>
        {frameUrl && <img src={frameUrl} alt="The garment you scanned" />}
        {flow.scan.status === "running" && <span className="fc-scanline" aria-hidden="true" />}
      </div>

      {tags && (
        <div className="fc-tags">
          <TagChips tags={tags} />
        </div>
      )}

      {!judged && <Checklist />}

      {judged && (
        <>
          <VerdictHero verdict={judged.verdict} />
          <section ref={onYouRef} className="fc-section">
            <SectionTitle title="On you" />
            <OnYou />
          </section>
          <section className="fc-section">
            <SectionTitle title="Why" />
            <Reasons verdict={judged.verdict} />
          </section>
          <section className="fc-section">
            <SectionTitle title="From your closet" />
            <ClosetMatches owner={settings.owner} verdict={judged.verdict} />
          </section>
          <section className="fc-section">
            <SectionTitle title="Your week" />
            <WeekStrip week={judged.week} />
          </section>
          <PipelineFooter />
        </>
      )}

      <div ref={trackDockHeight} className="fc-dock">
        {judged && (
          <StylistChat onRender={() => onYouRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        )}
        <nav className="fc-actionbar" aria-label="Next">
          <button type="button" className="fc-btn is-ghost" onClick={scanAnother}>
            <Icon name="camera" /> Scan another
          </button>
          <button
            type="button"
            className="fc-btn is-primary"
            disabled={flow.scan.status !== "done"}
            onClick={tryLive}
          >
            <Icon name="live" /> Try it live
          </button>
        </nav>
      </div>
    </section>
  );
}

/** Publish the dock's height as `--dock-h` on the page so the page scrolls clear of it. */
function trackDockHeight(dock: HTMLDivElement | null): (() => void) | undefined {
  const page = dock?.parentElement;
  if (!dock || !page) return undefined;
  // The dock grows as the stylist conversation does, so a fixed page padding would hide the foot
  const observer = new ResizeObserver(() => page.style.setProperty("--dock-h", `${dock.offsetHeight}px`));
  observer.observe(dock);
  return () => {
    observer.disconnect();
    page.style.removeProperty("--dock-h");
  };
}

// -----------------------------------------------------------------
// Progress while the engine works
// -----------------------------------------------------------------

function Checklist(): ReactNode {
  const { flow } = useApp();
  return (
    <ol className="fc-checklist">
      <CheckRow label="Reading the garment" step={flow.scan} />
      <CheckRow label="Checking your closet and week" step={flow.judge} />
      {(flow.scan.status === "failed" || flow.judge.status === "failed") && (
        <li className="fc-check-retry">
          <button type="button" className="fc-btn is-ghost" onClick={flow.retry}>
            Try again
          </button>
        </li>
      )}
    </ol>
  );
}

function CheckRow<T>({ label, step }: { label: string; step: Step<T> }): ReactNode {
  const elapsed = useElapsed(step.status === "running" ? step.startedAt : null);
  const time =
    step.status === "running"
      ? formatMs(elapsed)
      : step.status === "done" || step.status === "failed"
        ? formatMs(step.ms)
        : "";
  return (
    <li className="fc-check" data-status={step.status}>
      <span className="fc-check-mark" aria-hidden="true" />
      <span className="fc-check-label">
        {label}
        {step.status === "failed" && <em>{step.error}</em>}
      </span>
      <span className="fc-check-time">{time}</span>
    </li>
  );
}

// -----------------------------------------------------------------
// Verdict
// -----------------------------------------------------------------

function VerdictHero({ verdict }: { verdict: Verdict }): ReactNode {
  const { hero } = decisionWording(verdict.decision);
  return (
    <section className="fc-verdict" data-decision={verdict.decision}>
      <h1 className="fc-verdict-word">{hero}</h1>
      <p className="fc-verdict-headline">{withoutEcho(verdict.headline, hero)}</p>
    </section>
  );
}

/** Drop a leading "Buy it:" from the headline, since the hero word above already says it. */
function withoutEcho(headline: string, hero: string): string {
  const echo = `${hero.replace(/\.$/, "")}:`;
  if (!headline.startsWith(echo)) return headline;
  const rest = headline.slice(echo.length).trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function SectionTitle({ title }: { title: string }): ReactNode {
  return <h2 className="fc-section-title">{title}</h2>;
}

function Reasons({ verdict }: { verdict: Verdict }): ReactNode {
  const byId = new Map<string, Garment>();
  for (const garment of [...verdict.duplicates, ...verdict.pairings]) byId.set(garment.id, garment);
  return (
    <ul className="fc-reasons">
      {verdict.reasons.map((reason: Reason, i) => (
        <li key={`${reason.code}-${i}`} style={{ animationDelay: `${120 + i * 90}ms` }}>
          <span className="fc-reason-code">{REASON_LABEL[reason.code] ?? reason.code}</span>
          <p>{reason.message}</p>
          {reason.garment_ids.length > 0 && (
            <span className="fc-reason-count">
              {reason.garment_ids.filter((id) => byId.has(id)).length || reason.garment_ids.length} in your closet
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------
// The garment on the owner
// -----------------------------------------------------------------

function OnYou(): ReactNode {
  const { flow, person, navigate } = useApp();
  const render = flow.render;
  const elapsed = useElapsed(render.status === "running" ? render.startedAt : null);
  const personUrl = useObjectUrl(render.status === "done" ? render.value.person : null);
  const renderUrl = useObjectUrl(render.status === "done" ? render.value.image : null);

  if (render.status === "done" && personUrl && renderUrl) {
    const { value } = render;
    // Anything made on this phone offers the AI render it stands in for
    const onDevice =
      value.origin === "live"
        ? { note: "Snapped from the live preview, on this phone.", action: "Make an AI render" }
        : value.preview
          ? { note: "Quick preview made on this phone, not an AI render.", action: "Try the AI render again" }
          : null;
    return (
      <div className="fc-onyou">
        <BeforeAfter before={personUrl} after={renderUrl} beforeLabel="You" afterLabel="With it" />
        {value.cached && <p className="fc-note">Cached render, not live.</p>}
        {onDevice && (
          <div className="fc-onyou-more">
            <p className="fc-muted">{onDevice.note}</p>
            <button type="button" className="fc-btn is-ghost" onClick={() => flow.requestRender(value.person, "photo")}>
              {onDevice.action}
            </button>
          </div>
        )}
      </div>
    );
  }
  if (render.status === "running") {
    return (
      <div className="fc-onyou-wait">
        <span className="fc-shimmer" aria-hidden="true" />
        <p>
          Dressing you <span className="fc-mono">{formatMs(elapsed)}</span>
        </p>
      </div>
    );
  }
  if (render.status === "failed") {
    return (
      <div className="fc-onyou-cta">
        <p>The render did not come through. {render.error}</p>
        <button type="button" className="fc-btn is-ghost" onClick={flow.retry}>
          Try again
        </button>
      </div>
    );
  }
  if (person.photo === null) {
    return (
      <div className="fc-onyou-cta">
        <p>Add one photo of yourself and every scan shows up on you.</p>
        <button type="button" className="fc-btn is-primary" onClick={() => navigate("you")}>
          <Icon name="person" /> Add my photo
        </button>
      </div>
    );
  }
  return (
    <div className="fc-onyou-cta">
      <p>{render.status === "skipped" ? render.reason : "Ready when you are."}</p>
      <button
        type="button"
        className="fc-btn is-ghost"
        disabled={flow.scan.status !== "done"}
        onClick={() => person.photo && flow.requestRender(person.photo, "photo")}
      >
        Render it on me
      </button>
    </div>
  );
}

// -----------------------------------------------------------------
// Privacy and pipeline
// -----------------------------------------------------------------

function PrivacyDot(): ReactNode {
  const { pipelines, openSheet } = useApp();
  const leaked = photoLeftOurHardware(pipelines.records);
  return (
    <button
      type="button"
      className="fc-round fc-privacy"
      data-warn={leaked}
      onClick={() => openSheet("pipeline")}
      aria-label={leaked ? "Your photo left our hardware; open the pipeline" : "Open the pipeline"}
    >
      <Icon name={leaked ? "warn" : "lock"} />
    </button>
  );
}

function PipelineFooter(): ReactNode {
  const { pipelines, openSheet } = useApp();
  const leaked = photoLeftOurHardware(pipelines.records);
  return (
    <button type="button" className="fc-pipeline" data-warn={leaked} onClick={() => openSheet("pipeline")}>
      <Icon name={leaked ? "warn" : "lock"} />
      <span>
        <strong>{leaked ? "Your photo went to a public API for this render" : "Your photo never left hardware we control"}</strong>
        <span>See every model, license and where it ran</span>
      </span>
      <Icon name="arrow" />
    </button>
  );
}
