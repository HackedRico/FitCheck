import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from "react";

// =============================================================================
// Module Overview
// =============================================================================
// Compares the person photo with its render. When both images share a shape, a
// drag slider wipes between them; renderers often return a different shape (a
// padded 3:4 frame from a diffusion model, say), and a wipe across mismatched
// images misleads, so then the two sit side by side instead.

interface BeforeAfterProps {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}

// Shapes closer than this read as the same frame to the eye
const SAME_SHAPE = 0.03;

/** Compare the person photo with its render, by slider or side by side. */
export function BeforeAfter({ before, after, beforeLabel = "Before", afterLabel = "Render" }: BeforeAfterProps): ReactNode {
  const [position, setPosition] = useState(50);
  const [beforeRatio, setBeforeRatio] = useState<number | null>(null);
  const [afterRatio, setAfterRatio] = useState<number | null>(null);
  const ratioOf = (set: (n: number) => void) => (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalHeight > 0) set(naturalWidth / naturalHeight);
  };

  const known = beforeRatio !== null && afterRatio !== null;
  const sameShape = known && Math.abs(beforeRatio - afterRatio) < SAME_SHAPE;

  if (known && !sameShape) {
    return (
      <div className="compare-pair">
        <figure>
          <img src={before} alt={beforeLabel} draggable={false} />
          <figcaption>{beforeLabel}</figcaption>
        </figure>
        <figure>
          <img src={after} alt={afterLabel} draggable={false} />
          <figcaption>{afterLabel}</figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div
      className="compare"
      style={{ "--pos": `${position}%`, aspectRatio: beforeRatio ?? undefined } as CSSProperties}
    >
      <img className="compare-after" src={after} alt={afterLabel} draggable={false} onLoad={ratioOf(setAfterRatio)} />
      <img className="compare-before" src={before} alt={beforeLabel} draggable={false} onLoad={ratioOf(setBeforeRatio)} />
      <span className="compare-label is-before">{beforeLabel}</span>
      <span className="compare-label is-after">{afterLabel}</span>
      <span className="compare-handle" aria-hidden="true">
        <span />
      </span>
      <input
        className="compare-input"
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={position}
        aria-label="Drag to compare before and render"
        onChange={(event) => setPosition(Number(event.target.value))}
      />
    </div>
  );
}
