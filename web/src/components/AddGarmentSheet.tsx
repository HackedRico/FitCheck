import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { api, errorMessage, pngFromBase64 } from "../api/client";
import { shrinkImage } from "../lib/camera";
import { useApp } from "../state/app";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// The other ways to bring a garment in when it is not on a rack in front of you:
// a photo from the device, or a link to a shop page or image for something you
// are eyeing online. Either one hands a garment image to `onGarment`, which runs
// the same scan and verdict as a camera snap.

interface AddGarmentSheetProps {
  open: boolean;
  onClose: () => void;
  onGarment: (image: Blob) => void;
}

/** Pick a photo or paste a shop link to judge a garment. */
export function AddGarmentSheet({ open, onClose, onGarment }: AddGarmentSheetProps): ReactNode {
  const { pipelines } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
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
          <h2>Judge a garment</h2>
          <button type="button" className="fc-round" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <form className="fc-linkform" onSubmit={(event) => void fetchLink(event)}>
          <label htmlFor="garment-link">Shopping online? Paste the product link</label>
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
          <button type="submit" className="fc-btn is-primary" disabled={busy || !url.trim()}>
            {busy ? "Getting the garment" : "Check this link"}
          </button>
          {error && <p className="fc-error">{error}</p>}
        </form>

        <div className="fc-or">or</div>

        <button type="button" className="fc-btn is-ghost" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" /> Choose a photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void pick(event)} />
      </section>
    </div>
  );
}
