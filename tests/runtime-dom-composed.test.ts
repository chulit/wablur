import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import {
  createDomStyleSink,
  LIVE_CLASS,
  STYLE_ELEMENT_ID,
} from "../src/adapters/dom-style-sink.js";
import { DEFAULT_SETTINGS } from "../src/engine/blur-engine.js";
import { startBlurRuntime } from "../src/runtime/blur-runtime.js";

/**
 * Composed test (ticket 01 code-review, Spec axis finding a): the
 * ticket's AC "the runtime owns exactly one style element after
 * repeated application" is only proven when the runtime drives the
 * real DomStyleSink — not a string sink in one test and the DOM sink
 * in another.
 */
describe("BlurRuntime composed with DomStyleSink", () => {
  it("keeps exactly one style element across repeated storage changes", async () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const doc = dom.window.document;
    const storage = new InMemoryStorageAdapter(undefined);
    const stop = await startBlurRuntime({
      storage,
      styleSink: createDomStyleSink(doc),
    });

    storage.set({ ...DEFAULT_SETTINGS, enabled: false });
    storage.set({ targets: { messages: false } });
    storage.set(undefined);

    const all = doc.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(all).toHaveLength(1);
    expect(all[0]?.textContent).toContain("blur(8px)");
    // And the static stylesheet has been scoped off by the takeover mark.
    expect(doc.documentElement.classList.contains(LIVE_CLASS)).toBe(true);
    stop();
  });
});
