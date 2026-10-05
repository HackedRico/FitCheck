import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { errorMessage } from "../api/client";
import { captureFrame, pickedPhoto, useCamera } from "../lib/camera";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// The person-photo booth: the front camera, mirrored, with a body outline and a
// three second countdown so the owner can step back, plus a photo fallback.
// Hands the photo to `onPhoto`; storing it is the caller's job.

const COUNTDOWN_S = 3;

interface PhotoBoothProps {
  onPhoto: (photo: Blob) => void | Promise<void>;
  onCancel: () => void;
}

/** Take one full-body photo with a countdown, or pick one from the device. */
export function PhotoBooth({ onPhoto, onCancel }: PhotoBoothProps): ReactNode {
  const camera = useCamera("user", true);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Callers pass a fresh `onPhoto` each render; reading it through a ref keeps the countdown ticking
  const onPhotoRef = useRef(onPhoto);

  useEffect(() => {
    onPhotoRef.current = onPhoto;
  });

  useEffect(() => {
    if (count === null) return undefined;
    if (count === 0) {
      const video = camera.videoRef.current;
      setCount(null);
      if (video) {
        captureFrame(video)
          .then((photo) => onPhotoRef.current(photo))
          .catch((cause: unknown) => setError(errorMessage(cause)));
      }
      return undefined;
    }
    const timer = window.setTimeout(() => setCount(count - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [count, camera.videoRef]);

  const pick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const photo = await pickedPhoto(event.target);
    if (photo) await onPhoto(photo);
  };

  const live = camera.status === "live";

  return (
    <section className="fc-cam is-dark">
      <video ref={camera.videoRef} className="fc-cam-feed is-mirrored" playsInline muted autoPlay />
      <div className="fc-cam-shade" aria-hidden="true" />
      <span className="fc-body-guide" aria-hidden="true" />
      {count !== null && <span key={count} className="fc-countdown display">{count}</span>}

      <header className="fc-topbar">
        <button type="button" className="fc-round" onClick={onCancel} aria-label="Back">
          <Icon name="close" />
        </button>
        <p className="fc-topbar-title">Your photo</p>
        <span className="fc-round is-ghost" aria-hidden="true" />
      </header>

      <p className="fc-cam-hint">
        {error ??
          (live
            ? count === null
              ? "Step back until your head and knees fit the outline"
              : "Hold still"
            : (camera.error ?? "Starting the camera"))}
      </p>

      <footer className="fc-shutterbar">
        <button type="button" className="fc-round" onClick={() => fileRef.current?.click()} aria-label="Use a photo">
          <Icon name="upload" />
        </button>
        <button
          type="button"
          className="fc-shutter"
          disabled={!live || count !== null}
          onClick={() => {
            setError(null);
            setCount(COUNTDOWN_S);
          }}
          aria-label={`Take the photo in ${COUNTDOWN_S} seconds`}
        >
          <span />
        </button>
        <span className="fc-round is-ghost" aria-hidden="true" />
      </footer>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void pick(event)} />
    </section>
  );
}
