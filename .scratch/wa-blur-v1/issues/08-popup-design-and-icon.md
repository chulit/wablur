# 08: Popup visual design (DESIGN.md) and icon

**What to build:** The functional popup becomes the designed popup: teenage-engineering DESIGN.md applied to the popup surface only, with the approved adaptations from `grill-decisions.md` — five-neutral palette (`#f6f8f7` canvas, `#000000` ink, `#0f0e12` carbon, `#e5e5e5` hairlines, `#b2b2b2` muted), 0px radius on every control, zero shadows and gradients, 1px hairline rules as section dividers, 15px element gaps, Inter-first local font stack with no remote fetch, control labels at weight 300 / 13px, on-states shown as carbon fill (never WhatsApp green), and amber used exactly once — to mark Screen Share Mode active. This ticket also delivers the extension icon: a hairline eye glyph, ink on Canvas Mist, square, never the WhatsApp logo.

**Blocked by:** 03 — Settings and popup target toggles (the controls being styled), and 05 — Modes and Reveal timing (the Mode control the amber state marks).

**Status:** done

- [x] Popup uses only the five DESIGN.md neutrals plus the single amber state; no other colour appears, including no WhatsApp green — enforced by a palette test over the stylesheet (every hex must be in the allowed set)
- [x] Every control has 0px border radius; no box-shadow or gradient anywhere in popup CSS — test-enforced
- [x] Section structure is organised by 1px `#e5e5e5` hairlines; element gaps are 15px
- [x] Labels render at weight 300 / 13px in an Inter-first local stack; the extension makes no font network request — no `@import`/`url()`/remote URL anywhere in popup CSS or HTML (test-enforced); the DevTools observation rides ticket 09's live pass
- [x] Screen Share Mode active is marked in amber; Standard Mode shows no amber — the amber hex appears in exactly one CSS declaration, gated on the Screen Share button's active state (test-enforced)
- [x] Icon files exist at the sizes Chrome requires, drawn as a hairline eye glyph; no WhatsApp logo or green phone mark anywhere in the package — PNG dimensions/magic verified by test; glyph is an original eye (SVG source in `src/assets/icon.svg`)
- [x] All popup controls remain fully operable and legible at Chrome's minimum popup dimensions — fixed 320px width, 13px/300 labels, native focusable controls with visible focus outlines

## Comments

- 2026-10-20: Implemented (this commit). `src/popup.css` rewritten to DESIGN.md with the approved adaptations; toggle controls are square hairline boxes whose ON state is a Carbon fill, Mode buttons are ruled options (active = Carbon fill), the intensity track is a 1px rule with a square Carbon thumb, and a Graphite Local-Only footer line was added. The icon is an original hairline eye (ink on Canvas Mist) authored as `src/assets/icon.svg` and rasterised to 16/32/48/128 PNGs via `scripts/render-icons.sh` (ffmpeg); the manifest references them under both `icons` and `action.default_icon`. A design-token test suite (`tests/popup-design.test.ts`) pins the palette, the single amber declaration, 0px radius, no shadow/gradient/remote references, and the icon files. 71 tests green, typecheck clean, build OK.

## Amendment — 2026-10-20

Per the post-grill amendment (see `grill-decisions.md`): the popup's Mode control is replaced by a **Hover Reveal** toggle row, and the single amber marker now means **Hover Reveal OFF** (presentation-safe) instead of "Screen Share Mode active". All other design criteria (palette, 0px radius, hairlines, icon) unchanged.

## Amendment #2 — 2026-10-21

Superseded as the popup's design authority: the maintainer supplied a new popup mockup (`design/popup-mockup-2026-10-21.png`) and adopted it wholesale — pale blue-grey background, white rounded cards, teal accent, pill toggles, per-target icons, intensity px badge, Local-Only footer card. The DESIGN.md styling, square hairline toggles, carbon on-state and amber marker from this ticket's original criteria no longer apply to the popup (the hairline eye icon artwork is retained). See `grill-decisions.md` amendment #2.
