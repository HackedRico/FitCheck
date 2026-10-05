import type { ReactNode } from "react";

import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// A sheet that slides up on a phone and in from the right on a laptop. It stays
// mounted when closed so a conversation or form keeps its state.

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A dismissable side or bottom sheet. */
export function Sheet({ open, title, onClose, children }: SheetProps): ReactNode {
  return (
    <div className="sheet-layer" data-open={open} aria-hidden={!open}>
      <button type="button" className="sheet-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <aside className="sheet" role="dialog" aria-label={title} inert={!open}>
        <header className="sheet-head">
          <h2 className="display">{title}</h2>
          <button type="button" className="fc-round" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>
  );
}
