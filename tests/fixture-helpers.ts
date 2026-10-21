import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";
import { CATALOGUE, type BlurTargetDef } from "../src/engine/catalogue.js";

/** Loads a synthetic fixture (fully fictional structure) as a Document. */
export function loadFixture(name: string): Document {
  const html = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return new JSDOM(html).window.document;
}

/**
 * Label-anchored selectors belong to exactly one locale: an EN-anchored
 * selector ("Chat list", "profile photo") must match the EN fixture, its
 * ID counterpart ("Daftar chat", "foto profil") the ID fixture. All
 * other selectors are structural and must match both fixtures.
 */
const ID_ANCHORS = [
  "Daftar chat",
  "foto profil",
  "Hasil pencarian.",
  "Pencarian terakhir",
];
const EN_ANCHORS = [
  "Chat list",
  "profile photo",
  "Search results.",
  "Recent searches",
];

export function selectorsForLocale(
  def: BlurTargetDef,
  locale: "en" | "id",
): readonly string[] {
  const foreign = locale === "en" ? ID_ANCHORS : EN_ANCHORS;
  return def.selectors.filter((s) => !foreign.some((a) => s.includes(a)));
}

/**
 * Registers one test per Blur Target asserting every selector for the
 * given locale matches the fixture — each target fails independently.
 */
export function describeFixtureMatches(
  title: string,
  doc: Document,
  locale: "en" | "id",
): void {
  describe(title, () => {
    for (const def of CATALOGUE) {
      it(`${def.id}: every ${locale.toUpperCase()} selector matches fixture structure`, () => {
        for (const selector of selectorsForLocale(def, locale)) {
          expect(
            doc.querySelectorAll(selector).length,
            `selector should match fixture: ${selector}`,
          ).toBeGreaterThan(0);
        }
      });
    }
  });
}
