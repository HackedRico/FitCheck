// =============================================================================
// Module Overview
// =============================================================================
// `once` shares one in-flight promise between every caller of a slow loader,
// such as a MediaPipe model or a garment photo, and forgets a failure so the
// next call can try again instead of replaying the error for the whole page.

/** Run `work` on the first call and hand every later call the same promise; a failure is retried. */
export function once<T>(work: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= work().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
