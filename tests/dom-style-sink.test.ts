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
});
