import { useState, type ReactNode } from "react";

import { Icon } from "../components/Icons";
import { PhotoBooth } from "../components/PhotoBooth";
import { useApp } from "../state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The first visit: what FitCheck does in three beats, then the person photo with
// its consent in plain words, or a skip straight to the camera. Shown once.

const STEPS = [
  { n: "01", title: "Your photo, once", body: "So every garment can be shown on you." },
  { n: "02", title: "Scan the garment", body: "Point at it on the rack. We read the tag." },
  { n: "03", title: "Get a straight answer", body: "Buy it, skip it, or try it with something you own." },
] as const;

/** Explain FitCheck in three beats and take the person photo. */
export function WelcomeScreen({ onDone }: { onDone: () => void }): ReactNode {
  const { person } = useApp();
  const [booth, setBooth] = useState(false);

  if (booth) {
    return (
      <PhotoBooth
        onCancel={() => setBooth(false)}
        onPhoto={async (photo) => {
          await person.save(photo);
          onDone();
        }}
      />
    );
  }

  const agree = (): void => {
    person.giveConsent();
    setBooth(true);
  };

  return (
    <section className="fc-welcome">
      <p className="fc-wordmark">
        Fit<span>Check</span>
      </p>

      <h1 className="fc-welcome-title">Should I buy this?</h1>
      <p className="fc-welcome-lede">A second opinion in the fitting-room line, checked against your closet, your weather and your week.</p>

      <ol className="fc-steps">
        {STEPS.map((step) => (
          <li key={step.n}>
            <span className="fc-step-n" aria-hidden="true">
              {step.n}
            </span>
            <span>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="fc-welcome-cta">
        <button type="button" className="fc-btn is-primary" onClick={agree}>
          <Icon name="person" /> Add my photo
        </button>
        <button type="button" className="fc-btn is-text" onClick={onDone}>
          Skip, start scanning
        </button>
        <p className="fc-fineprint">
          <Icon name="lock" /> Your photo stays on this phone. It is sent only to our try-on renderer when a render runs, and
          never saved there. Delete it any time.
        </p>
      </div>
    </section>
  );
}
