import type { StoragePort } from "../runtime/blur-runtime.js";

export const SETTINGS_KEY = "wa-blur:settings";

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
