import { useEffect, useState } from "react";

// =============================================================================
// Module Overview
// =============================================================================
// `useObjectUrl` gives a component an `<img src>` for an in-memory `Blob` and
// revokes it when the blob changes or the component unmounts, so person photos
// and renders never pile up as leaked object URLs.

/** An object URL for `blob` that lives exactly as long as the component holds the blob. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob === null) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}
