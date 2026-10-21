import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "../src/engine/catalogue.js";
import { compileCss, DEFAULT_SETTINGS } from "../src/engine/blur-engine.js";
import {
  GENERATED_HEADER,
  scopeToPreRuntime,
} from "../scripts/generate-static-css.js";
import { describeFixtureMatches, loadFixture } from "./fixture-helpers.js";

const enDoc = loadFixture("whatsapp-en.html");

describeFixtureMatches(
  "selector catalogue against the synthetic EN fixture",
  enDoc,
  "en",
);

describe("typing surface (EN fixture)", () => {
  it("no Blur Target selector matches the typing surface", () => {
    const input = enDoc.querySelector("[contenteditable]");
    expect(input).not.toBeNull();
    for (const def of CATALOGUE) {
      for (const selector of def.selectors) {
        expect(
          input?.matches(selector) ?? true,
          `typing surface must stay legible, matched by: ${selector}`,
        ).toBe(false);
      }
    }
  });
});

describe("static default stylesheet (ADR-0001)", () => {
  it("extension/default.css is in sync with the catalogue generation", () => {
    const onDisk = readFileSync(
      new URL("../extension/default.css", import.meta.url),
      "utf8",
    );
    expect(onDisk).toBe(
      GENERATED_HEADER + scopeToPreRuntime(compileCss(DEFAULT_SETTINGS)) + "\n",
    );
    // Scoped to the pre-runtime state: the sheet must disable itself
    // once the runtime marks <html> live (review finding c). Assert
    // the blur declaration rather than the exact rule string — the
    // base rule legitimately gained transition declarations with the
    // Reveal-timing work (ticket 05).
    expect(onDisk).toContain(
      ":root:not(.wa-blur-live) .focusable-list-item{filter:blur(8px) !important;",
    );
  });

  it("static stylesheet covers all six Blur Targets", () => {
    const onDisk = readFileSync(
      new URL("../extension/default.css", import.meta.url),
      "utf8",
    );
    for (const def of CATALOGUE) {
      expect(
        def.selectors.some((s) => onDisk.includes(s)),
        `static css should cover target: ${def.id}`,
      ).toBe(true);
    }
  });
});
