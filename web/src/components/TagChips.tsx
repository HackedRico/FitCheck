import type { CSSProperties, ReactNode } from "react";

import type { GarmentTags } from "../api/client";
import { dressCode, swatchFor } from "../lib/garments";

// =============================================================================
// Module Overview
// =============================================================================
// The candidate's tags as chips that fade in one after another, the first thing
// to land after a snap. While tags are being read, blank chips hold their place
// so the panel is never empty.

interface Chip {
  key: string;
  text: string;
  swatch?: string;
}

function chipsFor(tags: GarmentTags): Chip[] {
  return [
    { key: "category", text: tags.category },
    { key: "color", text: tags.color_family, swatch: swatchFor(tags.color_family) },
    { key: "pattern", text: tags.pattern },
    { key: "warmth", text: `warmth ${tags.warmth}/5` },
    { key: "waterproof", text: tags.waterproof ? "waterproof" : "not waterproof" },
    { key: "formality", text: dressCode(tags.formality) },
  ];
}

/** Tag chips for `tags`, or reading placeholders when `tags` is `null`. */
export function TagChips({ tags }: { tags: GarmentTags | null }): ReactNode {
  if (tags === null) {
    return (
      <div className="chips is-reading" aria-label="Reading tags">
        <p className="chips-description">Reading the tags</p>
        <ul className="chip-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="chip chip-blank" style={{ "--i": i } as CSSProperties}>
              &nbsp;
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="chips">
      <p className="chips-description">{tags.description}</p>
      <ul className="chip-list" aria-label="Tags">
        {chipsFor(tags).map((chip, i) => (
          <li
            key={chip.key}
            className="chip"
            style={{ "--i": i } as CSSProperties}
          >
            {chip.swatch !== undefined && (
              <span className="chip-swatch" style={{ background: chip.swatch }} aria-hidden="true" />
            )}
            {chip.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
