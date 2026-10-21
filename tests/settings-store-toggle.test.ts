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

  it("toggleMode flips Standard <-> Screen Share and preserves everything else", async () => {
    const store = new SettingsStore(new InMemoryStorageAdapter(undefined));
    await store.patch({
      enabled: false,
      blurPx: 14,
      revealDelayMs: 500,
      multipliers: { media: 1.5 },
      targets: { names: false },
    });
    const share = await store.toggleMode();
    expect(share.mode).toBe("screen-share");
    expect(share.enabled).toBe(false);
    expect(share.blurPx).toBe(14);
    expect(share.revealDelayMs).toBe(500);
    expect(share.multipliers).toEqual({ media: 1.5 });
    expect(share.targets.names).toBe(false);
    const back = await store.toggleMode();
    expect(back.mode).toBe("standard");
    expect(back).toEqual(await store.read());
  });

  it("resetAll restores every field to the defaults", async () => {
    const store = new SettingsStore(new InMemoryStorageAdapter(undefined));
    await store.patch({
      enabled: false,
      mode: "screen-share",
      blurPx: 20,
      revealDelayMs: 700,
      multipliers: { media: 3 },
      targets: { names: false, media: false },
    });
    expect(await store.resetAll()).toEqual(DEFAULT_SETTINGS);
    expect(await store.read()).toEqual(DEFAULT_SETTINGS);
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
