import { useState, type CSSProperties, type ReactNode } from "react";

// =============================================================================
// Module Overview
// =============================================================================
// A before and after drag slider for a render. A transparent range input covers
// the images, so dragging, tapping and arrow keys all move the divide.

interface BeforeAfterProps {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/** Compare the person photo with its render by dragging a divide across them. */
export function BeforeAfter({ before, after, beforeLabel = "Before", afterLabel = "Render" }: BeforeAfterProps): ReactNode {
  const [position, setPosition] = useState(50);
  return (
    <div className="compare" style={{ "--pos": `${position}%` } as CSSProperties}>
      <img className="compare-after" src={after} alt={afterLabel} draggable={false} />
      <img className="compare-before" src={before} alt={beforeLabel} draggable={false} />
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
