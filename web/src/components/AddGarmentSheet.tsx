import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { api, errorMessage, pngFromBase64 } from "../api/client";
import { shrinkImage } from "../lib/camera";
import { useApp } from "../state/app";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// Every way to bring a garment in besides the live camera: a link to a shop page
// or image, a photo taken now, or one from the device. Each hands one garment
// image to `onGarment`; the camera screen judges it, the closet stores it.

interface AddGarmentSheetProps {
  open: boolean;
  onClose: () => void;
  onGarment: (image: Blob) => void;
  title?: string;
  linkLabel?: string;
  // Shown while the caller is still handling the garment, such as tagging it for the closet
  busy?: boolean;
}

/** Paste a shop link, take a photo, or choose one, to bring in a garment. */
export function AddGarmentSheet({
  open,
  onClose,
  onGarment,
  title = "Judge a garment",
  linkLabel = "Shopping online? Paste the product link",
  busy: callerBusy = false,
}: AddGarmentSheetProps): ReactNode {
  const { pipelines } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const pick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onGarment(await shrinkImage(file));
  };

  const fetchLink = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const link = url.trim();
    if (!link || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.link(link);
      pipelines.record("scan", out.pipeline);
      setUrl("");
      onGarment(pngFromBase64(out.image_png_base64));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const paste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // Clipboard read needs a permission some browsers never grant; typing still works
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fc-addsheet" data-open={open} aria-hidden={!open}>
      <button type="button" className="fc-addsheet-scrim" tabIndex={-1} aria-label="Close" onClick={onClose} />
      <section className="fc-addsheet-card" role="dialog" aria-label="Add a garment" inert={!open}>
        <header className="fc-addsheet-head">
          <h2>{title}</h2>
          <button type="button" className="fc-round" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <form className="fc-linkform" onSubmit={(event) => void fetchLink(event)}>
          <label htmlFor="garment-link">{linkLabel}</label>
          <div className="fc-linkfield">
            <Icon name="link" />
            <input
              ref={inputRef}
              id="garment-link"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://shop.com/product"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            {!url && (
              <button type="button" className="fc-linkpaste" onClick={() => void paste()}>
                Paste
              </button>
            )}
          </div>
          <button type="submit" className="fc-btn is-primary" disabled={busy || callerBusy || !url.trim()}>
            {busy ? "Getting the garment" : callerBusy ? "Adding it" : "Use this link"}
          </button>
          {error && <p className="fc-error">{error}</p>}
        </form>

        <div className="fc-or">or</div>

        <div className="fc-addsheet-photos">
          <button type="button" className="fc-btn is-ghost" disabled={callerBusy} onClick={() => cameraRef.current?.click()}>
            <Icon name="camera" /> Take a photo
          </button>
          <button type="button" className="fc-btn is-ghost" disabled={callerBusy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Choose a photo
          </button>
        </div>
        {/* `capture` opens the rear camera on phones; desktops fall back to a file picker */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void pick(event)} />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void pick(event)} />
      </section>
    </div>
  );
}
