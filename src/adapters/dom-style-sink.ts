import type { CssText } from "../engine/blur-engine.js";
import type { StyleSink } from "../runtime/blur-runtime.js";

export const STYLE_ELEMENT_ID = "wa-blur-style";

/**
 * Class the sink puts on <html> the moment the runtime takes over.
 * The static stylesheet's rules are scoped to `:root:not(.wa-blur-live)`,
 * so they switch themselves off at exactly that moment and the
 * runtime's compiled Settings CSS becomes the only authority —
 * including "everything off", which compiles to empty CSS and could
 * never override a same-specificity !important static rule
 * (ticket 01 code-review, Spec axis finding c).
 */
export const LIVE_CLASS = "wa-blur-live";

/**
 * Production style sink: owns exactly one <style> element and replaces
 * its content wholesale on every apply — never appends new elements
 * (the leak in piyushraj's implementation, research.md §3.1).
 */
export function createDomStyleSink(doc: Document): StyleSink {
  return (css: CssText) => {
    doc.documentElement.classList.add(LIVE_CLASS);
    let el = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement("style");
      el.id = STYLE_ELEMENT_ID;
      doc.head.appendChild(el);
    }
    el.textContent = css;
  };
}
