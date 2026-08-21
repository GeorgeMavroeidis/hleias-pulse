import { useEffect, useState } from "react";

// On-device image cache for map markers (and anything else that wants it).
//
// Pipeline: remote URL -> fetch once -> decode -> downscale to a small
// thumbnail on a <canvas> -> re-encode as WebP/JPEG -> store the compressed
// Blob in IndexedDB (persists across sessions) -> hand back a blob: URL.
//
// Why: map markers render at ~48-80px, but the source images are often
// 1200-2000px (Wikimedia/CDN). Resizing cuts payload ~50-100x and makes the
// map load fast on repeat visits / offline, straight from the device.
//
// It degrades gracefully: if an image can't be processed (CORS-tainted fetch,
// decode failure, no IndexedDB, SSR), it resolves to the original remote URL,
// so rendering never breaks.

const DB_NAME = "hp-image-cache";
const DB_VERSION = 1;
const STORE = "images";
const MAX_ENTRIES = 800;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const CONCURRENCY = 6;
const DEFAULT_SIZE = 256; // longest edge; covers 2x retina for ~128px markers

const memory = new Map<string, { url: string; lastUsed: number }>();
const inflight = new Map<string, Promise<string>>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

type CacheRecord = {
  key: string;
  blob: Blob;
  createdAt: number;
  lastUsed: number;
  bytes: number;
};

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("lastUsed", "lastUsed");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

// Detect WebP encode support once (WebP ~30% smaller than JPEG at equal quality).
let encodeType: "image/webp" | "image/jpeg" = "image/jpeg";
if (typeof document !== "undefined") {
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    if (probe.toDataURL("image/webp").startsWith("data:image/webp")) {
      encodeType = "image/webp";
    }
  } catch {
    /* keep jpeg fallback */
  }
}
const ENCODE_QUALITY = 0.8;

async function fetchAndResize(src: string, size: number): Promise<Blob> {
  // `mode: "cors"` -> a server without ACAO rejects here, which we catch and
  // fall back from. We never attempt no-cors (opaque) since the canvas would
  // be tainted and toBlob would throw.
  const res = await fetch(src, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`fetch-${res.status}`);
  const raw = await res.blob();
  if (!raw.type.startsWith("image/")) throw new Error("not-image");

  const bitmap = await createImageBitmap(raw);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, size / longest); // never upscale
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d-context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), encodeType, ENCODE_QUALITY),
    );
    if (!out) throw new Error("encode-failed");
    return out;
  } finally {
    bitmap.close?.();
  }
}

// Simple concurrency gate so a cold cache (dozens of images) doesn't fan out
// into 50 simultaneous fetches+decodes and jank the UI.
let active = 0;
const queue: Array<() => void> = [];
function throttle<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          const next = queue.shift();
          if (next) next();
        });
    };
    if (active < CONCURRENCY) run();
    else queue.push(run);
  });
}

async function evict(db: IDBDatabase): Promise<void> {
  try {
    const count = (await asPromise(store(db, "readonly").count())) as number;
    if (count <= MAX_ENTRIES) return;
    const idx = store(db, "readonly").index("lastUsed");
    const req = idx.openCursor();
    let toRemove = count - MAX_ENTRIES;
    await new Promise<void>((resolve) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && toRemove > 0) {
          cursor.delete();
          toRemove -= 1;
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Resolve a remote image URL to a cached blob: URL (compressed + resized).
 * On any failure, resolves to the original `src` so callers can always use the
 * returned value directly.
 */
export function getCachedImage(src: string, size = DEFAULT_SIZE): Promise<string> {
  if (!src || typeof document === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(src);
  }
  const key = `${src}#${size}`;

  const cached = memory.get(key);
  if (cached) {
    cached.lastUsed = Date.now();
    return Promise.resolve(cached.url);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      const db = await openDB();

      // 1) Persistent hit?
      if (db) {
        const rec = (await asPromise(store(db, "readonly").get(key))) as CacheRecord | undefined;
        if (rec && Date.now() - rec.createdAt < CACHE_TTL_MS) {
          const blobUrl = URL.createObjectURL(rec.blob);
          memory.set(key, { url: blobUrl, lastUsed: Date.now() });
          asPromise(store(db, "readwrite").put({ ...rec, lastUsed: Date.now() })).catch(() => {});
          return blobUrl;
        }
      }

      // 2) Miss -> fetch, shrink, cache.
      const blob = await throttle(() => fetchAndResize(src, size));
      const blobUrl = URL.createObjectURL(blob);
      memory.set(key, { url: blobUrl, lastUsed: Date.now() });

      if (db) {
        const rec: CacheRecord = {
          key,
          blob,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          bytes: blob.size,
        };
        asPromise(store(db, "readwrite").put(rec))
          .then(() => evict(db))
          .catch(() => {});
      }
      return blobUrl;
    } catch {
      // CORS / decode / quota failure -> just use the remote URL.
      return src;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/** Wipe the persistent cache (e.g. for a "clear cache" action). */
export async function clearImageCache(): Promise<void> {
  memory.forEach((entry) => URL.revokeObjectURL(entry.url));
  memory.clear();
  inflight.clear();
  const db = await openDB();
  if (!db) return;
  try {
    await asPromise(store(db, "readwrite").clear());
  } catch {
    /* ignore */
  }
}

/**
 * Resolve a batch of URLs over time. Returns a Map<originalUrl, blobUrl> that
 * grows as each image resolves (empty string / unresolved URLs are omitted, so
 * callers fall back to the source URL until ready).
 */
export function useImageUrls(urls: string[], size = DEFAULT_SIZE): Map<string, string> {
  const [resolved, setResolved] = useState<Map<string, string>>(() => new Map());
  // Stable identity: depend on the actual URL set, not the array reference.
  const key = urls.filter(Boolean).join("\n");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const unique = Array.from(new Set(key.split("\n")));
    unique.forEach((url) => {
      getCachedImage(url, size).then((blobUrl) => {
        if (cancelled || !blobUrl || blobUrl === url) return;
        setResolved((prev) => {
          if (prev.get(url) === blobUrl) return prev;
          const next = new Map(prev);
          next.set(url, blobUrl);
          return next;
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, size]);

  return resolved;
}
