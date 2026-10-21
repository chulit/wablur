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
    // The original v1.6.0 recipe, nothing more: one sampling
    // composite reading the RAW graphic through the tile grid, one
    // dilate — and none of the retired v1.7.1–v1.7.3 machinery
    // (no pre-blur, no alpha transfer, no merge).
    const composites = [...(defs[0]?.querySelectorAll("feComposite") ?? [])];
    const sample = composites.find((c) => c.getAttribute("operator") === "in");
    expect(sample?.getAttribute("in")).toBe("SourceGraphic");
    expect(sample?.getAttribute("in2")).toBe("wa-blur-tile");
    expect(defs[0]?.querySelectorAll("feMorphology")).toHaveLength(1);
    expect(defs[0]?.querySelector("feGaussianBlur")).toBeNull();
    expect(defs[0]?.querySelector("feComponentTransfer")).toBeNull();
    expect(defs[0]?.querySelector("feMerge")).toBeNull();
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
