import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type CssText } from "../src/engine/blur-engine.js";
import { CATALOGUE } from "../src/engine/catalogue.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { SettingsStore } from "../src/runtime/settings-store.js";
import { startBlurRuntime } from "../src/runtime/blur-runtime.js";

describe("SettingsStore", () => {
  it("reads complete defaults when nothing is stored", async () => {
    const store = new SettingsStore(new InMemoryStorageAdapter(undefined));
    expect(await store.read()).toEqual(DEFAULT_SETTINGS);
  });

  it("patch writes one complete Settings object and reads it back", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const next = await store.patch({ targets: { media: false } });
    expect(next.targets.media).toBe(false);
    expect(next.targets.messages).toBe(true);
    // The persisted value is a single complete object, not a fragment.
    expect(await port.get()).toEqual(next);
    expect(await store.read()).toEqual(next);
  });

  it("patch merges without dropping previously stored choices", async () => {
    const store = new SettingsStore(new InMemoryStorageAdapter(undefined));
    await store.patch({ enabled: false });
    await store.patch({ targets: { names: false } });
    const s = await store.read();
    expect(s.enabled).toBe(false);
    expect(s.targets.names).toBe(false);
    expect(s.targets.media).toBe(true);
  });

  it("a corrupt stored value reads as defaults and patches into validity", async () => {
    const port = new InMemoryStorageAdapter({ targets: "all", blurPx: "lots" });
    const store = new SettingsStore(port);
    expect(await store.read()).toEqual(DEFAULT_SETTINGS);
    const next = await store.patch({ targets: { avatars: false } });
    expect(next.targets.avatars).toBe(false);
    expect(await port.get()).toEqual(next);
  });

  it("subscribe delivers resolved Settings on every stored change", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const seen: boolean[] = [];
    const unsub = store.subscribe((s) => seen.push(s.targets.media));
    await store.patch({ targets: { media: false } });
    await store.patch({ targets: { media: true } });
    unsub();
    expect(seen).toEqual([false, true]);
  });

  it("read failure degrades to defaults instead of throwing", async () => {
    const failingPort = {
      get: () => Promise.reject(new Error("sync unavailable")),
      set: () => Promise.resolve(),
      subscribe: () => () => {},
    };
    const store = new SettingsStore(failingPort);
    expect(await store.read()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("SettingsStore driving BlurRuntime (one seam, end to end)", () => {
  it("each patch produces exactly one replacement stylesheet", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const applied: CssText[] = [];
    const stop = await startBlurRuntime({
      storage: port,
      styleSink: (css) => applied.push(css),
    });
    expect(applied).toHaveLength(1);

    await store.patch({ targets: { messages: false } });
    expect(applied).toHaveLength(2);
    const messagesDef = CATALOGUE.find((d) => d.id === "messages");
    for (const sel of messagesDef?.selectors ?? []) {
      expect(applied[1]).not.toContain(`${sel}{`);
    }
    expect(applied[1]).toContain("blur(8px)");

    await store.patch({ targets: { messages: true } });
    expect(applied).toHaveLength(3);
    expect(applied[2]).toContain(".focusable-list-item{");
    stop();
  });
});

describe("SettingsStore blurStyle (v1.6.0)", () => {
  it("patch round-trips the Blur Style and preserves other fields", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const next = await store.patch({ blurStyle: "redact" });
    expect(next.blurStyle).toBe("redact");
    expect(next.blurPx).toBe(DEFAULT_SETTINGS.blurPx);
    expect(await port.get()).toEqual(next);
    expect((await store.read()).blurStyle).toBe("redact");
  });

  it("resetAll restores the classic blur style", async () => {
    const store = new SettingsStore(new InMemoryStorageAdapter(undefined));
    await store.patch({ blurStyle: "mosaic" });
    const reset = await store.resetAll();
    expect(reset.blurStyle).toBe("blur");
  });
});
