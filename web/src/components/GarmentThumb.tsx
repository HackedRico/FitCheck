import { useState, type ReactNode } from "react";

import { garmentImageUrl, type Garment } from "../api/client";
import { dressCode, garmentName, swatchFor } from "../lib/garments";

// =============================================================================
// Module Overview
// =============================================================================
// One closet garment as a thumbnail: its stored cutout from the engine, or a
// colour swatch from its tags when there is no image, with a short caption.

interface GarmentThumbProps {
  owner: string;
  garment: Garment;
  badge?: string;
}

/** A closet garment's picture and caption, falling back to a colour swatch. */
export function GarmentThumb({ owner, garment, badge }: GarmentThumbProps): ReactNode {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(garment.image_ref) && !failed;
  return (
    <figure className="thumb" data-badge={badge !== undefined}>
      <div className="thumb-frame" style={{ background: hasImage ? undefined : swatchFor(garment.tags.color_family) }}>
        {hasImage ? (
          <img
            src={garmentImageUrl(owner, garment.id)}
            alt={garment.tags.description}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="thumb-swatch-label">{garment.tags.category}</span>
        )}
        {badge !== undefined && <span className="thumb-badge">{badge}</span>}
      </div>
      <figcaption>
        <span className="thumb-name">{garmentName(garment.tags)}</span>
        <span className="thumb-meta">{dressCode(garment.tags.formality)}</span>
      </figcaption>
    </figure>
  );
}
