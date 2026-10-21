import { describe, expect, it } from "vitest";
import { compileCss, DEFAULT_SETTINGS, resolveSettings, toggle } from "../src/engine/blur-engine.js";

describe("toggle", () => {
  it("flips only the master flag, preserving targets, mode, and intensity", () => {
    const s = resolveSettings({
      enabled: true,
      mode: "screen-share",
      blurPx: 15,
      targets: { media: false, names: false },
    });
    const off = toggle(s);
    expect(off.enabled).toBe(false);
    expect(off.mode).toBe("screen-share");
    expect(off.blurPx).toBe(15);
    expect(off.targets).toEqual(s.targets);
    expect(s.enabled).toBe(true); // input not mutated
  });

  it("round-trips: toggle ∘ toggle is identity", () => {
    for (const raw of [
      undefined,
      { enabled: false },
      { mode: "screen-share", blurPx: 20, targets: { avatars: false } },
    ]) {
      const s = resolveSettings(raw);
      expect(toggle(toggle(s))).toEqual(s);
    }
  });
});
import { ALL_TARGET_IDS, CATALOGUE } from "../src/engine/catalogue.js";

describe("catalogue completeness", () => {
  it("has exactly one entry per Blur Target, each enabled by default", () => {
    expect(CATALOGUE.map((d) => d.id).sort()).toEqual([...ALL_TARGET_IDS].sort());
    for (const def of CATALOGUE) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.selectors.length).toBeGreaterThan(0);
      expect(def.defaultEnabled).toBe(true);
    }
  });
});

/** Selector of every rule in a CssText, with any :hover suffix stripped. */
function ruleSelectors(css: string): string[] {
  return css
    .split("\n")
    .filter((line) => line.includes("{"))
    .map((line) => line.slice(0, line.indexOf("{")).replace(/:hover$/, ""));
}

describe("resolveSettings", () => {
  it("returns complete defaults for undefined input", () => {
    expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns complete defaults for non-object input", () => {
    expect(resolveSettings("junk")).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps blurPx into 4..24 and rounds it", () => {
    expect(resolveSettings({ blurPx: 999 }).blurPx).toBe(24);
    expect(resolveSettings({ blurPx: 0 }).blurPx).toBe(4);
    expect(resolveSettings({ blurPx: 10.6 }).blurPx).toBe(11);
    expect(resolveSettings({ blurPx: "strong" }).blurPx).toBe(8);
  });

  it("keeps valid fields, drops invalid ones per-field, ignores unknown keys", () => {
    const s = resolveSettings({
      enabled: false,
      mode: "screen-share",
      blurPx: 12,
      targets: { names: false, bogus: true },
      somethingElse: "x",
    });
    expect(s.enabled).toBe(false);
    expect(s.mode).toBe("screen-share");
    expect(s.blurPx).toBe(12);
    expect(s.targets.names).toBe(false);
    expect(s.targets.messages).toBe(true);
    expect("somethingElse" in s).toBe(false);
    expect("hoverReveal" in s).toBe(false);
  });

  it("falls back per-field when targets is not an object", () => {
    const s = resolveSettings({ targets: "all" });
    expect(s.targets).toEqual(DEFAULT_SETTINGS.targets);
  });

  it("uses a valid stored mode as-is and defaults a bogus one", () => {
    expect(resolveSettings({ mode: "screen-share" }).mode).toBe("screen-share");
    expect(resolveSettings({ mode: "standard" }).mode).toBe("standard");
    expect(resolveSettings({ mode: "bogus" }).mode).toBe("standard");
  });

  it("migrates the v1.1.x hoverReveal flag when no mode is stored", () => {
    // v1.1.x persisted hoverReveal instead of mode: false meant
    // Reveal was unavailable (Screen Share), true meant it was
    // available (Standard). The migration must preserve the choice.
    expect(resolveSettings({ hoverReveal: false }).mode).toBe("screen-share");
    expect(resolveSettings({ hoverReveal: true }).mode).toBe("standard");
    // The migrated key itself is dropped, like any unknown key.
    expect("hoverReveal" in resolveSettings({ hoverReveal: false })).toBe(false);
  });

  it("an explicit mode wins over a legacy hoverReveal flag", () => {
    expect(
      resolveSettings({ mode: "screen-share", hoverReveal: true }).mode,
    ).toBe("screen-share");
    expect(
      resolveSettings({ mode: "standard", hoverReveal: false }).mode,
    ).toBe("standard");
  });
});

describe("compileCss", () => {
  it("emits a base blur rule for Messages at the default intensity", () => {
    const css = compileCss(DEFAULT_SETTINGS);
    expect(css).toContain("blur(8px)");
    expect(css).toContain(".focusable-list-item");
  });

  it("emits nothing when the master switch is off", () => {
    expect(compileCss({ ...DEFAULT_SETTINGS, enabled: false })).toBe("");
  });

  it("emits no Messages rule when the Messages target is off", () => {
    // Assert on rule selectors, not substrings: other targets may
    // legitimately anchor inside message structure (e.g. Media uses
    // `.focusable-list-item img`), so a substring check would be wrong.
    const s = resolveSettings({ targets: { messages: false } });
    const selectors = ruleSelectors(compileCss(s));
    const def = CATALOGUE.find((d) => d.id === "messages");
    for (const sel of def?.selectors ?? []) {
      expect(selectors).not.toContain(sel);
    }
  });

  it("emits at least one base rule for every enabled Blur Target", () => {
    const selectors = ruleSelectors(compileCss(DEFAULT_SETTINGS));
    for (const def of CATALOGUE) {
      expect(
        def.selectors.some((s) => selectors.includes(s)),
        `target should emit rules: ${def.id}`,
      ).toBe(true);
    }
  });

  it("applies per-target multipliers (research defaults at global 8px)", () => {
    // Evidence (research.md §3.2): messages 8px, names 5px, media 20px.
    const css = compileCss(DEFAULT_SETTINGS);
    const pxFor = (id: string): number => {
      const def = CATALOGUE.find((d) => d.id === id);
      const line = css
        .split("\n")
        .find((l) => l.startsWith(`${def?.selectors[0]}{`));
      const m = line?.match(/blur\((\d+)px\)/);
      return m ? Number(m[1]) : Number.NaN;
    };
    expect(pxFor("messages")).toBe(8);
    expect(pxFor("names")).toBe(5);
    expect(pxFor("media")).toBe(20);
    // Chat Header runs at double: its large bold name stayed legible
    // at the plain global intensity in the 2026-10-21 live probe.
    expect(pxFor("chatHeader")).toBe(16);
    expect(pxFor("avatars")).toBeLessThan(pxFor("messages"));
  });

  it("Standard Mode: exactly one hover rule per base rule, 300ms reveal delay, instant re-blur", () => {
    const css = compileCss(resolveSettings({ mode: "standard" }));
    const lines = css.split("\n").filter((l) => l.includes("{"));
    const base = lines.filter((l) => !l.includes(":hover"));
    const hover = lines.filter((l) => l.includes(":hover"));
    expect(base.length).toBeGreaterThan(0);
    expect(hover.length).toBe(base.length);
    // Reveal waits for a 300ms rest (the LukasLen transition-delay
    // pattern, research.md §3.2) — and every base rule carries a 0s
    // delay so re-blur on cursor leave is immediate.
    for (const l of hover) expect(l).toContain("transition-delay:0.3s");
    for (const l of hover) expect(l).toContain("filter:none !important");
    for (const l of base) expect(l).toContain("transition-delay:0s");
  });

  it("Screen Share Mode: zero hover rules, base blur still emitted", () => {
    const css = compileCss(resolveSettings({ mode: "screen-share" }));
    expect(css).not.toContain(":hover");
    expect(css).toContain("blur(8px)");
  });

  it("emits zero rules for a disabled target and keeps the others", () => {
    for (const off of CATALOGUE) {
      const s = resolveSettings({ targets: { [off.id]: false } });
      const selectors = ruleSelectors(compileCss(s));
      for (const sel of off.selectors) {
        expect(selectors, `${off.id} off should emit nothing`).not.toContain(sel);
      }
      for (const other of CATALOGUE) {
        if (other.id === off.id) continue;
        expect(
          other.selectors.some((sel) => selectors.includes(sel)),
          `${other.id} should still emit while ${off.id} is off`,
        ).toBe(true);
      }
    }
  });
});
