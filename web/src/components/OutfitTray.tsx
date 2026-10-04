import type { ReactNode } from "react";

import { useObjectUrl } from "../lib/objectUrl";
import type { Wearable } from "../state/outfit";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// The row of garments along the bottom of the live preview. Tapping one puts it
// on, swapping out whatever covered the same part of the body; tapping a worn
// one takes it off. The first tile brings in a garment by shop link or photo.

interface OutfitTrayProps {
  items: readonly Wearable[];
  worn: readonly Wearable[];
  onToggle: (item: Wearable) => void;
  onAdd: () => void;
  adding: boolean;
}

const SOURCE_LABEL: Readonly<{ [S in Wearable["source"]]: string | null }> = {
  candidate: "Scanned",
  added: "New",
  closet: null,
};

/** Every garment the owner can put on, with the worn ones marked. */
export function OutfitTray({ items, worn, onToggle, onAdd, adding }: OutfitTrayProps): ReactNode {
  return (
    <ul className="fc-tray" aria-label="Garments to try on">
      <li>
        <button type="button" className="fc-tray-tile is-add" onClick={onAdd} disabled={adding}>
          <span className="fc-tray-art">{adding ? <span className="spinner" /> : <Icon name="plus" />}</span>
          <span className="fc-tray-name">{adding ? "Getting it" : "Link or photo"}</span>
        </button>
      </li>
      {items.map((item) => (
        <li key={item.key}>
          <TrayTile item={item} on={worn.some((other) => other.key === item.key)} onToggle={onToggle} />
        </li>
      ))}
    </ul>
  );
}

function TrayTile({ item, on, onToggle }: { item: Wearable; on: boolean; onToggle: (item: Wearable) => void }): ReactNode {
  const blobUrl = useObjectUrl(typeof item.thumb === "string" ? null : item.thumb);
  const src = typeof item.thumb === "string" ? item.thumb : blobUrl;
  const badge = SOURCE_LABEL[item.source];
  return (
    <button
      type="button"
      className="fc-tray-tile"
      aria-pressed={on}
      aria-label={`${on ? "Take off" : "Put on"} the ${item.label}`}
      onClick={() => onToggle(item)}
    >
      <span className="fc-tray-art">
        {src && <img src={src} alt="" loading="lazy" />}
        {badge && <span className="fc-tray-badge">{badge}</span>}
      </span>
      <span className="fc-tray-name">{item.label}</span>
    </button>
  );
}
