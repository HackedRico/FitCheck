import { useState, type CSSProperties, type ReactNode } from "react";

import { garmentImageUrl, type Garment } from "../api/client";
import { dressCode, swatchFor } from "../lib/garments";

// =============================================================================
// Module Overview
// =============================================================================
// One closet garment as a thumbnail: its stored cutout from the engine, or, when
// there is no photo yet, a silhouette of its category in its colour. The caption
// is the garment's own description, so "black straight-leg jeans" reads as such
// rather than "black bottom". A garment imported from a shop link links back to it.

interface GarmentThumbProps {
  owner: string;
  garment: Garment;
  badge?: string;
}

/** A closet garment's photo or silhouette, with its description and dress code. */
export function GarmentThumb({ owner, garment, badge }: GarmentThumbProps): ReactNode {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(garment.image_ref) && !failed;
  const { tags } = garment;
  return (
    <figure className="thumb" data-badge={badge !== undefined}>
      <div className="thumb-frame">
        {hasImage ? (
          <img
            src={garmentImageUrl(owner, garment.id)}
            alt={tags.description}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="thumb-art" data-category={tags.category} role="img" aria-label={tags.description}>
            <span className="thumb-art-fill" style={{ background: swatchFor(tags.color_family) } as CSSProperties} />
          </span>
        )}
        {badge !== undefined && <span className="thumb-badge">{badge}</span>}
      </div>
      <figcaption>
        <span className="thumb-name">{sentence(tags.description)}</span>
        <span className="thumb-meta">
          {tags.category} · {dressCode(tags.formality)}
        </span>
        {garment.source_url && (
          <a className="thumb-source" href={garment.source_url} target="_blank" rel="noreferrer noopener">
            From {hostOf(garment.source_url)}
          </a>
        )}
      </figcaption>
    </figure>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // A stored link that does not parse still deserves a label
    return "the web";
  }
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
