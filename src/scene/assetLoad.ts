/**
 * Shared JPEG texture loads for the theater (Earth, Moon, stars, Starbase).
 * Bootstrap kicks these off; the loading overlay waits on {@link waitForAssets}.
 */

import * as THREE from "three";

type ProgressFn = (loaded: number, total: number) => void;

let loaded = 0;
let total = 0;
const listeners = new Set<ProgressFn>();
const waiters: Array<() => void> = [];

function notify(): void {
  for (const fn of listeners) fn(loaded, total);
  if (loaded >= total) {
    const done = waiters.splice(0);
    for (const w of done) w();
  }
}

/** Reset the in-flight count before a theater bootstrap. */
export function beginAssetBatch(): void {
  loaded = 0;
  total = 0;
  waiters.length = 0;
}

/** Subscribe to JPEG load progress. Returns an unsubscribe function. */
export function onAssetProgress(fn: ProgressFn): () => void {
  listeners.add(fn);
  fn(loaded, total);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Resolve when every {@link loadTextureAsset} in the current batch has
 * succeeded or fallen back. Completes immediately if nothing was queued.
 */
export function waitForAssets(): Promise<void> {
  return new Promise((resolve) => {
    if (loaded >= total) {
      resolve();
      return;
    }
    waiters.push(resolve);
  });
}

/**
 * [0, 1] completion for the loading bar. Empty batch is treated as done.
 *
 * @param done - Finished items
 * @param all - Queued items
 */
export function assetLoadFraction(done: number, all: number): number {
  if (all <= 0) return 1;
  return Math.min(1, Math.max(0, done / all));
}

/**
 * Status line for the overlay (`n of m` while JPEGs are in flight).
 *
 * @param done - Finished items
 * @param all - Queued items
 */
export function assetLoadStatus(done: number, all: number): string {
  if (all <= 0) return "Loading mission…";
  if (done >= all) return "Ready";
  return `Loading textures… ${done} of ${all}`;
}

/**
 * Fetch a theater JPEG. Failure resolves `null` so callers can keep a
 * procedural fallback; the batch still counts the item as finished.
 *
 * @param url - Absolute or base-relative texture URL
 */
export function loadTextureAsset(url: string): Promise<THREE.Texture | null> {
  total += 1;
  notify();
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        loaded += 1;
        notify();
        resolve(tex);
      },
      undefined,
      () => {
        loaded += 1;
        notify();
        resolve(null);
      },
    );
  });
}
