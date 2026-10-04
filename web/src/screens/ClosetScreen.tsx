import { useCallback, useEffect, useState, type ReactNode } from "react";

import { api, errorMessage, type Garment } from "../api/client";
import { AddGarmentSheet } from "../components/AddGarmentSheet";
import { GarmentThumb } from "../components/GarmentThumb";
import { Icon } from "../components/Icons";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The owner's closet as a grid. Add a garment by shop link, a photo taken now or
// one from the device (the engine cuts it out and tags it), or delete
// everything, which takes a second tap to confirm.

/** The closet grid with add and delete-all. */
export function ClosetScreen(): ReactNode {
  const { settings, pipelines, navigate, flow } = useApp();
  const owner = settings.owner;
  const [garments, setGarments] = useState<Garment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .closet(owner)
      .then(setGarments)
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [owner]);

  useEffect(load, [load]);

  const add = async (image: Blob): Promise<void> => {
    setSheetOpen(false);
    setAdding(true);
    setError(null);
    try {
      const out = await api.addToCloset(owner, image);
      pipelines.record("closet", out.pipeline);
      setGarments((current) => [out.garment, ...(current ?? [])]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAdding(false);
    }
  };

  const forget = async (): Promise<void> => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    try {
      await api.forgetCloset(owner);
      setGarments([]);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <section className="fc-page closet">
      <header className="fc-topbar is-solid">
        <button
          type="button"
          className="fc-round fc-back"
          onClick={() => navigate(flow.frame ? "result" : "home")}
          aria-label="Back"
        >
          <Icon name="arrow" />
        </button>
        <p className="fc-topbar-title">Closet</p>
        <span className="fc-round is-ghost" aria-hidden="true" />
      </header>
      <header className="closet-head">
        <div>
          <h1 className="closet-title">{owner}'s closet</h1>
          <p className="fc-muted">
            {garments === null ? "Loading" : `${garments.length} ${garments.length === 1 ? "garment" : "garments"}`}
          </p>
        </div>
        <div className="closet-actions">
          <button type="button" className="fc-btn is-primary" disabled={adding} onClick={() => setSheetOpen(true)}>
            {adding ? <span className="spinner" /> : <Icon name="plus" />} {adding ? "Tagging" : "Add a garment"}
          </button>
          <button
            type="button"
            className={`fc-btn is-danger${armed ? " is-armed" : ""}`}
            onClick={() => void forget()}
            onBlur={() => setArmed(false)}
          >
            <Icon name="trash" /> {armed ? "Tap again to delete all" : "Delete everything"}
          </button>
        </div>
      </header>
      {error && (
        <p className="fc-error">
          {error}
          <button type="button" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {garments !== null && garments.length === 0 && (
        <div className="closet-empty">
          <p>Nothing here yet.</p>
          <p className="fc-muted">
            Add things you already own by shop link or photo, and every verdict will weigh them.
          </p>
        </div>
      )}
      <div className="closet-grid">
        {(garments ?? []).map((garment) => (
          <GarmentThumb key={garment.id} owner={owner} garment={garment} />
        ))}
      </div>
      <AddGarmentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onGarment={(image) => void add(image)}
        title="Add to your closet"
        linkLabel="Bought it online? Paste the product link"
        busy={adding}
      />
    </section>
  );
}
