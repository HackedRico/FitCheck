import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { Icon } from "../components/Icons";
import { captureFrame, shrinkImage, useCamera } from "../lib/camera";
import { useObjectUrl } from "../lib/objectUrl";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The person photo, taken once with the front camera after a plain-words
// consent screen. It stays on this device (memory and IndexedDB) and goes only
// to our own try-on renderer inside a render request. One button deletes it.

const COUNTDOWN_S = 3;

/** Consent, take and delete the person photo. */
export function MeScreen(): ReactNode {
  const { person } = useApp();
  const [retaking, setRetaking] = useState(false);
  const photoUrl = useObjectUrl(person.photo);
  const showCamera = person.consent && (person.photo === null || retaking);

  if (!person.consent) return <Consent onAgree={person.giveConsent} />;
  if (showCamera) return <PhotoBooth onDone={() => setRetaking(false)} />;

  return (
    <section className="me">
      <div className="me-photo">{photoUrl && <img src={photoUrl} alt="Your person photo" />}</div>
      <div className="me-copy">
        <p className="kicker">Your photo</p>
        <h1 className="display">Ready for renders</h1>
        <p className="muted">Kept on this device only. Sent only to our own try-on renderer when a render runs, and never saved there.</p>
        {person.storageError && <p className="error-line">{person.storageError}</p>}
        <div className="me-actions">
          <button type="button" className="btn btn-solid" onClick={() => setRetaking(true)}>
            <Icon name="camera" /> Retake
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void person.remove()}>
            <Icon name="trash" /> Delete photo
          </button>
        </div>
      </div>
    </section>
  );
}

function Consent({ onAgree }: { onAgree: () => void }): ReactNode {
  return (
    <section className="empty consent">
      <p className="kicker">Before your photo</p>
      <h1>Your photo, for renders only</h1>
      <p>
        Take one photo of yourself, standing, head to knees. It stays on this device. It is sent only to our own try-on
        renderer when you ask for a render, held in memory there, and never saved. You can delete it any time.
      </p>
      <button type="button" className="btn btn-solid" onClick={onAgree}>
        I agree, take my photo
      </button>
    </section>
  );
}

function PhotoBooth({ onDone }: { onDone: () => void }): ReactNode {
  const { person } = useApp();
  const camera = useCamera("user", true);
  const [count, setCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (count === null) return undefined;
    if (count === 0) {
      const video = camera.videoRef.current;
      setCount(null);
      if (video) {
        void captureFrame(video).then(async (photo) => {
          await person.save(photo);
          onDone();
        });
      }
      return undefined;
    }
    const timer = window.setTimeout(() => setCount(count - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [count, camera.videoRef, person, onDone]);

  const pick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    await person.save(await shrinkImage(file));
    onDone();
  };

  return (
    <section className="booth">
      <div className="stage">
        <video ref={camera.videoRef} className="stage-media is-mirrored" playsInline muted autoPlay />
        <span className="booth-guide" aria-hidden="true" />
        {count !== null && <span className="booth-count display">{count}</span>}
        {camera.error && <p className="stage-hint">{camera.error}</p>}
        <div className="shutter-row">
          <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Use a photo">
            <Icon name="upload" />
          </button>
          <button
            type="button"
            className="shutter"
            disabled={camera.status !== "live" || count !== null}
            onClick={() => setCount(COUNTDOWN_S)}
            aria-label={`Take the photo in ${COUNTDOWN_S} seconds`}
          />
          <span className="icon-btn is-ghost" aria-hidden="true" />
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void pick(event)} />
      </div>
      <p className="booth-note muted">Step back until your head and knees fit the frame. The shutter waits {COUNTDOWN_S} seconds.</p>
    </section>
  );
}
