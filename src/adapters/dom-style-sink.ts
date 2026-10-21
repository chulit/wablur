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
 * Builds the hidden SVG holding the Mosaic pixelate filter: ONE
 * sampling chain over a `cell` grid (v1.7.3 — the two-layer merge
 * of v1.7.2 was retired by the user's "1 lapis aja" call,
 * 2026-10-21). The source is pre-blurred by cell/2 so each block
 * carries its per-cell average colour, its alpha is firmed back to
 * solid, and the result is spread by a full cell BEFORE the grid
 * samples it, so no element can vanish — guaranteed by
 * construction, see the steps below. Dilating each sample by
 * cell/2 fills its square: DOM content rendered as blocks. The
 * averaging, firming and widening steps are each load-bearing —
 * do not simplify any of them away. Built with createElementNS:
 * innerHTML on SVG elements is unreliable across DOM
 * implementations.
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

  // Sampling grid: a 1×1 flood on a `cell` pitch, tiled. The one
  // chain below samples through this grid.
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

  // Step 1 — averaging (load-bearing): sampling the RAW graphic
  // at single grid points is what made thin elements vanish in
  // v1.6.0 (live report 2026-10-21): a block appeared only where a
  // point landed on painted pixels, and an element whose points
  // all missed rendered COMPLETELY INVISIBLE instead of mosaiced.
  // Blurring the source by cell/2 first turns each cell's colour
  // into its per-cell average.
  const spread = doc.createElementNS(SVG_NS, "feGaussianBlur");
  spread.setAttribute("in", "SourceGraphic");
  spread.setAttribute("stdDeviation", String(cell / 2));
  spread.setAttribute("result", "wa-blur-soft");

  // Step 2 — solidity (load-bearing): the feFuncA ramp firms the
  // diluted alpha back up, so the sampled blocks come out solid
  // instead of washed-out.
  const firm = doc.createElementNS(SVG_NS, "feComponentTransfer");
  firm.setAttribute("in", "wa-blur-soft");
  firm.setAttribute("result", "wa-blur-firm");
  const firmAlpha = doc.createElementNS(SVG_NS, "feFuncA");
  firmAlpha.setAttribute("type", "linear");
  firmAlpha.setAttribute("slope", "3");
  firmAlpha.setAttribute("intercept", "0");
  firm.appendChild(firmAlpha);

  // Step 3 — coverage guarantee (load-bearing): dilate the firmed
  // spread by a FULL cell before sampling. Sample dots tile the
  // plane every `cell` px, so any point of content lies within
  // cell/√2 of a dot; a full-cell dilate therefore puts colour on
  // every dot in or near content. Combined with steps 1–2 this is
  // what makes vanishing impossible by construction in a single
  // chain — no second layer needed.
  const wide = doc.createElementNS(SVG_NS, "feMorphology");
  wide.setAttribute("in", "wa-blur-firm");
  wide.setAttribute("operator", "dilate");
  wide.setAttribute("radius", String(cell));
  wide.setAttribute("result", "wa-blur-wide");

  // Step 4 — sampling: keep the widened spread only where the
  // grid dots are.
  const sample = doc.createElementNS(SVG_NS, "feComposite");
  sample.setAttribute("in", "wa-blur-wide");
  sample.setAttribute("in2", "wa-blur-tile");
  sample.setAttribute("operator", "in");

  // Step 5 — dots → blocks: dilating each sample by cell/2 fills
  // its square. Last primitive in the filter = the output.
  const blocks = doc.createElementNS(SVG_NS, "feMorphology");
  blocks.setAttribute("operator", "dilate");
  blocks.setAttribute("radius", String(cell / 2));

  filter.append(flood, grid, tile, spread, firm, wide, sample, blocks);
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
