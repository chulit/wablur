import { describe, expect, it } from "vitest";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { SettingsStore } from "../src/runtime/settings-store.js";

class CountingPort extends InMemoryStorageAdapter {
  writes = 0;
  override async set(raw: unknown): Promise<void> {
    this.writes += 1;
    return super.set(raw);
  }
}

describe("SettingsStore intensity writes", () => {
  it("patched blurPx values outside 4..24 resolve into range", async () => {
    const store = new SettingsStore(new InMemoryStorageAdapter(undefined));
    expect((await store.patch({ blurPx: 999 })).blurPx).toBe(24);
    expect((await store.patch({ blurPx: 1 })).blurPx).toBe(4);
  });

  it("the chosen intensity persists for a fresh store over the same storage", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    await new SettingsStore(port).patch({ blurPx: 14 });
    // A new store instance = a browser restart's view of the same storage.
    expect((await new SettingsStore(port).read()).blurPx).toBe(14);
  });

  it("a simulated slider drag coalesces into a single write", async () => {
    const port = new CountingPort(undefined);
    const store = new SettingsStore(port, { debounceMs: 10 });
    const pending = [9, 10, 11, 12, 13].map((px) => store.patchSoon({ blurPx: px }));
    const results = await Promise.all(pending);
    expect(port.writes).toBe(1);
    expect(results.at(-1)?.blurPx).toBe(13);
    expect((await store.read()).blurPx).toBe(13);
  });

  it("patchSoon merges different fields into the one coalesced write", async () => {
    const port = new CountingPort(undefined);
    const store = new SettingsStore(port, { debounceMs: 10 });
    const a = store.patchSoon({ targets: { media: false } });
    const b = store.patchSoon({ blurPx: 10 });
    await Promise.all([a, b]);
    expect(port.writes).toBe(1);
    const s = await store.read();
    expect(s.targets.media).toBe(false);
    expect(s.blurPx).toBe(10);
  });

  it("an immediate patch flushes a pending debounced patch first", async () => {
    const port = new CountingPort(undefined);
    const store = new SettingsStore(port, { debounceMs: 10 });
    const soon = store.patchSoon({ blurPx: 20 });
    await store.patch({ enabled: false });
    await soon;
    const s = await store.read();
    expect(s.blurPx).toBe(20);
    expect(s.enabled).toBe(false);
  });
});
