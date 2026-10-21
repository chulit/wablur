import { describe, expect, it } from "vitest";
import { CATALOGUE } from "../src/engine/catalogue.js";
import { describeFixtureMatches, loadFixture } from "./fixture-helpers.js";

const idDoc = loadFixture("whatsapp-id.html");

describeFixtureMatches(
  "selector catalogue against the synthetic ID fixture",
  idDoc,
  "id",
);

/**
 * The locale guarantee is specifically about localised anchors: each
 * label-anchored EN selector must have a first-class ID counterpart in
 * the same catalogue, and that counterpart must match ID structure.
 */
describe("Indonesian anchor counterparts", () => {
  const pairs: [en: string, id: string][] = [
    [
      '[aria-label="Chat list"] [role="listitem"] span[title]',
      '[aria-label="Daftar chat"] [role="listitem"] span[title]',
    ],
    ['[aria-label="profile photo"] img', '[aria-label="foto profil"] img'],
  ];

  it("every label-anchored selector has an ID counterpart in the catalogue", () => {
    const all = CATALOGUE.flatMap((d) => d.selectors);
    for (const [en, id] of pairs) {
      expect(all).toContain(en);
      expect(all).toContain(id);
      expect(
        idDoc.querySelectorAll(id).length,
        `ID selector should match ID fixture: ${id}`,
      ).toBeGreaterThan(0);
    }
  });

  it("no Blur Target selector matches the typing surface (ID)", () => {
    const input = idDoc.querySelector("[contenteditable]");
    expect(input).not.toBeNull();
    for (const def of CATALOGUE) {
      for (const selector of def.selectors) {
        expect(input?.matches(selector) ?? true).toBe(false);
      }
    }
  });
});
