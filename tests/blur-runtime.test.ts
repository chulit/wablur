import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type CssText } from "../src/engine/blur-engine.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { startBlurRuntime } from "../src/runtime/blur-runtime.js";

function collectSink() {
  const applied: CssText[] = [];
  return {
    applied,
    sink: (css: CssText) => {
      applied.push(css);
    },
  };
}

describe("BlurRuntime", () => {
  it("applies compiled CSS for the stored settings on start", async () => {
    const storage = new InMemoryStorageAdapter(undefined);
    const { applied, sink } = collectSink();
    const stop = await startBlurRuntime({ storage, styleSink: sink });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toContain("blur(8px)");
    stop();
  });

  it("re-applies when storage changes, replacing rather than accumulating", async () => {
    const storage = new InMemoryStorageAdapter(undefined);
    const { applied, sink } = collectSink();
    const stop = await startBlurRuntime({ storage, styleSink: sink });
    storage.set({ ...DEFAULT_SETTINGS, enabled: false });
    storage.set(undefined);
    expect(applied).toEqual([
      expect.stringContaining("blur(8px)"),
      "",
      expect.stringContaining("blur(8px)"),
    ]);
    stop();
  });

  it("falls back to defaults when storage read fails", async () => {
    const storage = {
      get: () => Promise.reject(new Error("storage unavailable")),
      set: () => Promise.resolve(),
      subscribe: () => () => {},
    };
    const { applied, sink } = collectSink();
    const stop = await startBlurRuntime({ storage, styleSink: sink });
    expect(applied[0]).toContain("blur(8px)");
    stop();
  });

  it("stops applying after stop() is called", async () => {
    const storage = new InMemoryStorageAdapter(undefined);
    const { applied, sink } = collectSink();
    const stop = await startBlurRuntime({ storage, styleSink: sink });
    stop();
    storage.set({ ...DEFAULT_SETTINGS, enabled: false });
    expect(applied).toHaveLength(1);
  });
});

describe("BlurRuntime sink contract (v1.7.5)", () => {
  it("calls the sink with exactly the compiled CSS — one argument, no cell plumbing", async () => {
    const calls: unknown[][] = [];
    const storage = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurStyle: "mosaic",
    });
    const stop = await startBlurRuntime({
      storage,
      styleSink: (...args: unknown[]) => {
        calls.push(args);
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
    // Mosaic rides the native path now: the mask grid is in the CSS
    // itself, nothing is planted alongside it.
    expect(calls[0]?.[0]).toContain("mask-image:repeating-linear-gradient");
    storage.set({ ...DEFAULT_SETTINGS, blurStyle: "mosaic", enabled: false });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([""]);
    stop();
  });
});
