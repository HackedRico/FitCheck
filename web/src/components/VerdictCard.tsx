import type { CSSProperties, ReactNode } from "react";

import type { Verdict } from "../api/client";
import { decisionWording } from "../lib/garments";

// =============================================================================
// Module Overview
// =============================================================================
// The verdict as a store hang tag that swings in on its string: BUY, SKIP or
// TRY-WITH in the verdict's one accent, the rules' headline in the stylist's
// serif, and each reason with its code. The rules decide; this only shows it.

function reasonLabel(code: string): string {
  return code.replaceAll("_", " ");
}

/** The hang-tag verdict card for one candidate. */
export function VerdictCard({ verdict }: { verdict: Verdict }): ReactNode {
  const { word } = decisionWording(verdict.decision);
  return (
    <article className="hangtag" data-decision={verdict.decision} aria-live="polite">
      <span className="hangtag-string" aria-hidden="true" />
      <div className="hangtag-band">
        <span className="hangtag-hole" aria-hidden="true" />
        <p className="kicker hangtag-kicker">Verdict</p>
        <h2 className="hangtag-word display" data-length={word.length > 4 ? "long" : "short"}>
          {word}
        </h2>
      </div>
      <div className="hangtag-body">
        <p className="hangtag-headline serif">{verdict.headline}</p>
        {verdict.reasons.length > 0 && (
          <ol className="hangtag-reasons">
            {verdict.reasons.map((reason, i) => (
              <li key={`${reason.code}-${i}`} style={{ "--i": i } as CSSProperties}>
                <span className="kicker">{reasonLabel(reason.code)}</span>
                <span>{reason.message}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

/** A placeholder tag that hangs still while the rules run. */
export function VerdictPending(): ReactNode {
  return (
    <article className="hangtag is-pending" aria-label="Weighing the verdict">
      <span className="hangtag-string" aria-hidden="true" />
      <div className="hangtag-band">
        <span className="hangtag-hole" aria-hidden="true" />
        <p className="kicker hangtag-kicker">Verdict</p>
        <p className="hangtag-word display" data-length="long">
          &hellip;
        </p>
      </div>
      <div className="hangtag-body">
        <p className="hangtag-headline serif">Weighing it against your closet, the weather and your week.</p>
      </div>
    </article>
  );
}
