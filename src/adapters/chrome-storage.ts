import type { StoragePort } from "../runtime/blur-runtime.js";

export const SETTINGS_KEY = "wa-blur:settings";
export const LOCK_KEY = "wa-blur:lock";

/**
 * Production storage adapter: the only place the content side touches
 * chrome.storage directly. Settings live as one object under one key
 * in chrome.storage.sync (spec, Implementation Decisions).
 */
export class ChromeStorageAdapter implements StoragePort {
  async get(): Promise<unknown> {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return result[SETTINGS_KEY];
  }

  async set(raw: unknown): Promise<void> {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: raw });
  }

  subscribe(fn: (raw: unknown) => void): () => void {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "sync") return;
      const change = changes[SETTINGS_KEY];
      if (change) fn(change.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }
}

/**
 * The Lock record's adapter: the same StoragePort shape over its own
 * key, `wa-blur:lock`. Separate key, separate adapter — the PIN
 * record never travels inside the Settings object, so a Settings
 * reset or export can neither carry nor clear it.
 */
export class ChromeLockStorageAdapter implements StoragePort {
  async get(): Promise<unknown> {
    const result = await chrome.storage.sync.get(LOCK_KEY);
    return result[LOCK_KEY];
  }

  async set(raw: unknown): Promise<void> {
    await chrome.storage.sync.set({ [LOCK_KEY]: raw });
  }

  subscribe(fn: (raw: unknown) => void): () => void {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "sync") return;
      const change = changes[LOCK_KEY];
      if (change) fn(change.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }
}
