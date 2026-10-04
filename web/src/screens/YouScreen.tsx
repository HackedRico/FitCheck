import { useState, type ReactNode } from "react";

import { Icon } from "../components/Icons";
import { PhotoBooth } from "../components/PhotoBooth";
import { useObjectUrl } from "../lib/objectUrl";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The owner's person photo and settings. Taking a photo while a scan is open
// renders that garment on it at once and returns to the result, so adding a
// photo always pays off where the owner was.

/** Show, retake or delete the person photo. */
export function YouScreen(): ReactNode {
  const { person, flow, navigate, openSheet, settings } = useApp();
  const [booth, setBooth] = useState(false);
  const photoUrl = useObjectUrl(person.photo);
  const back = (): void => navigate(flow.frame ? "result" : "home");

  if (booth) {
    return (
      <PhotoBooth
        onCancel={() => setBooth(false)}
        onPhoto={async (photo) => {
          await person.save(photo);
          setBooth(false);
          if (flow.scan.status === "done") {
            flow.requestRender(photo, "photo");
            navigate("result");
          }
        }}
      />
    );
  }

  const take = (): void => {
    if (!person.consent) person.giveConsent();
    setBooth(true);
  };

  return (
    <section className="fc-page fc-you">
      <header className="fc-topbar is-solid">
        <button type="button" className="fc-round fc-back" onClick={back} aria-label="Back">
          <Icon name="arrow" />
        </button>
        <p className="fc-topbar-title">You</p>
        <button type="button" className="fc-round" onClick={() => openSheet("settings")} aria-label="Settings">
          <Icon name="gear" />
        </button>
      </header>

      <div className="fc-portrait" data-empty={photoUrl === null}>
        {photoUrl ? <img src={photoUrl} alt="Your photo" /> : <Icon name="person" />}
      </div>

      <div className="fc-you-copy">
        <p className="fc-kicker">{settings.owner}</p>
        <h1 className="display">{photoUrl ? "Ready to try things on" : "One photo, every garment"}</h1>
        <p className="fc-muted">
          Stand back, head to knees, plain wall if you can. The photo stays on this phone and goes only to our try-on
          renderer when a render runs. It is never saved there.
        </p>
        {person.storageError && <p className="fc-error">{person.storageError}</p>}
      </div>

      <div className="fc-you-actions">
        <button type="button" className="fc-btn is-primary" onClick={take}>
          <Icon name="camera" /> {photoUrl ? "Retake photo" : "Take my photo"}
        </button>
        {photoUrl && (
          <button type="button" className="fc-btn is-danger" onClick={() => void person.remove()}>
            <Icon name="trash" /> Delete photo
          </button>
        )}
      </div>
    </section>
  );
}
