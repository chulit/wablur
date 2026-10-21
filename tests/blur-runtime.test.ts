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

describe("BlurRuntime Mosaic cell plumbing (v1.6.0)", () => {
  function collectCellSink() {
    const cells: (number | null | undefined)[] = [];
    return {
      cells,
      sink: (_css: CssText, cell?: number | null) => {
        cells.push(cell);
      },
    };
  }

  it("passes the cell derived from blurPx while Mosaic is active", async () => {
    const storage = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurStyle: "mosaic",
    });
    const { cells, sink } = collectCellSink();
    const stop = await startBlurRuntime({ storage, styleSink: sink });
    expect(cells).toEqual([6]); // blurPx 8 -> round(8 * 0.75)
    storage.set({ ...DEFAULT_SETTINGS, blurStyle: "mosaic", blurPx: 24 });
    expect(cells).toEqual([6, 18]);
    stop();
  });

  it("passes null for other styles and when the master Toggle is off", async () => {
    const storage = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurStyle: "frost",
    });
    const { cells, sink } = collectCellSink();
    const stop = await startBlurRuntime({ storage, styleSink: sink });
    storage.set({ ...DEFAULT_SETTINGS, blurStyle: "mosaic", enabled: false });
    expect(cells).toEqual([null, null]);
    stop();
  });
});
