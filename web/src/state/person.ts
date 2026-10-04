import { useCallback, useEffect, useState } from "react";

import { deletePersonPhoto, loadPersonPhoto, readSetting, savePersonPhoto, writeSetting } from "../lib/storage";

// =============================================================================
// Module Overview
// =============================================================================
// The owner's person photo on this device. It is held in memory and in
// IndexedDB, never in `localStorage`, a server database or a log, and leaves the
// phone only inside a `/render` request to our own try-on renderer (ADR 0003).
// Consent is asked once and remembered; deleting the photo also withdraws it.

const CONSENT_KEY = "fitcheck.personConsent";

export interface PersonState {
  consent: boolean;
  giveConsent: () => void;
  photo: Blob | null;
  save: (photo: Blob) => Promise<void>;
  remove: () => Promise<void>;
  storageError: string | null;
}

/** The person photo and its consent flag, loaded from this device on start. */
export function usePersonPhoto(): PersonState {
  const [consent, setConsent] = useState(() => readSetting(CONSENT_KEY, "no") === "yes");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    loadPersonPhoto()
      .then((saved) => {
        if (!cancelled && saved) setPhoto((current) => current ?? saved);
      })
      .catch((error: unknown) => {
        console.warn("[person] Could not read the saved person photo; take a new one.", error);
      });
    return () => {
      cancelled = true;
    };
  }, [consent]);

  const giveConsent = useCallback(() => {
    writeSetting(CONSENT_KEY, "yes");
    setConsent(true);
  }, []);

  const save = useCallback(async (next: Blob) => {
    // Memory first: the photo works for this session even when IndexedDB is blocked
    setPhoto(next);
    try {
      await savePersonPhoto(next);
      setStorageError(null);
    } catch (error) {
      console.warn("[person] Could not save the person photo on this device.", error);
      setStorageError("Saved for this session only. This browser blocked on-device storage.");
    }
  }, []);

  const remove = useCallback(async () => {
    setPhoto(null);
    writeSetting(CONSENT_KEY, "no");
    setConsent(false);
    try {
      await deletePersonPhoto();
      setStorageError(null);
    } catch (error) {
      console.warn("[person] Could not delete the saved person photo.", error);
      setStorageError("Could not clear on-device storage. Clear this site's data in the browser.");
    }
  }, []);

  return { consent, giveConsent, photo, save, remove, storageError };
}
