import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Design conformance for the popup surface against the user's
 * 2026-10-21 mockup (design/popup-mockup-2026-10-21.png): soft
 * light-blue canvas, white 18px-radius cards, one teal accent,
 * pill toggles, local system font stack, nothing remote. This
 * supersedes the teenage-engineering tokens asserted here before.
 */
const css = readFileSync(new URL("../src/popup.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../src/popup.html", import.meta.url), "utf8");

const PALETTE = new Set([
  "#edf3f5", // canvas
  "#ffffff", // card
  "#12262e", // ink
  "#7a8b96", // muted / icon slate
  "#5a6d78", // inactive mode text
  "#0bb5c7", // accent (toggle on, slider)
  "#0899ad", // teal dark (active mode, Local-Only)
  "#dff6f8", // pale teal (active mode)
  "#eaf7f8", // footer card tint
  "#f2f7f9", // inactive chip
  "#d8e2e7", // toggle off
  "#e7eef1", // hairline divider
  "#dce8ec", // slider track remainder
]);

describe("popup design tokens (mockup 2026-10-21)", () => {
  it("uses only the mockup palette", () => {
    const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(PALETTE.has(hex.toLowerCase()), `off-palette colour: ${hex}`).toBe(true);
    }
    for (const required of ["#0bb5c7", "#edf3f5", "#dff6f8", "#0899ad", "#ffffff"]) {
      expect(css.toLowerCase()).toContain(required);
    }
  });

  it("cards are rounded at 18px and toggles are pills", () => {
    expect(css).toContain("border-radius: 18px");
    expect(css).toContain("border-radius: 999px");
  });

  it("no amber and no retired teenage-engineering tokens survive", () => {
    const lower = css.toLowerCase();
    expect(lower).not.toContain("#f5b800"); // retired amber state marker
    expect(lower).not.toContain("#0f0e12"); // Carbon
    expect(lower).not.toContain("#f6f8f7"); // Canvas Mist
    expect(lower).not.toContain("#b2b2b2"); // Graphite
    expect(css).not.toContain("border-radius: 0");
  });

  it("font stack is the local system stack; nothing is fetched remotely", () => {
    expect(css).toContain("-apple-system");
    expect(css).not.toContain("@import");
    expect(css).not.toContain("url(");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("target rows are divided by 1px hairlines in the divider tint", () => {
    expect(css).toContain("1px solid #e7eef1");
  });
});

describe("extension icon (user's artwork, installed 2026-10-21)", () => {
  it.each([16, 32, 48, 128])("icon-%ipx exists at exactly that size", (size) => {
    const path = new URL(`../extension/icons/icon-${size}.png`, import.meta.url);
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path);
    // PNG magic + IHDR width/height.
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  });

  it("manifest references the icons for the extension and the toolbar", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"),
    ) as {
      icons?: Record<string, string>;
      action?: { default_icon?: Record<string, string> };
    };
    for (const size of [16, 32, 48, 128]) {
      expect(manifest.icons?.[String(size)]).toBe(`icons/icon-${size}.png`);
      expect(manifest.action?.default_icon?.[String(size)]).toBe(
        `icons/icon-${size}.png`,
      );
    }
  });
});
