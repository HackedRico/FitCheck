import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { api, errorMessage, type Garment } from "../api/client";
import { GarmentThumb } from "../components/GarmentThumb";
import { Icon } from "../components/Icons";
import { shrinkImage } from "../lib/camera";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The owner's closet as a grid. Add a garment by photo (the engine cuts it out
// and tags it) or delete everything, which takes a second tap to confirm.

/** The closet grid with add and delete-all. */
export function ClosetScreen(): ReactNode {
  const { settings, pipelines } = useApp();
  const owner = settings.owner;
  const [garments, setGarments] = useState<Garment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .closet(owner)
      .then(setGarments)
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [owner]);

  useEffect(load, [load]);

  const add = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAdding(true);
    setError(null);
    try {
      const out = await api.addToCloset(owner, await shrinkImage(file));
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
    <section className="closet">
      <header className="closet-head">
        <div>
          <p className="kicker">{owner}'s closet</p>
          <h1 className="display">{garments === null ? "Closet" : `${garments.length} garments`}</h1>
        </div>
        <div className="closet-actions">
          <button type="button" className="btn btn-solid" disabled={adding} onClick={() => fileRef.current?.click()}>
            {adding ? <span className="spinner" /> : <Icon name="plus" />} {adding ? "Tagging" : "Add a garment"}
          </button>
          <button
            type="button"
            className={`btn btn-danger${armed ? " is-armed" : ""}`}
            onClick={() => void forget()}
            onBlur={() => setArmed(false)}
          >
            <Icon name="trash" /> {armed ? "Tap again to delete all" : "Delete everything"}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void add(e)} />
      </header>
      {error && (
        <p className="error-line">
          {error}
          <button type="button" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {garments !== null && garments.length === 0 && <p className="muted">The closet is empty. Add a garment by photo.</p>}
      <div className="closet-grid">
        {(garments ?? []).map((garment) => (
          <GarmentThumb key={garment.id} owner={owner} garment={garment} />
        ))}
      </div>
    </section>
  );
}
