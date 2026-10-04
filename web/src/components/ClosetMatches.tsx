import type { ReactNode } from "react";

import type { Garment, Verdict } from "../api/client";
import { GarmentThumb } from "./GarmentThumb";

// =============================================================================
// Module Overview
// =============================================================================
// The closet garments behind a verdict: duplicates that make the candidate
// redundant, and pairings it can be worn with, best pairing first.

function Shelf({ owner, title, garments, bestId }: {
  owner: string;
  title: string;
  garments: readonly Garment[];
  bestId: string | null;
}): ReactNode {
  return (
    <section className="shelf">
      <h3 className="kicker">{title}</h3>
      <div className="shelf-row">
        {garments.map((garment) => (
          <GarmentThumb
            key={garment.id}
            owner={owner}
            garment={garment}
            {...(garment.id === bestId ? { badge: "Best pairing" } : {})}
          />
        ))}
      </div>
    </section>
  );
}

/** Duplicates and pairings from the closet as thumbnail shelves. */
export function ClosetMatches({ owner, verdict }: { owner: string; verdict: Verdict }): ReactNode {
  const best = verdict.best_pairing ?? null;
  // The best pairing leads its shelf so it is the first thing the eye lands on
  const pairings = best
    ? [best, ...verdict.pairings.filter((garment) => garment.id !== best.id)]
    : verdict.pairings;

  if (verdict.duplicates.length === 0 && pairings.length === 0) {
    return <p className="shelf-empty">Nothing in the closet matches or pairs with it yet.</p>;
  }
  return (
    <div className="shelves">
      {verdict.duplicates.length > 0 && (
        <Shelf owner={owner} title="Already in your closet" garments={verdict.duplicates} bestId={null} />
      )}
      {pairings.length > 0 && (
        <Shelf owner={owner} title="Wear it with" garments={pairings} bestId={best?.id ?? null} />
      )}
    </div>
  );
}
