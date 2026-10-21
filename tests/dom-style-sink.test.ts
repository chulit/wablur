import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  createDomStyleSink,
  DEFS_ELEMENT_ID,
  LIVE_CLASS,
  STYLE_ELEMENT_ID,
} from "../src/adapters/dom-style-sink.js";
import { PIXELATE_FILTER_ID } from "../src/engine/blur-engine.js";

describe("DomStyleSink", () => {
  it("owns exactly one style element across repeated applications", () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const sink = createDomStyleSink(dom.window.document);
    sink("a{filter:blur(8px)}");
    sink("");
    sink("b{filter:blur(4px)}");
    const all = dom.window.document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(all).toHaveLength(1);
    expect(all[0]?.textContent).toBe("b{filter:blur(4px)}");
  });

  it("marks <html> live on apply, so the static stylesheet scopes itself off", () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const sink = createDomStyleSink(dom.window.document);
    expect(dom.window.document.documentElement.classList.contains(LIVE_CLASS)).toBe(false);
    sink("");
    expect(dom.window.document.documentElement.classList.contains(LIVE_CLASS)).toBe(true);
  });
});

describe("DomStyleSink Mosaic defs (v1.6.0)", () => {
  const freshDoc = () =>
    new JSDOM("<!doctype html><html><head></head><body></body></html>").window
      .document;

  it("plants one hidden defs SVG with a pixelate filter sized to the cell", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    const defs = doc.querySelectorAll(`#${DEFS_ELEMENT_ID}`);
    expect(defs).toHaveLength(1);
    expect(defs[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(defs[0]?.getAttribute("width")).toBe("0");
    const filter = defs[0]?.querySelector("filter");
    expect(filter?.id).toBe(PIXELATE_FILTER_ID);
    expect(filter?.getAttribute("width")).toBe("110%");
    const grid = defs[0]?.querySelector("feComposite");
    expect(grid?.getAttribute("width")).toBe("6");
    expect(grid?.getAttribute("height")).toBe("6");
    const morph = defs[0]?.querySelector("feMorphology");
    expect(morph?.getAttribute("operator")).toBe("dilate");
    expect(morph?.getAttribute("radius")).toBe("3"); // cell / 2
    const flood = defs[0]?.querySelector("feFlood");
    expect(flood?.getAttribute("width")).toBe("1");
    expect(flood?.getAttribute("height")).toBe("1");
  });

  it("pre-spreads the source before sampling, so thin elements cannot vanish (v1.7.1)", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    const defs = doc.querySelector(`#${DEFS_ELEMENT_ID}`);

    // The pre-blur spreads the raw graphic by cell/2 into wa-blur-soft…
    const spread = defs?.querySelector("feGaussianBlur");
    expect(spread?.getAttribute("in")).toBe("SourceGraphic");
    expect(spread?.getAttribute("stdDeviation")).toBe("3"); // cell / 2
    expect(spread?.getAttribute("result")).toBe("wa-blur-soft");

    // …and the alpha ramp firms it into wa-blur-firm.
    const firm = defs?.querySelector("feComponentTransfer");
    expect(firm?.getAttribute("in")).toBe("wa-blur-soft");
    expect(firm?.getAttribute("result")).toBe("wa-blur-firm");
    const firmAlpha = firm?.querySelector("feFuncA");
    expect(firmAlpha?.getAttribute("type")).toBe("linear");
    expect(firmAlpha?.getAttribute("slope")).toBe("3");
    expect(firmAlpha?.getAttribute("intercept")).toBe("0");

    // The base chain's sampling composite (first in document order)
    // must read the firmed copy — sampling the raw SourceGraphic
    // alone is what let thin elements vanish. (The crisp chain added
    // in v1.7.2 samples the raw graphic too, but only as a top
    // layer over this base — see the merge test below.)
    const composites = [...(defs?.querySelectorAll("feComposite") ?? [])];
    const sample = composites.find((c) => c.getAttribute("operator") === "in");
    expect(sample?.getAttribute("in")).toBe("wa-blur-firm");
    expect(sample?.getAttribute("in2")).toBe("wa-blur-tile");
  });

  it("merges crisp raw samples over the coverage base (v1.7.2)", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    const defs = doc.querySelector(`#${DEFS_ELEMENT_ID}`);

    // The grid is shared: exactly one flood and one tile feed both
    // sampling chains.
    expect(defs?.querySelectorAll("feFlood")).toHaveLength(1);
    expect(defs?.querySelectorAll("feTile")).toHaveLength(1);

    // Two sampling composites over that grid: base reads the firmed
    // pre-spread copy, crisp reads the raw SourceGraphic.
    const samples = [...(defs?.querySelectorAll("feComposite") ?? [])].filter(
      (c) => c.getAttribute("operator") === "in",
    );
    expect(samples).toHaveLength(2);
    expect(samples.map((s) => s.getAttribute("in"))).toEqual([
      "wa-blur-firm",
      "SourceGraphic",
    ]);
    for (const s of samples) {
      expect(s.getAttribute("in2")).toBe("wa-blur-tile");
    }

    // Each chain dilates into its own named layer at cell / 2.
    const morphs = [...(defs?.querySelectorAll("feMorphology") ?? [])];
    expect(morphs.map((m) => m.getAttribute("result"))).toEqual([
      "wa-blur-base",
      "wa-blur-crisp",
    ]);
    for (const m of morphs) {
      expect(m.getAttribute("operator")).toBe("dilate");
      expect(m.getAttribute("radius")).toBe("3"); // cell / 2
    }

    // feMerge paints base first, crisp over it — the crisp blocks
    // win wherever raw samples hit, the base fills the gaps.
    const merge = defs?.querySelector("feMerge");
    expect(merge).not.toBeNull();
    const nodes = [...(merge?.querySelectorAll("feMergeNode") ?? [])];
    expect(nodes.map((n) => n.getAttribute("in"))).toEqual([
      "wa-blur-base",
      "wa-blur-crisp",
    ]);
  });

  it("sizes the pre-spread with the cell (stdDeviation = cell / 2 on rebuild)", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    sink("a{}", 10);
    const defs = doc.querySelector(`#${DEFS_ELEMENT_ID}`);
    expect(defs?.querySelector("feGaussianBlur")?.getAttribute("stdDeviation")).toBe("5");
  });

  it("does not duplicate defs on repeated applies with the same cell", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    sink("b{}", 6);
    expect(doc.querySelectorAll(`#${DEFS_ELEMENT_ID}`)).toHaveLength(1);
  });

  it("rebuilds the defs when the cell changes", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    sink("a{}", 10);
    const defs = doc.querySelectorAll(`#${DEFS_ELEMENT_ID}`);
    expect(defs).toHaveLength(1);
    expect(defs[0]?.querySelector("feComposite")?.getAttribute("width")).toBe("10");
    expect(defs[0]?.querySelector("feMorphology")?.getAttribute("radius")).toBe("5");
  });

  it("removes the defs when the cell becomes null (style switch or master off)", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    expect(doc.querySelector(`#${DEFS_ELEMENT_ID}`)).not.toBeNull();
    sink("", null);
    expect(doc.querySelector(`#${DEFS_ELEMENT_ID}`)).toBeNull();
    // And a bare call without a cell argument also leaves none behind.
    sink("a{}", 6);
    sink("a{}");
    expect(doc.querySelector(`#${DEFS_ELEMENT_ID}`)).toBeNull();
  });
});
