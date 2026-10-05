import { useEffect, useState, type ReactNode } from "react";

import { api, errorMessage, type Garment } from "../api/client";
import { AddGarmentSheet } from "../components/AddGarmentSheet";
import { CameraCapture } from "../components/CameraCapture";
import { GarmentThumb } from "../components/GarmentThumb";
import { Icon } from "../components/Icons";
import { garmentCount } from "../lib/garments";
import { useApp } from "../state/app";
import { closetWearable, type Wearable } from "../state/outfit";

// =============================================================================
// Module Overview
// =============================================================================
// The owner's closet as a grid. Add one garment by shop link or photo, scan a
// whole rack or closet in one photo (the engine finds, crops and tags each
// garment), try any garment on in the live preview, or delete everything, which
// takes a second tap to confirm.

/** The closet grid with add and delete-all. */
export function ClosetScreen(): ReactNode {
  const { settings, pipelines, navigate, flow, outfit } = useApp();
  const owner = settings.owner;
  const [garments, setGarments] = useState<Garment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // A switch of owner mid-load must not show the last owner's closet under the new name
    let cancelled = false;
    setError(null);
    api
      .closet(owner)
      .then((loaded) => {
        if (!cancelled) setGarments(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [owner, attempt]);

  const add = async (image: Blob, sourceUrl?: string): Promise<void> => {
    setSheetOpen(false);
    setAdding(true);
    setError(null);
    try {
      const out = await api.addToCloset(owner, image, sourceUrl ?? null);
      pipelines.record("closet", out.pipeline);
      setGarments((current) => [out.garment, ...(current ?? [])]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAdding(false);
    }
  };

  const scan = async (photo: Blob): Promise<void> => {
    setShooting(false);
    setScanning(true);
    setError(null);
    setNotice(null);
    try {
      const out = await api.scanCloset(owner, photo);
      pipelines.record("closet", out.pipeline);
      setGarments((current) => [...out.garments, ...(current ?? [])]);
      setNotice(
        out.garments.length === 0
          ? "No garments stood out in that photo. Try closer, with the clothes spread out."
          : `Added ${garmentCount(out.garments.length)} from that photo.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setScanning(false);
    }
  };

  const tryOn = (wearable: Wearable): void => {
    outfit.wear(wearable);
    navigate("live");
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
            {garments === null ? "Loading" : garmentCount(garments.length)}
          </p>
        </div>
        <div className="closet-actions">
          <button type="button" className="fc-btn is-primary" disabled={adding || scanning} onClick={() => setSheetOpen(true)}>
            {adding ? <span className="spinner" /> : <Icon name="plus" />} {adding ? "Tagging" : "Add a garment"}
          </button>
          <button
            type="button"
            className="fc-btn is-ghost"
            disabled={adding || scanning}
            onClick={() => setShooting(true)}
          >
            {scanning ? <span className="spinner" /> : <Icon name="camera" />} {scanning ? "Finding garments" : "Scan your closet"}
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
      {scanning && <p className="closet-notice">Finding each garment in the photo. A full rack takes about half a minute.</p>}
      {notice && <p className="closet-notice">{notice}</p>}
      {error && (
        <p className="fc-error">
          {error}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
      {garments !== null && garments.length === 0 && !scanning && (
        <div className="closet-empty">
          <p>Nothing here yet.</p>
          <p className="fc-muted">
            Scan your whole closet in one photo, or add pieces by shop link or photo. Every verdict weighs what is here.
          </p>
        </div>
      )}
      <div className="closet-grid">
        {(garments ?? []).map((garment) => {
          const wearable = closetWearable(owner, garment);
          return (
            <div key={garment.id} className="closet-item">
              <GarmentThumb owner={owner} garment={garment} />
              {wearable && (
                <button type="button" className="fc-chip closet-tryon" onClick={() => tryOn(wearable)}>
                  <Icon name="live" /> Try on
                </button>
              )}
            </div>
          );
        })}
      </div>
      <AddGarmentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onGarment={(image, sourceUrl) => void add(image, sourceUrl)}
        title="Add to your closet"
        linkLabel="Bought it online? Paste the shop link"
        busy={adding}
      />
      {shooting && (
        <CameraCapture
          title="Scan your closet"
          hint="Fit the whole rack in, clothes spread out"
          onCancel={() => setShooting(false)}
          onPhoto={(photo) => void scan(photo)}
        />
      )}
    </section>
  );
}
