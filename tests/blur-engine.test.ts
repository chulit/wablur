import { describe, expect, it } from "vitest";
import {
  compileCss,
  DEFAULT_SETTINGS,
  mosaicCellSize,
  parseSettings,
  resolveSettings,
  serializeSettings,
  toggle,
} from "../src/engine/blur-engine.js";

describe("toggle", () => {
  it("flips only the master flag, preserving targets, mode, and intensity", () => {
    const s = resolveSettings({
      enabled: true,
      mode: "screen-share",
      blurPx: 15,
      revealDelayMs: 500,
      multipliers: { media: 1.5 },
      targets: { media: false, names: false },
    });
    const off = toggle(s);
    expect(off.enabled).toBe(false);
    expect(off.mode).toBe("screen-share");
    expect(off.blurPx).toBe(15);
    expect(off.revealDelayMs).toBe(500);
    expect(off.multipliers).toEqual({ media: 1.5 });
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

  it("defaults the Reveal delay to 300ms and clamps it into 100..800", () => {
    expect(resolveSettings(undefined).revealDelayMs).toBe(300);
    expect(resolveSettings({ revealDelayMs: 250 }).revealDelayMs).toBe(250);
    expect(resolveSettings({ revealDelayMs: 50 }).revealDelayMs).toBe(100);
    expect(resolveSettings({ revealDelayMs: 5000 }).revealDelayMs).toBe(800);
    expect(resolveSettings({ revealDelayMs: "slow" }).revealDelayMs).toBe(300);
    expect(resolveSettings({ revealDelayMs: Number.NaN }).revealDelayMs).toBe(300);
  });

  it("resolves multiplier overrides: known ids only, finite, clamped to 0.5..3", () => {
    expect(resolveSettings(undefined).multipliers).toEqual({});
    expect(resolveSettings({ multipliers: "lots" }).multipliers).toEqual({});
    const s = resolveSettings({
      multipliers: {
        media: 1.5,
        names: 0.1, // clamped up to 0.5
        avatars: 99, // clamped down to 3
        previews: "strong", // dropped: not a number
        chatHeader: Number.NaN, // dropped: not finite
        bogus: 2, // dropped: not a Blur Target
      },
    });
    expect(s.multipliers).toEqual({ media: 1.5, names: 0.5, avatars: 3 });
  });
});

describe("serializeSettings / parseSettings", () => {
  it("round-trips a resolved Settings through JSON", () => {
    const s = resolveSettings({
      mode: "screen-share",
      blurPx: 12,
      revealDelayMs: 450,
      multipliers: { media: 1.5 },
      targets: { names: false },
    });
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it("serialises to a JSON document of the complete Settings", () => {
    const parsed = JSON.parse(serializeSettings(DEFAULT_SETTINGS)) as unknown;
    expect(parsed).toEqual(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  });

  it("returns null for text that is not a JSON object", () => {
    expect(parseSettings("not json")).toBeNull();
    expect(parseSettings("")).toBeNull();
    expect(parseSettings("[1,2,3]")).toBeNull();
    expect(parseSettings("42")).toBeNull();
    expect(parseSettings('"settings"')).toBeNull();
  });

  it("a partial or older export resolves into complete Settings", () => {
    const s = parseSettings('{"blurPx": 10, "hoverReveal": false}');
    expect(s).not.toBeNull();
    expect(s?.blurPx).toBe(10);
    expect(s?.mode).toBe("screen-share"); // legacy key still migrates
    expect(s?.revealDelayMs).toBe(300);
    expect(s?.multipliers).toEqual({});
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

  it("formats the Reveal delay compactly in hover rules (250 -> 0.25s, 800 -> 0.8s)", () => {
    for (const [ms, expected] of [
      [100, "0.1s"],
      [250, "0.25s"],
      [450, "0.45s"],
      [800, "0.8s"],
    ] as const) {
      const css = compileCss(resolveSettings({ revealDelayMs: ms }));
      const hover = css.split("\n").filter((l) => l.includes(":hover"));
      expect(hover.length).toBeGreaterThan(0);
      for (const l of hover) {
        expect(l).toContain(`transition-delay:${expected}`);
      }
      // Base rules keep the 0s delay: re-blur stays immediate
      // whatever the Reveal delay is.
      const base = css.split("\n").filter((l) => !l.includes(":hover"));
      for (const l of base) expect(l).toContain("transition-delay:0s");
    }
  });

  it("a custom Reveal delay never resurrects hover rules in Screen Share Mode", () => {
    const css = compileCss(
      resolveSettings({ mode: "screen-share", revealDelayMs: 800 }),
    );
    expect(css).not.toContain(":hover");
  });

  it("multiplier overrides replace the catalogue multiplier per target", () => {
    const pxFor = (css: string, id: string): number => {
      const def = CATALOGUE.find((d) => d.id === id);
      const line = css
        .split("\n")
        .find((l) => l.startsWith(`${def?.selectors[0]}{`));
      const m = line?.match(/blur\((\d+)px\)/);
      return m ? Number(m[1]) : Number.NaN;
    };
    // Media defaults to ×2.5 (20px at global 8); an override of ×1
    // brings it in line with Messages, and an override on Names
    // replaces its ×0.6.
    const css = compileCss(
      resolveSettings({ multipliers: { media: 1, names: 2 } }),
    );
    expect(pxFor(css, "media")).toBe(8);
    expect(pxFor(css, "names")).toBe(16);
    // Untouched targets keep their catalogue multipliers.
    expect(pxFor(css, "chatHeader")).toBe(16);
    expect(pxFor(css, "messages")).toBe(8);
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

describe("compileCss search surfaces (v1.8.0)", () => {
  // Selectors added for the two search surfaces (live-probed
  // 2026-10-21): the search-results grid and the Recent searches
  // group. The EN labels are probed; the ID labels are unverified
  // fallback candidates carried as catalogue data.
  const searchSelectors: Record<string, readonly string[]> = {
    names: [
      '[aria-label="Search results."] [role="row"] span[title][dir="auto"]',
      '[aria-label="Hasil pencarian."] [role="row"] span[title][dir="auto"]',
      '[role="group"][aria-label="Recent searches"] span[title][dir="auto"]',
      '[role="group"][aria-label="Pencarian terakhir"] span[title][dir="auto"]',
    ],
    previews: [
      '[aria-label="Search results."] [role="row"] span[title]:not([dir="auto"])',
      '[aria-label="Hasil pencarian."] [role="row"] span[title]:not([dir="auto"])',
    ],
    avatars: [
      '[aria-label="Search results."] [role="row"] img',
      '[aria-label="Hasil pencarian."] [role="row"] img',
      '[role="group"][aria-label="Recent searches"] img',
      '[role="group"][aria-label="Pencarian terakhir"] img',
    ],
  };
  // Target blur at the default global 8px: previews ×1, names ×0.6,
  // avatars ×0.5 — the search surfaces inherit the target's own
  // intensity, nothing search-specific.
  const pxByTarget: Record<string, number> = {
    names: 5,
    previews: 8,
    avatars: 4,
  };
  const ruleLine = (css: string, selector: string): string =>
    css.split("\n").find((l) => l.startsWith(`${selector}{`)) ?? "";

  it("each search selector is catalogue data of the right target", () => {
    for (const [id, selectors] of Object.entries(searchSelectors)) {
      const def = CATALOGUE.find((d) => d.id === id);
      for (const sel of selectors) {
        expect(def?.selectors, `${id} should carry: ${sel}`).toContain(sel);
      }
    }
  });

  it("default settings emit a base rule per search selector, at the target's intensity", () => {
    const css = compileCss(DEFAULT_SETTINGS);
    const selectors = ruleSelectors(css);
    for (const [id, sels] of Object.entries(searchSelectors)) {
      for (const sel of sels) {
        expect(selectors, `base rule expected: ${sel}`).toContain(sel);
        expect(ruleLine(css, sel)).toContain(`blur(${pxByTarget[id]}px)`);
      }
    }
  });

  it("Standard Mode emits a Reveal hover rule per search selector", () => {
    const css = compileCss(DEFAULT_SETTINGS);
    for (const sels of Object.values(searchSelectors)) {
      for (const sel of sels) {
        const hover =
          css.split("\n").find((l) => l.startsWith(`${sel}:hover{`)) ?? "";
        expect(hover, `hover rule expected: ${sel}`).toContain(
          "filter:none !important",
        );
      }
    }
  });

  it("Screen Share Mode emits the base rules but no hover variants for them", () => {
    const css = compileCss(resolveSettings({ mode: "screen-share" }));
    expect(css).not.toContain(":hover");
    const selectors = ruleSelectors(css);
    for (const sels of Object.values(searchSelectors)) {
      for (const sel of sels) {
        expect(selectors, `base rule expected: ${sel}`).toContain(sel);
        expect(css).not.toContain(`${sel}:hover`);
      }
    }
  });
});

describe("resolveSettings blurStyle (v1.6.0)", () => {
  it("defaults to the classic blur, including for legacy objects without the key", () => {
    expect(resolveSettings(undefined).blurStyle).toBe("blur");
    expect(resolveSettings({}).blurStyle).toBe("blur");
    // A v1.5-era persisted Settings object has no blurStyle key.
    expect(
      resolveSettings({ enabled: true, mode: "standard", blurPx: 10 })
        .blurStyle,
    ).toBe("blur");
    expect(DEFAULT_SETTINGS.blurStyle).toBe("blur");
  });

  it("keeps each of the five valid styles", () => {
    for (const blurStyle of ["blur", "mosaic", "redact", "frost", "fade"]) {
      expect(resolveSettings({ blurStyle }).blurStyle).toBe(blurStyle);
    }
  });

  it("falls back to blur for unknown or non-string values", () => {
    expect(resolveSettings({ blurStyle: "sparkle" }).blurStyle).toBe("blur");
    expect(resolveSettings({ blurStyle: 42 }).blurStyle).toBe("blur");
    expect(resolveSettings({ blurStyle: null }).blurStyle).toBe("blur");
  });

  it("round-trips through serialize/parse", () => {
    const s = resolveSettings({ blurStyle: "mosaic" });
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });
});

describe("compileCss Blur Styles (v1.6.0)", () => {
  const firstRuleFor = (css: string, id: string): string => {
    const def = CATALOGUE.find((d) => d.id === id);
    return (
      css.split("\n").find((l) => l.startsWith(`${def?.selectors[0]}{`)) ?? ""
    );
  };
  const hoverRuleFor = (css: string, id: string): string => {
    const def = CATALOGUE.find((d) => d.id === id);
    return (
      css
        .split("\n")
        .find((l) => l.startsWith(`${def?.selectors[0]}:hover{`)) ?? ""
    );
  };

  it("frost: gaussian blur plus a heavy frosted-glass wash", () => {
    const css = compileCss(resolveSettings({ blurStyle: "frost" }));
    expect(firstRuleFor(css, "messages")).toContain(
      "filter:blur(8px) saturate(0.55) brightness(1.28) contrast(0.82) !important;",
    );
    // Media keeps its ×2.5: 20px under the wash.
    expect(firstRuleFor(css, "media")).toContain("blur(20px) saturate(0.55)");
    expect(hoverRuleFor(css, "messages")).toContain("filter:none !important");
  });

  it("fade: half the radius, fully desaturated", () => {
    const css = compileCss(resolveSettings({ blurStyle: "fade" }));
    // Messages 8px -> 4px; Media 20px -> 10px.
    expect(firstRuleFor(css, "messages")).toContain(
      "filter:blur(4px) grayscale(1) !important;",
    );
    expect(firstRuleFor(css, "media")).toContain("blur(10px) grayscale(1)");
    expect(hoverRuleFor(css, "media")).toContain("filter:none !important");
  });

  it("mosaic: per-cell averaged blur through a grid mask, for text and image targets alike", () => {
    const css = compileCss(resolveSettings({ blurStyle: "mosaic" }));
    // Messages at blurPx 8 (multiplier ×1 -> px 8): cell 6, gap 2,
    // tile 4. The mask cuts the blurred content into 4px tiles on a
    // 6px grid, in both axes.
    const mask =
      "repeating-linear-gradient(to right,#000 0 4px,transparent 4px 6px)," +
      "repeating-linear-gradient(to bottom,#000 0 4px,transparent 4px 6px)";
    const rule = firstRuleFor(css, "messages");
    expect(rule).toContain("filter:blur(6px) !important;");
    expect(rule).toContain(`-webkit-mask-image:${mask} !important;`);
    expect(rule).toContain(`mask-image:${mask} !important;`);
    expect(rule).toContain(
      "-webkit-mask-composite:source-in;mask-composite:intersect;",
    );
    // Avatars (multiplier ×0.5 -> px 4): cell 3, gap 1, tile 2.
    const avatar = firstRuleFor(css, "avatars");
    expect(avatar).toContain("filter:blur(3px) !important;");
    expect(avatar).toContain("#000 0 2px,transparent 2px 3px");
    // Native CSS only: no referenced SVG anywhere in Mosaic output.
    expect(css).not.toContain("url(");
  });

  it("mosaic: the cell tracks the per-target multiplier", () => {
    const css = compileCss(
      resolveSettings({ blurStyle: "mosaic", multipliers: { messages: 3 } }),
    );
    // Messages px = round(8 × 3) = 24 -> cell 18, gap round(5.4) = 5,
    // tile 13.
    const rule = firstRuleFor(css, "messages");
    expect(rule).toContain("filter:blur(18px) !important;");
    expect(rule).toContain("#000 0 13px,transparent 13px 18px");
  });

  it("mosaic Reveal clears the filter and both grid masks", () => {
    const css = compileCss(resolveSettings({ blurStyle: "mosaic" }));
    const hover = hoverRuleFor(css, "messages");
    expect(hover).toContain("filter:none !important");
    expect(hover).toContain("-webkit-mask-image:none !important");
    expect(hover).toContain("mask-image:none !important");
  });

  it("mosaic in Screen Share Mode emits no hover rules", () => {
    const css = compileCss(
      resolveSettings({ blurStyle: "mosaic", mode: "screen-share" }),
    );
    expect(css).not.toContain(":hover");
    expect(css).toContain("mask-composite:intersect;");
  });

  it("redact: text targets get an opaque bar, image targets are blacked out", () => {
    const css = compileCss(resolveSettings({ blurStyle: "redact" }));
    const text = firstRuleFor(css, "messages");
    expect(text).toContain("color:transparent !important;");
    expect(text).toContain("background-color:#161616 !important;");
    expect(text).toContain("box-shadow:none;");
    expect(text).not.toContain("filter:");
    const image = firstRuleFor(css, "avatars");
    expect(image).toContain("filter:brightness(0) !important;");
    // No opaque bar on image targets (the word background-color only
    // appears inside the shared transition list).
    expect(image).not.toContain("background-color:#161616");
    expect(image).not.toContain("color:transparent");
  });

  it("redact Reveal: text restores colour, images clear the filter", () => {
    const css = compileCss(resolveSettings({ blurStyle: "redact" }));
    const textHover = hoverRuleFor(css, "messages");
    expect(textHover).toContain("color:inherit !important;");
    expect(textHover).toContain("background-color:transparent !important;");
    expect(textHover).toContain("transition-delay:0.3s");
    expect(hoverRuleFor(css, "media")).toContain("filter:none !important");
  });

  it("redact in Screen Share Mode emits no hover rules", () => {
    const css = compileCss(
      resolveSettings({ blurStyle: "redact", mode: "screen-share" }),
    );
    expect(css).not.toContain(":hover");
    expect(css).toContain("background-color:#161616 !important;");
  });

  it("non-blur styles animate color and background-color as well as filter", () => {
    for (const blurStyle of ["mosaic", "redact", "frost", "fade"]) {
      const css = compileCss(resolveSettings({ blurStyle }));
      expect(firstRuleFor(css, "messages")).toContain(
        "transition:filter 0.18s ease,color 0.18s ease,background-color 0.18s ease;transition-delay:0s;",
      );
    }
    // The classic style's transition is pinned by the static
    // stylesheet generation (ADR-0001) and must not drift.
    expect(firstRuleFor(compileCss(DEFAULT_SETTINGS), "messages")).toContain(
      "transition:filter 0.2s ease;transition-delay:0s;",
    );
  });
});

describe("mosaicCellSize", () => {
  it("is clamp(round(blurPx * 0.75), 3, 18)", () => {
    expect(mosaicCellSize(8)).toBe(6);
    expect(mosaicCellSize(4)).toBe(3);
    expect(mosaicCellSize(24)).toBe(18);
    expect(mosaicCellSize(12)).toBe(9);
    expect(mosaicCellSize(5)).toBe(4); // round(3.75)
  });
});
