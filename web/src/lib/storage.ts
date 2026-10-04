// =============================================================================
// Module Overview
// =============================================================================
// Small, typed wrappers over `localStorage` and IndexedDB. Settings live in
// `localStorage`; the person photo lives in IndexedDB on this device only and
// is never sent anywhere except our own try-on renderer (ADR 0003).

const DB_NAME = "fitcheck";
const STORE = "device";
const PERSON_KEY = "person-photo";

/** Read a string setting, or `fallback` when storage is empty or blocked. */
export function readSetting(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    // Private windows can throw on storage access; settings then last for the session
    return fallback;
  }
}

/** Save a string setting; a blocked storage keeps it for this session only. */
export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[storage] Could not save setting \`${key}\`; it lasts for this session only.`, error);
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed to open."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    });
  } finally {
    db.close();
  }
}

/** Load the saved person photo from this device, or `null` if there is none. */
export async function loadPersonPhoto(): Promise<Blob | null> {
  const value = await withStore<unknown>("readonly", (store) => store.get(PERSON_KEY));
  return value instanceof Blob ? value : null;
}

/** Save the person photo on this device. */
export async function savePersonPhoto(photo: Blob): Promise<void> {
  await withStore("readwrite", (store) => store.put(photo, PERSON_KEY));
}

/** Delete the person photo from this device. */
export async function deletePersonPhoto(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(PERSON_KEY));
}
