import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { captureFrame, pickedPhoto, useCamera, type Facing } from "../lib/camera";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// A full-screen viewfinder that takes one photo. The rear camera opens first,
// with a switch for the front one and a photo picker when no camera opens. It
// replaces `<input capture>`, which desktop browsers ignore and turn into a
// plain file picker. Hands the JPEG to `onPhoto`; what happens next is the caller's job.

interface CameraCaptureProps {
  title: string;
  hint: string;
  onPhoto: (photo: Blob) => void;
  onCancel: () => void;
}

/** Take one photo with the device camera, or pick one when the camera cannot open. */
export function CameraCapture({ title, hint, onPhoto, onCancel }: CameraCaptureProps): ReactNode {
  const [facing, setFacing] = useState<Facing>("environment");
  const camera = useCamera(facing, true);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const live = camera.status === "live";

  const snap = async (): Promise<void> => {
    const video = camera.videoRef.current;
    if (!video) return;
    try {
      onPhoto(await captureFrame(video));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not take the photo.");
    }
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const photo = await pickedPhoto(event.target);
    if (photo) onPhoto(photo);
  };

  // A portal, because a sheet's slide transform would pin a fixed overlay to the sheet instead of the screen
  return createPortal(
    <section className="fc-cam is-dark fc-capture" role="dialog" aria-label={title}>
      <video
        ref={camera.videoRef}
        className="fc-cam-feed"
        data-mirrored={facing === "user"}
        playsInline
        muted
        autoPlay
      />
      <div className="fc-cam-shade" aria-hidden="true" />

      <header className="fc-topbar">
        <button type="button" className="fc-round" onClick={onCancel} aria-label="Close the camera">
          <Icon name="close" />
        </button>
        <p className="fc-topbar-title">{title}</p>
        <button
          type="button"
          className="fc-round"
          onClick={() => setFacing(facing === "user" ? "environment" : "user")}
          aria-label="Switch camera"
        >
          <Icon name="flip" />
        </button>
      </header>

      <p className="fc-cam-hint">{error ?? (live ? hint : (camera.error ?? "Starting the camera"))}</p>

      <footer className="fc-shutterbar">
        <button type="button" className="fc-round" onClick={() => fileRef.current?.click()} aria-label="Use a photo">
          <Icon name="upload" />
        </button>
        <button type="button" className="fc-shutter" disabled={!live} onClick={() => void snap()} aria-label="Take the photo">
          <span />
        </button>
        <span className="fc-round is-ghost" aria-hidden="true" />
      </footer>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void pick(event)} />
    </section>,
    document.body,
  );
}
