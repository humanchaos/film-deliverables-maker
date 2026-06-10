/**
 * Persistent local video-file store backed by IndexedDB.
 *
 * Why this exists
 * ---------------
 * The two-pass shot-list pipeline runs client-side scene detection over the
 * raw video file (via a Blob URL). `URL.createObjectURL(file)` only lives for
 * the lifetime of the current document, and the `File` object is held only in
 * memory — so a page refresh wipes both, forcing a full Gemini Files API
 * re-upload (≈minutes for a 750 MB master) even though the Gemini file URI
 * itself is still valid for 48 hours.
 *
 * We stash the raw bytes in IndexedDB keyed by the Gemini file URI, so on
 * hydrate we can reattach a fresh Blob URL in ≈1 second without any network
 * traffic. Storage is one entry at a time — uploading a new file purges any
 * previous entry.
 *
 * Quotas: modern browsers allocate ~50% of free disk to a single origin, far
 * larger than even a multi-GB master. Calling `navigator.storage.persist()`
 * (best-effort, no UI prompt on most platforms) tells the browser not to evict
 * us under disk pressure — this is critical for files the user expects to find
 * again after closing the laptop overnight.
 */

const DB_NAME = "fdm_blob_store";
const DB_VERSION = 1;
const STORE = "videos";

interface StoredVideo {
  /** Gemini file URI — primary key. Uniquely identifies a video across sessions. */
  key: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  savedAt: string;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable in this context"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open blob IndexedDB"));
  });
  return _dbPromise;
}

/** Wrap an IDBRequest in a promise. */
function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
  });
}

/**
 * Save a video blob keyed by `key` (typically the Gemini file URI). Replaces
 * any previously-stored blob — we only keep ONE entry at a time, since the app
 * works on a single active project at a time.
 *
 * Best-effort requests persistent storage so the browser won't evict the file
 * under disk pressure. The user is never prompted on Chromium/Safari for this
 * — it's silently granted or silently denied.
 */
export async function saveVideoBlob(
  key: string,
  blob: Blob,
  meta: { name: string; type: string; size: number }
): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist().catch(() => false);
    }
  } catch { /* not fatal — fall through to write */ }

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Blob save transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Blob save transaction aborted"));
    const store = tx.objectStore(STORE);
    // Replace the single stored entry — clear first, then put. This bounds the
    // store at ONE video at a time, no matter how many keys have ever been used.
    store.clear();
    const entry: StoredVideo = {
      key, blob, name: meta.name, type: meta.type, size: meta.size,
      savedAt: new Date().toISOString(),
    };
    store.put(entry);
  });
}

/**
 * Load the blob matching `key`. Returns null if absent (no project, or evicted
 * for storage pressure). Callers should be ready to fall back to re-prompting
 * the user for the file.
 */
export async function loadVideoBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const result = await new Promise<StoredVideo | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as StoredVideo | undefined);
      req.onerror = () => reject(req.error ?? new Error("Blob load failed"));
    });
    return result?.blob ?? null;
  } catch (e) {
    console.warn("[blobStore] load failed:", e);
    return null;
  }
}

/** Remove all stored video blobs. Used when a project is deleted. */
export async function clearVideoBlobs(): Promise<void> {
  try {
    const db = await openDb();
    await asPromise(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
  } catch (e) {
    console.warn("[blobStore] clear failed:", e);
  }
}

/** Inspect what's currently stored — useful for the Settings panel diagnostic. */
export async function describeStoredVideo(): Promise<
  { key: string; name: string; sizeMB: number; savedAt: string } | null
> {
  try {
    const db = await openDb();
    const all = await new Promise<StoredVideo[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as StoredVideo[]);
      req.onerror = () => reject(req.error ?? new Error("Blob describe failed"));
    });
    if (all.length === 0) return null;
    const v = all[0];
    return { key: v.key, name: v.name, sizeMB: v.size / 1024 / 1024, savedAt: v.savedAt };
  } catch {
    return null;
  }
}
