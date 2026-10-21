import { describe, expect, it } from "vitest";
import {
  compileCss,
  DEFAULT_SETTINGS,
  resolveSettings,
} from "../src/engine/blur-engine.js";
import { CATALOGUE } from "../src/engine/catalogue.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { SettingsStore } from "../src/runtime/settings-store.js";
import { loadFixture, selectorsForLocale } from "./fixture-helpers.js";

/**
 * Ticket 09 hardening: the failure directions. Everything fails
 * toward blurred, nothing throws at the page, and one Blur Target's
 * breakage never leaks into another's.
 */
describe("legacy and corrupt Settings shapes", () => {
  it("a predecessor-shaped legacy object resolves to safe defaults", () => {
    // The shape another extension generation might leave behind:
    // none of its keys are ours, so nothing of it may leak through.
    const legacy = { on: true, styles: { messages: false }, blurOnIdle: { on: true } };
    expect(resolveSettings(legacy)).toEqual(DEFAULT_SETTINGS);
  });

  it("wrong-typed fields fall back per-field, never to an exposed state", () => {
    const s = resolveSettings({ enabled: "yes", mode: 42, targets: [true] });
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.enabled).toBe(true);
  });

  it("a stored v1.1.x object with hoverReveal migrates to a Mode", () => {
    // The v1.1.x persisted shape: hoverReveal false meant Reveal was
    // unavailable. Migration must preserve that choice as Screen
    // Share Mode, not silently re-enable Reveal for someone who
    // turned it off.
    const s = resolveSettings({ hoverReveal: false, blurPx: 12 });
    expect(s.mode).toBe("screen-share");
    expect(s.blurPx).toBe(12);
    expect("hoverReveal" in s).toBe(false);
    expect(resolveSettings({ hoverReveal: true }).mode).toBe("standard");
  });

  it("an array or class instance is not a Settings object", () => {
    expect(resolveSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(new Date())).toEqual(DEFAULT_SETTINGS);
  });
});

describe("storage write failure", () => {
  it("a rejecting write degrades instead of throwing at the caller", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    port.set = () => Promise.reject(new Error("QUOTA_BYTES quota exceeded"));
    const store = new SettingsStore(port);
    // The merged value is still handed back (in-memory truth for the
    // caller); persistence simply did not happen.
    const next = await store.patch({ targets: { media: false } });
    expect(next.targets.media).toBe(false);
    expect(await port.get()).toBeUndefined();
  });
});

describe("one target matching nothing leaves the others untouched", () => {
  it("removing a target's only fixture nodes changes nothing else", () => {
    const doc = loadFixture("whatsapp-en.html");
    // Break exactly one Names anchor: the dialog.
    doc.querySelector('[role="dialog"]')?.remove();
    expect(
      doc.querySelectorAll('div[role="dialog"] div.copyable-text'),
    ).toHaveLength(0);

    // Every other target still has matching selectors in the fixture…
    for (const def of CATALOGUE) {
      if (def.id === "names") continue;
      const matching = selectorsForLocale(def, "en").filter(
        (s) => doc.querySelectorAll(s).length > 0,
      );
      expect(matching.length, `${def.id} should still match`).toBeGreaterThan(0);
    }
    // …Names itself still matches through its other anchors…
    const names = CATALOGUE.find((d) => d.id === "names");
    expect(
      selectorsForLocale(names!, "en").some(
        (s) => doc.querySelectorAll(s).length > 0,
      ),
    ).toBe(true);
    // …and CSS emission never depended on the DOM in the first place.
    const css = compileCss(DEFAULT_SETTINGS);
    for (const def of CATALOGUE) {
      expect(
        def.selectors.some((s) => css.includes(`${s}{`)),
        `${def.id} rules still emitted`,
      ).toBe(true);
    }
  });
});
