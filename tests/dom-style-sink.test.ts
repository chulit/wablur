import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  createDomStyleSink,
  LIVE_CLASS,
  STYLE_ELEMENT_ID,
} from "../src/adapters/dom-style-sink.js";

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

  it("plants nothing else: no SVG defs accompany the style, whatever the CSS", () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const doc = dom.window.document;
    const sink = createDomStyleSink(doc);
    // Even Mosaic-flavoured CSS (native blur + mask grid since
    // v1.7.5) needs no planted filter — the sink stays style-only.
    sink("a{mask-image:repeating-linear-gradient(to right,#000 0 4px,transparent 4px 6px)}");
    expect(doc.querySelectorAll("svg")).toHaveLength(0);
    expect(doc.body.childNodes).toHaveLength(0);
    expect(doc.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });
});
