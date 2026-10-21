import type { StoragePort } from "../runtime/blur-runtime.js";

/**
 * Test adapter for the storage seam: a faithful in-memory stand-in
 * for chrome.storage (production adapter: chrome-storage.ts).
 * `set` simulates a persisted change and notifies subscribers,
 * mirroring chrome.storage.onChanged.
 */
export class InMemoryStorageAdapter implements StoragePort {
  private listeners = new Set<(raw: unknown) => void>();

  constructor(private raw: unknown) {}

  get(): Promise<unknown> {
    return Promise.resolve(this.raw);
  }

  async set(raw: unknown): Promise<void> {
    this.raw = raw;
    for (const fn of this.listeners) fn(raw);
  }

  subscribe(fn: (raw: unknown) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
