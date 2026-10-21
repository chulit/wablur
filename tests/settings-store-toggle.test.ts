import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/engine/blur-engine.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { SettingsStore } from "../src/runtime/settings-store.js";

class CountingPort extends InMemoryStorageAdapter {
  writes = 0;
  override async set(raw: unknown): Promise<void> {
    this.writes += 1;
    return super.set(raw);
  }
}

describe("SettingsStore master Toggle and seeding (worker paths)", () => {
  it("toggleMaster flips enabled and preserves everything else", async () => {
    const store = new SettingsStore(new InMemoryStorageAdapter(undefined));
    await store.patch({ mode: "screen-share", targets: { media: false } });
    const off = await store.toggleMaster();
    expect(off.enabled).toBe(false);
    expect(off.mode).toBe("screen-share");
    expect(off.targets.media).toBe(false);
    const on = await store.toggleMaster();
    expect(on.enabled).toBe(true);
    expect(on).toEqual(await store.read());
  });

  it("ensureSeeded materialises defaults exactly once, only when absent", async () => {
    const port = new CountingPort(undefined);
    const store = new SettingsStore(port);
    await store.ensureSeeded();
    expect(port.writes).toBe(1);
    expect(await port.get()).toEqual(DEFAULT_SETTINGS);
    await store.ensureSeeded();
    expect(port.writes).toBe(1);
  });

  it("ensureSeeded never overwrites existing Settings", async () => {
    const existing = { ...DEFAULT_SETTINGS, blurPx: 21 };
    const port = new CountingPort(existing);
    const store = new SettingsStore(port);
    await store.ensureSeeded();
    expect(port.writes).toBe(0);
    expect((await store.read()).blurPx).toBe(21);
  });
});
