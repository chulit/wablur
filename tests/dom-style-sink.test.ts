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
    const morphs = [...(defs[0]?.querySelectorAll("feMorphology") ?? [])];
    const blocks = morphs[morphs.length - 1];
    expect(blocks?.getAttribute("operator")).toBe("dilate");
    expect(blocks?.getAttribute("radius")).toBe("3"); // cell / 2
    const flood = defs[0]?.querySelector("feFlood");
    expect(flood?.getAttribute("width")).toBe("1");
    expect(flood?.getAttribute("height")).toBe("1");
  });

  it("hardens the spread before sampling — average, firm, widen — so thin elements cannot vanish (v1.7.3)", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    const defs = doc.querySelector(`#${DEFS_ELEMENT_ID}`);

    // Averaging: the pre-blur spreads the raw graphic by cell/2
    // into wa-blur-soft, so each block carries a per-cell average.
    const spread = defs?.querySelector("feGaussianBlur");
    expect(spread?.getAttribute("in")).toBe("SourceGraphic");
    expect(spread?.getAttribute("stdDeviation")).toBe("3"); // cell / 2
    expect(spread?.getAttribute("result")).toBe("wa-blur-soft");

    // Solidity: the alpha ramp firms it into wa-blur-firm.
    const firm = defs?.querySelector("feComponentTransfer");
    expect(firm?.getAttribute("in")).toBe("wa-blur-soft");
    expect(firm?.getAttribute("result")).toBe("wa-blur-firm");
    const firmAlpha = firm?.querySelector("feFuncA");
    expect(firmAlpha?.getAttribute("type")).toBe("linear");
    expect(firmAlpha?.getAttribute("slope")).toBe("3");
    expect(firmAlpha?.getAttribute("intercept")).toBe("0");

    // Coverage guarantee: the firmed spread is dilated by a FULL
    // cell into wa-blur-wide before sampling — every sample dot
    // near content catches colour, so vanishing is impossible.
    const morphs = [...(defs?.querySelectorAll("feMorphology") ?? [])];
    const wide = morphs[0];
    expect(wide?.getAttribute("in")).toBe("wa-blur-firm");
    expect(wide?.getAttribute("operator")).toBe("dilate");
    expect(wide?.getAttribute("radius")).toBe("6"); // full cell
    expect(wide?.getAttribute("result")).toBe("wa-blur-wide");

    // The sampling composite must read the widened copy — sampling
    // anything narrower is what let thin elements vanish.
    const composites = [...(defs?.querySelectorAll("feComposite") ?? [])];
    const sample = composites.find((c) => c.getAttribute("operator") === "in");
    expect(sample?.getAttribute("in")).toBe("wa-blur-wide");
    expect(sample?.getAttribute("in2")).toBe("wa-blur-tile");
  });

  it("is a single sampling chain — no second layer, no merge (v1.7.3)", () => {
    const doc = freshDoc();
    const sink = createDomStyleSink(doc);
    sink("a{}", 6);
    const defs = doc.querySelector(`#${DEFS_ELEMENT_ID}`);

    // Exactly one grid: one flood, one tile.
    expect(defs?.querySelectorAll("feFlood")).toHaveLength(1);
    expect(defs?.querySelectorAll("feTile")).toHaveLength(1);

    // Exactly one sampling composite over that grid, reading the
    // widened spread.
    const samples = [...(defs?.querySelectorAll("feComposite") ?? [])].filter(
      (c) => c.getAttribute("operator") === "in",
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]?.getAttribute("in")).toBe("wa-blur-wide");
    expect(samples[0]?.getAttribute("in2")).toBe("wa-blur-tile");

    // Exactly two morphologies, in order: widen by the full cell,
    // then dots → blocks at cell / 2 (the unnamed filter output).
    const morphs = [...(defs?.querySelectorAll("feMorphology") ?? [])];
    expect(morphs).toHaveLength(2);
    expect(morphs.map((m) => m.getAttribute("operator"))).toEqual([
      "dilate",
      "dilate",
    ]);
    expect(morphs.map((m) => m.getAttribute("radius"))).toEqual(["6", "3"]);
    expect(morphs[0]?.getAttribute("result")).toBe("wa-blur-wide");
    expect(morphs[1]?.getAttribute("result")).toBeNull();

    // The retired two-layer design leaves no trace: no feMerge and
    // no base/crisp result names anywhere in the defs markup.
    expect(defs?.querySelector("feMerge")).toBeNull();
    expect(defs?.querySelectorAll("feMergeNode")).toHaveLength(0);
    const markup = defs?.outerHTML ?? "";
    expect(markup).not.toContain("wa-blur-crisp");
    expect(markup).not.toContain("wa-blur-base");
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
    // First feMorphology is the widen step: radius tracks the full cell.
    expect(defs[0]?.querySelector("feMorphology")?.getAttribute("radius")).toBe("10");
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
