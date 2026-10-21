import {
  PIXELATE_FILTER_ID,
  type CssText,
} from "../engine/blur-engine.js";
import type { StyleSink } from "../runtime/blur-runtime.js";

export const STYLE_ELEMENT_ID = "wa-blur-style";
export const DEFS_ELEMENT_ID = "wa-blur-defs";

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

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Builds the hidden SVG holding the Mosaic pixelate filter: a 1×1
 * flood repeated on a `cell` grid samples the source at grid
 * points, and dilating each sample by cell/2 fills its square —
 * DOM content rendered as blocks. Two sampling chains run over the
 * shared grid and are merged, crisp painted over base: the crisp
 * chain samples the raw graphic (true-colour blocks, the look the
 * user prefers), the base chain samples a pre-spread, alpha-firmed
 * copy so no cell is ever left empty (the coverage guarantee).
 * Both chains are load-bearing — see the comment at each. Built
 * with createElementNS: innerHTML on SVG elements is unreliable
 * across DOM implementations.
 */
function buildPixelateDefs(doc: Document, cell: number): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.id = DEFS_ELEMENT_ID;
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("style", "position:absolute");

  const filter = doc.createElementNS(SVG_NS, "filter");
  filter.id = PIXELATE_FILTER_ID;
  filter.setAttribute("x", "-5%");
  filter.setAttribute("y", "-5%");
  filter.setAttribute("width", "110%");
  filter.setAttribute("height", "110%");

  // Shared sampling grid: a 1×1 flood on a `cell` pitch, tiled.
  // Both chains below sample through this one grid — defined once.
  const flood = doc.createElementNS(SVG_NS, "feFlood");
  flood.setAttribute("x", String(cell / 2));
  flood.setAttribute("y", String(cell / 2));
  flood.setAttribute("width", "1");
  flood.setAttribute("height", "1");

  const grid = doc.createElementNS(SVG_NS, "feComposite");
  grid.setAttribute("width", String(cell));
  grid.setAttribute("height", String(cell));

  const tile = doc.createElementNS(SVG_NS, "feTile");
  tile.setAttribute("result", "wa-blur-tile");

  // Base (coverage) chain — do NOT remove (v1.7.1 fix, live report
  // 2026-10-21): sampling reads the source at single grid points,
  // so a block is produced only where a point lands on painted
  // pixels. Thin text glyphs and sparse elements (plain avatars)
  // leave most points on empty space — and an element whose points
  // all miss rendered COMPLETELY INVISIBLE instead of mosaiced.
  // Blurring the source by cell/2 first spreads every glyph's
  // colour across its whole cell, and the feFuncA ramp firms the
  // diluted alpha back up so the sampled blocks come out solid.
  // This chain alone guarantees every cell yields a block.
  const spread = doc.createElementNS(SVG_NS, "feGaussianBlur");
  spread.setAttribute("in", "SourceGraphic");
  spread.setAttribute("stdDeviation", String(cell / 2));
  spread.setAttribute("result", "wa-blur-soft");

  const firm = doc.createElementNS(SVG_NS, "feComponentTransfer");
  firm.setAttribute("in", "wa-blur-soft");
  firm.setAttribute("result", "wa-blur-firm");
  const firmAlpha = doc.createElementNS(SVG_NS, "feFuncA");
  firmAlpha.setAttribute("type", "linear");
  firmAlpha.setAttribute("slope", "3");
  firmAlpha.setAttribute("intercept", "0");
  firm.appendChild(firmAlpha);

  const baseSample = doc.createElementNS(SVG_NS, "feComposite");
  baseSample.setAttribute("in", "wa-blur-firm");
  baseSample.setAttribute("in2", "wa-blur-tile");
  baseSample.setAttribute("operator", "in");

  const baseDilate = doc.createElementNS(SVG_NS, "feMorphology");
  baseDilate.setAttribute("operator", "dilate");
  baseDilate.setAttribute("radius", String(cell / 2));
  baseDilate.setAttribute("result", "wa-blur-base");

  // Crisp chain — do NOT remove (v1.7.2, user preference
  // 2026-10-21): the base chain alone renders every block in the
  // pre-blurred average colour — solid, but smeared/muddy, and the
  // user explicitly preferred the original look. This chain is the
  // v1.6.0 recipe: it samples the RAW SourceGraphic, so wherever a
  // grid point lands on painted pixels the block carries the true
  // colour. Merged over the base it restores the crisp look; the
  // base shows only in the gaps this chain misses — exactly the
  // spots that used to vanish.
  const crispSample = doc.createElementNS(SVG_NS, "feComposite");
  crispSample.setAttribute("in", "SourceGraphic");
  crispSample.setAttribute("in2", "wa-blur-tile");
  crispSample.setAttribute("operator", "in");

  const crispDilate = doc.createElementNS(SVG_NS, "feMorphology");
  crispDilate.setAttribute("operator", "dilate");
  crispDilate.setAttribute("radius", String(cell / 2));
  crispDilate.setAttribute("result", "wa-blur-crisp");

  // Node order is paint order: base first, crisp over it.
  const merge = doc.createElementNS(SVG_NS, "feMerge");
  const mergeBase = doc.createElementNS(SVG_NS, "feMergeNode");
  mergeBase.setAttribute("in", "wa-blur-base");
  const mergeCrisp = doc.createElementNS(SVG_NS, "feMergeNode");
  mergeCrisp.setAttribute("in", "wa-blur-crisp");
  merge.append(mergeBase, mergeCrisp);

  filter.append(
    flood,
    grid,
    tile,
    spread,
    firm,
    baseSample,
    baseDilate,
    crispSample,
    crispDilate,
    merge,
  );
  svg.append(filter);
  return svg;
}

/**
 * Production style sink: owns exactly one <style> element and
 * replaces its content wholesale on every apply — never appends new
 * elements (the leak in piyushraj's implementation, research.md
 * §3.1). It also owns the Mosaic filter defs: planted (and rebuilt
 * when the cell changes) only while the runtime passes a cell, and
 * removed the moment it passes null, so no stale filter can linger
 * after the style or the master Toggle changes.
 */
export function createDomStyleSink(doc: Document): StyleSink {
  let plantedCell: number | null = null;
  return (css: CssText, mosaicCell: number | null = null) => {
    doc.documentElement.classList.add(LIVE_CLASS);
    let el = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement("style");
      el.id = STYLE_ELEMENT_ID;
      doc.head.appendChild(el);
    }
    el.textContent = css;

    const defs = doc.getElementById(DEFS_ELEMENT_ID);
    if (mosaicCell === null) {
      defs?.remove();
      plantedCell = null;
    } else if (!defs || plantedCell !== mosaicCell) {
      defs?.remove();
      const host = doc.body ?? doc.documentElement;
      host.appendChild(buildPixelateDefs(doc, mosaicCell));
      plantedCell = mosaicCell;
    }
  };
}
