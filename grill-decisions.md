# Grill Decisions — WhatsApp Blur Extension

Session started 2026-10-20. Flow: grill-me → codebase-design (Design It Twice) → research → domain-modeling → writing-for-agents.
Status: **Grill session CLOSED 2026-10-20** — Rounds 1–3 all settled, approved in full, and shared understanding confirmed by Paduka Raja (the Round 3 approval doubled as that confirmation, per the completion criterion below). Next in flow: local setup-matt-pocock-skills → to-spec → to-tickets; creating the GitHub repo and pushing wait for his explicit go, per his standing local-first rule.

## How to read this doc set (for agents)

- This file is the single source of truth for **decisions**. Vocabulary: `GLOSSARY.md` (use its terms exactly). Evidence: `research.md` — its per-section "Implications" are advisory only; where they conflict with this file, this file wins.
- Reach for `research.md` only when a platform, policy, or selector fact is in question; it is a dated snapshot (2026-10-20), not a living spec.
- Reach for `DESIGN.md` only when building or reviewing the popup's visual design; it governs the popup surface only, never the WhatsApp page itself.
- Future repo `AGENTS.md` pointer (one line, do not inline the rest): "WA Blur extension — read `GLOSSARY.md` for vocabulary and `grill-decisions.md` for settled decisions before designing, building, or testing; open `research.md` only for a platform/policy/selector fact."
- **Completion criterion for the grill**: the session closes when every Round 2 item has an approved or rejected outcome recorded in this file AND the user confirms shared understanding. Only then does `to-spec` start.

## Round 1 — settled 2026-10-20, approved in full by Paduka Raja

- **Q1 Purpose**: v1 is personal use + GitHub portfolio, sideloaded unpacked. Publishing to the Chrome Web Store is a separate later decision.
  - Rejected for v1: store-first (adds policy, listing, trademark, and maintenance obligations before daily-use proof).
- **Q2 Differentiation**: Local-Only (see GLOSSARY.md — no backend of ours, no requests by the extension, no tracking) and Reveal is not hover-only, so it is safe for screen sharing. Wording sharpened 2026-10-20: Settings sit in `chrome.storage.sync`, so "no server ever touches the data" would overclaim — Chrome's own sync, if the user enables it, is the browser's.
  - Context: existing extensions (Privacy Extension for WhatsApp Web, Privacy Extension for WhatsApp Privacy, BlurChat) cover basic hover blur; at least one communicates with a server for update/problem info; BlurChat paywalls names/photos.
- **Q3 Primary Exposure**: Screen Share first, Shoulder Surfing second.
- **Q4 Platform**: Chrome only, `https://web.whatsapp.com/*`, Manifest V3. Edge follows via Chromium. Firefox and desktop apps out of scope.
- **Q5 Blur Targets (MVP)**: Messages, Previews, Names, Avatars, Media, Chat Header — all on by default, each independently toggleable. The typing surface stays legible: the six Blur Targets are the only blurred surfaces.
- **Q6 Reveal**: Combination — per-target hover Reveal that can be disabled, plus a global Toggle on `Alt+X`.
- **D1 Promise**: The product promise is Visual Privacy. "Secure / protect / lock" wording is banned unless a real PIN gate exists; blurred text remains copyable and inspectable in the DOM.
- **D2 Unit**: The unit of blur is a Blur Target (see GLOSSARY.md); "Avatar" replaces "profile picture".
- **D3 Reveal vs Toggle**: Reveal = temporary, per-target, no state change. Toggle = global state change (shortcut / master switch).
- **D4 Mode**: Mode is a domain term — named presets (Standard, Screen Share), not just loose toggles.

## Round 2 — settled 2026-10-20, approved in full by Paduka Raja

- **R1 Intensity**: one user-facing slider, 4–24px, default 8px. Per-target intensity multipliers live inside the selector catalogue (internal, evidence-backed by predecessor defaults: messages 8px, names 5px, media 20px) — the user learns one knob.
- **R2 Reveal timing**: Reveal fires only after the cursor rests 300ms on a target; re-blur is immediate when the cursor leaves. In Screen Share Mode, Reveal is off entirely. (Research-validated: LukasLen ships transition-delay 0.3s; animating `filter` on large areas is paint-expensive.)
- **R3 Mode switching**: from the popup only. The only keyboard shortcut in v1 is `Alt+X` (Toggle).
- **R4 Lock**: no PIN Lock in v1 — see ADR-0002.
- **R5 Popup**: master Toggle, Mode choice, 6 Blur Target toggles, intensity slider; English; teenage-engineering DESIGN.md styling with the approved adaptations.
- **R6 Mode persistence**: the last chosen Mode is stored in Settings and restored on startup. No auto-detection, no auto-reset.

## Codebase design — settled (Design It Twice, 3 designs compared)

Recommended hybrid (Muse's recommendation, presented 2026-10-20):
- Deep module `BlurEngine`, pure and in-process: `DEFAULT_SETTINGS`, `resolveSettings(raw)`, `compileCss(settings)`, `toggle(settings)`; the interface is the test surface (no Chrome needed in tests).
- Thin `BlurRuntime` wiring: accepts injected `StoragePort` + `StyleSink` adapters (Chrome production, in-memory/string test adapters — a real seam, two adapters).
- Selector catalogue as data inside the engine; engine exposes read-only target metadata so the popup renders toggles from data. Popup writes via `patch(partial)` merged inside the store.
- Closed union of 6 Blur Target categories (no open-string registry, no SiteAdapter — one adapter is a hypothetical seam).
- Vocabulary fixes: `photos` → `avatars`, `header` → `chatHeader`, `reveal: 'hover' | 'never'`.
- Deferred to v2: dead-selector diagnostics (`snapshot().deadSelectors` from Design B).
- If a PIN/idle Lock is ever built, it must be a separate deep module — never folded into `BlurEngine`.
- Caveat: assumes every target is pure-CSS addressable; research may revise the runtime shape if a target needs per-node JS.

## Design reference — received 2026-10-20

- `DESIGN.md` (teenage engineering style reference, supplied by Paduka Raja, saved verbatim) is the adopted style authority for the **popup surface only** — adopted with the adaptations below, confirmed by him 2026-10-20. The extension never restyles WhatsApp itself; it only blurs it.
- **Applies to the popup**: the five-neutral palette (`#f6f8f7` canvas, `#000000` ink, `#0f0e12` carbon, `#e5e5e5` hairlines, `#b2b2b2` muted), 0px radius everywhere, zero shadows/gradients, 1px hairline rules as the organising device, 15px element gap, left-aligned technical-catalogue rhythm.
- **Does not apply**: the source site's page layout (1200px column, product grid, hero bands, photography) — the popup is a ~320px utility surface with no product imagery.
- **Adaptations (approved 2026-10-20)**: (1) type via the documented Inter substitute, with control labels at weight 300 / 13px — the source's weight-100 body is an editorial catalogue voice, while popup labels are controls scanned in seconds; headings keep weight 300 at larger sizes. (2) No WhatsApp-green accent: ON states read as carbon/black fill per the reference's colour rationing; amber — the reference's only chromatic note, reserved for states — marks Screen Share Mode active. (3) Toggles are square, hairline-bordered, 0px radius. (4) No remotely fetched font (Local-Only + store remote-code posture): system font stack with Inter first if locally present; bundling a font file is a later size decision.

## Research cross-check — 2026-10-20 (`research.md`, primary sources only)

Facts that amend or confirm the design above:

- **Permissions settled**: minimal manifest is `permissions: ["storage"]` + static `content_scripts.matches`. No `host_permissions`, no `activeTab`/`scripting` (those are only for programmatic injection). Unused permissions are a store rejection class.
- **Alt+X forces a service worker**: `chrome.commands.onCommand` handlers live in the service worker. Since Q6 settled Alt+X, a thin worker exists for exactly two jobs (command → flip master Toggle in storage; `onInstalled` → seed defaults). Content scripts react via `storage.onChanged` — no message passing.
- **Storage settled by fact, not preference**: Settings = ONE object under ONE key in `chrome.storage.sync` (Google's recommendation for user settings; quotas are orders of magnitude above this payload; sync write limits require the runtime to debounce slider writes). Single-object shape makes the storage seam atomic.
- **First-paint amendment (design change)**: manifest-declared CSS is injected *before any DOM is displayed*; JS runs at `document_idle` and can flash unblurred content. Therefore the package ships a static CSS file for the DEFAULT settings (all targets on), generated at build time from the same selector catalogue via `compileCss(DEFAULT_SETTINGS)` — one catalogue, two uses. The runtime then relaxes/applies the user's actual Settings on top. Any flash is in the safe direction (over-blur first).
- **Selector strategy**: semantic anchors first (`aria-label`, `role`, structural ids — the set piyushraj's one big fix commit migrated to after all `data-testid` selectors broke), obfuscated classes only as a disposable fallback layer, previous-generation selectors kept as fallback (LukasLen pattern: two WA generations per file; one WA update touched 9 files / +358 lines; even `role="row"` → `role="listitem"` broke once). No MutationObserver — confirmed across all three open-source implementations.
- **Names/Media cost warning**: the two simple implementations have NO dedicated name/media selectors (blurred only incidentally inside containers). Independent Names/Media targets (Q5) inherit LukasLen-level breadth (~37 selectors for names alone) and per-category intensity differences (his defaults: messages 8px, names 5px, pics 3/8/12px, media 20px). Consequence for R1: the user-facing slider stays global, but the catalogue carries a per-target intensity multiplier internally (Design B idea, now evidence-backed).
- **R2 validated**: LukasLen reveals with `transition-delay: 0.3s` (no filter animation) — matches the Round 2 recommendation. web.dev: animating `filter` is paint-stage and costly on large areas; reveal-by-delay avoids it.
- **Singleton style element confirmed necessary**: piyushraj appends 8 new `<style>` elements on every settings change and never removes them — the exact leak our runtime design avoids.
- **Correction**: the original extension's author is **Lukas Lenhardt** (LukasLen), not "LukasHechenberger" as stated in the Round 1 grill message. Repo archived 2026-06-22; successor: aryomuzakki/privacy-whatsapp-web-auto-blur (MIT). Piyushraj repo has NO license.
- **Publish cost confirmed**: local-only does NOT exempt store privacy disclosure/privacy policy if published (policy triggers on *handling*, incl. "using"; whether pure-CSS blur counts as handling is officially Unknown). Selector fixes cannot be hot-pushed — they ship as store-reviewed updates, at WhatsApp's release cadence. Names/Media/trademark: no official blessing for WhatsApp marks; predecessors use non-affiliation disclaimers and non-WhatsApp icons.
- **Unknowns kept honest** (14 in research.md), incl.: copy/select/screen-reader exposure of blurred text is not documented in MDN/web.dev (do not claim it either way beyond DOM inspectability), quantified blur performance, whether calls/Status surfaces need JS observation.

## Round 3 — settled 2026-10-20, approved in full by Paduka Raja

- **S1 Name & icon**: product name **WA Blur**. Icon is a hairline eye glyph in the DESIGN.md register (ink on `#f6f8f7`, square) — never the WhatsApp logo, no implied affiliation.
- **S2 Guaranteed locales**: English + Indonesian at v1 — the locales actually verified against WhatsApp Web's localised `aria-label`s. Other locales are best-effort: structural selectors still apply, label-dependent targets (Names, Previews) are not guaranteed without fixtures.
- **S3 Verification & fixtures**: selectors are verified live on his WhatsApp Web during implementation, but every DOM fixture committed for tests is synthetic / fully sanitised — zero real contact names, zero real message content in the repo.
- **S4 Repo & next flow**: public GitHub repo `wa-blur` → setup-matt-pocock-skills → to-spec → to-tickets; no code before the spec. Local preparation proceeds now; GitHub repo creation and push wait for his explicit go (standing local-first rule).

## Post-grill amendment — 2026-10-20 (17:04 WIB)

- **Mode is REMOVED**, at Paduka Raja's decision ("Sederhanakan: hapus Mode, cukup toggle Hover Reveal"), after he asked what Screen Share Mode was for and judged the concept heavier than its single-bit difference. This supersedes: **D4** (Mode as a domain term — retired; see GLOSSARY.md, which now defines **Hover Reveal** instead), the Mode parts of **R3** (switching stays popup-only; the only shortcut is still `Alt+X`) and **R6** (the Hover Reveal choice persists in Settings like everything else; still no auto-detection), and the DESIGN.md adaptation note that reserved amber for Screen Share Mode — **amber now marks Hover Reveal OFF** (the presentation-safe state). Settings migration: the `mode` field is replaced by boolean `hoverReveal` (default on); `resolveSettings` maps a legacy stored `mode: "screen-share"` to `hoverReveal: false`. Note the latent mismatch this exposed: the glossary had defined Screen Share Mode as also forcing every target blurred, while the implementation only ever gated Reveal — the simplification removes that ambiguity by construction. The **Exposure** "Screen Share" remains a glossary term (it names a situation, not a Mode).

## Post-grill amendment #2 — 2026-10-21 (09:12 WIB)

- **Mode is RESTORED**, at Paduka Raja's tap ("Ikuti mockup persis: Mode Standard / Screen Share balik lagi"), superseding amendment #1 above. He supplied a new popup mockup (`design/popup-mockup-2026-10-21.png`) and adopted it wholesale as the popup's design. Consequences: (1) Settings field returns to `mode` ("standard" | "screen-share"); `resolveSettings` migrates a v1.1.x stored `hoverReveal` (false → screen-share, true → standard) and drops the key. (2) GLOSSARY once again defines Mode / Standard Mode / Screen Share Mode — with the Screen Share definition corrected to what the implementation does (gates Reveal only; per-target choices untouched), closing the latent mismatch amendment #1 had noted. (3) **Popup design authority changes**: the teenage-engineering DESIGN.md no longer governs the popup; the 2026-10-21 mockup does (pale blue-grey background, white 18px-radius cards, teal accent, pill toggles, per-target icons, intensity `px` badge, Local-Only footer card). The amber marker is retired entirely (it belonged to the superseded designs). The mockup's decorative "…" header button is omitted — no fake controls. DESIGN.md stays in the repo as the record of the v1.0.x popup.

## Post-grill amendment #3 — 2026-10-21 (10:33 WIB)

- **Extension icon replaced with the maintainer's own artwork**, superseding the icon half of **S1**. He supplied the artwork himself ("ini icon extensionnya"): abstract rounded squares / frosted glass in cyan-teal-navy, master at `src/assets/icon.png` (1130×1130 RGBA). The hairline eye SVG (`src/assets/icon.svg`) is deleted; `scripts/render-icons.sh` now scales the PNG master to the 16/32/48/128 PNGs, and the popup header tile shows the artwork as an `<img>` on a transparent tile (the artwork has transparent corners). Still never the WhatsApp logo; the product name in S1 is unchanged.

### Amendment #4 — 2026-10-21 (user's taps: "Gas: halaman Settings + shortcut Alt+Shift+S (v1.4.0)", then the roadmap below)

- **A Settings page exists**, superseding the "popup is the only surface" half of **R5**. It is an `options_ui` page (open in tab) reached from a gear icon in the popup header, and holds the rarely-touched knobs: **Reveal delay** (`revealDelayMs`, 100–800, default 300), **per-target intensity multipliers** (`multipliers`, 0.5–3 overrides on the catalogue constants), and **settings data** (export/import JSON, reset to defaults), plus an About section. The popup keeps the everyday controls; locale guarantees and the Local-Only promise are unchanged.
- **`Alt+Shift+S` toggles Mode** (command `toggle-mode`), the parity sibling of `Alt+X` for the master Toggle.
- **Roadmap approved the same day, in his order**: **v1.5.0 Lock Screen** — a full-screen PIN gate over WhatsApp Web (this activates the reserved term **Lock**, see GLOSSARY; PIN stored as a salted hash, honest deterrent-only framing, no recovery — Local-Only; auto-lock ships as an opt-in setting, default off; triggers: popup button, `Alt+Shift+L`) and **v1.6.0 Blur Type** — `blurStyle` with five values (Default blur, Mosaic, Redact, Frost, Fade), chosen in the popup.

### Amendment #5 — 2026-10-21 (user: "lock screen gitu maksud saya", then "Gas"/"gaskan")

- **The Lock Screen shipped as v1.5.0**, activating the reserved term **Lock** exactly as the glossary always defined it and as ADR-0002 anticipated ("a separate deep module with its own interface"): a pure `engine/lock.ts`, a `LockStore` over its own storage key `wa-blur:lock` (Settings export/reset never carry or clear the PIN), and a Shadow-DOM overlay runtime. ADR-0002's v1 exclusion stands for v1; this amendment supersedes it for later versions at the user's explicit request.
- Shape: PIN 4–6 digits, salted SHA-256 hash only; triggers = popup button, `Alt+Shift+L` (`lock-now`), and opt-in auto-lock after 1/5/15/30 idle minutes (default off, per his "dengan auto-lock" bundle read together with his queued order). Honest framing everywhere it is described: a deterrent for casual access, not encryption; no PIN recovery (reset via extension data). Permissions remain `storage` only.

### Amendment #6 — 2026-10-21 (user: "fitur blur type: Default, mozaik, saran dari kamu" → tap "Gas 5 tipe")

- **Blur Type shipped as v1.6.0**: `Settings.blurStyle` ∈ {blur, mosaic, redact, frost, fade}, default `blur`, chosen via chips in the popup (one style for all targets; per-target styles were not requested). Implementation notes worth keeping: Mosaic uses an SVG pixelate filter whose defs the style sink owns (cell size derives from the global intensity); Redact splits by a new catalogue `kind` (text targets get solid bars, image targets `brightness(0)`); the classic blur's transition string is unchanged, so the static first-paint stylesheet stays byte-identical (ADR-0001 intact). Redact's hover restore uses the inherited text colour — in WhatsApp's DOM the revealed colour is the inherited one by construction. With this, the 2026-10-21 roadmap (Settings page → Lock Screen → Blur Type) is complete; remaining known gaps are coverage probes (fullscreen media viewer, contact/group info panel), not yet scheduled.

### Amendment #7 — 2026-10-21 (user: "bisa ga settingnya gausah buka page baru. tetep di extensionnya gitu" → tap "Gas v1.7.0")

- **The Settings page is deleted; Settings is a second view inside the popup** (v1.7.0), superseding amendment #4's `options_ui` framing — the popup is again the only surface, now with two views (gear switches, back returns, the view re-renders from current state on every open). All sections moved whole into `src/settings-view.ts`, including the Lock Screen card. One platform-forced adaptation, disclosed to and accepted by the user before building: **import is paste-JSON** (an extension popup closes when a file dialog opens, so a file picker can never complete there); export remains a download.

### Amendment #8 — 2026-10-21 (live bug from the user's screenshot, fixed as v1.7.1)

- **Mosaic no longer lets thin elements vanish.** The v1.6.0 pixelate recipe sampled the raw graphic at single grid points; elements whose points all missed painted pixels (thin text, plain avatars) rendered nothing at all. The filter now pre-spreads the graphic (gaussian blur at half the cell size) and firms the alpha before sampling, so every cell yields a block. The step is load-bearing and commented as such in `buildPixelateDefs` — do not simplify it away.

### Amendment #9 — 2026-10-21 (user: "lebih bagus yang sebelumnya" — the v1.6.0 look)

- **Mosaic is two-layered** (v1.7.2): the v1.7.1 pre-blur coverage chain stays as the base, and the original v1.6.0 raw-sampling chain is merged over it (`feMerge`: base, then crisp). Wherever the crisp samples hit, blocks carry the true colours he preferred; the base shows only in gaps that would otherwise vanish. Both layers are load-bearing (look vs coverage) and commented as such.

### Amendment #10 — 2026-10-21 (user: "Mozaik 1 lapis aja" — supersedes #9)

- **Mosaic is ONE hardened chain** (v1.7.3), chosen by the user over both the bare v1.6.0 recipe and the v1.7.2 two-layer merge. His probe had shown every chat-list row carries the filter — the residual escapes were the sampling lottery INSIDE the filter, not selectors. The single chain: per-cell colour averaging (gaussian, cell/2) → alpha firming (slope 3) → full-cell dilate (`wa-blur-wide`, guarantees every sample dot near content catches colour — any content point lies within cell/√2 of a dot) → sampling → dilate into blocks. Block colour = per-cell average; vanishing is impossible by construction. Each spread step is load-bearing and commented as such.

### Amendment #11 — 2026-10-21 (user: "saya lebih suka versi awal" — supersedes #8, #9, #10)

- **Mosaic is the original v1.6.0 recipe again** (v1.7.4, byte-identical restore from `f637538`): raw point sampling → dilate. After live-testing every hardening variant, the user chose the original's crisp look with full knowledge of its trade-off, explained and accepted: the recipe only ever sees the graphic at grid points, so very thin/sparse elements can fall between points and escape — that lottery is intrinsic to point sampling (guaranteeing coverage requires spreading/averaging colour first, which is exactly what changed the look in v1.7.1–v1.7.3). Do not re-engineer Mosaic coverage unless he reopens it.

### Amendment #12 — 2026-10-21 (user's tap: "Gas v1.7.5" — supersedes #11)

- **Mosaic is native CSS now**: per-target gaussian blur (radius = cell) seen through a repeating grid mask (tile = cell − gap, gap ≈ 30% of cell, mask-composite intersect). The SVG pixelate machinery (defs element, `PIXELATE_FILTER_ID`, the runtime's cell plumbing) is deleted entirely. Why: an extensive live-debug session (probes v1–v4, a red-flood control, an A/B/C stage bisect) proved DOM coverage was always total and the identical recipe in fresh defs rendered the problem rows perfectly, yet the extension's own `url()`-referenced filter rendered unreliably on specific elements of his live WhatsApp page — while native CSS filters (blur) never failed on any element in any test. The user accepted softer tiles (per-cell blur average behind grid gaps) in exchange for the native path's reliability. If Mosaic ever misbehaves again, the fault is in the mask/blur declarations themselves — do not resurrect the SVG recipe without new evidence.

## Open

- Nothing in the grill. The frontier is empty.
