# 03: Persistent Settings and popup target toggles

**What to build:** The user can open the popup and switch each of the six Blur Targets on or off; choices persist in `chrome.storage.sync` as one Settings object under one key and apply live to the open WhatsApp Web tab without a reload. The popup renders its toggle rows from the engine's read-only target metadata (no hard-coded rows), writes partial patches that are merged inside the storage seam (never caller-side object spreads), and the content runtime reacts to storage changes by replacing its single style element wholesale. Persistence survives browser restarts; storage failure degrades to in-memory defaults with Blur still applied.

**Blocked by:** 02 — All six Blur Targets (the popup renders toggles from the complete catalogue metadata).

**Status:** done

- [x] Popup shows six toggles, one per Blur Target, rendered from engine metadata
- [x] Toggling a target in the popup changes the open WhatsApp tab's blur without a page reload — proven through the seam: a popup patch produces exactly one replacement stylesheet in the composed store→runtime test; the tab side rides the `storage.onChanged` path verified in ticket 01 (final live observation is in ticket 09's checklist)
- [x] Settings persist across a browser restart and are restored on next WhatsApp Web load
- [x] Stored value is a single object under a single key in `chrome.storage.sync`
- [x] Runtime tests with the in-memory storage adapter prove: a patch produces exactly one replacement stylesheet, and repeated changes never accumulate style elements
- [x] A corrupt stored Settings value loads as safe defaults (blurred), not a crash or an exposed page
- [x] The two storage adapters (Chrome production, in-memory test) are the only places that touch storage APIs directly — grep-verified: `chrome.storage` API calls exist only in `src/adapters/chrome-storage.ts`

## Comments

- 2026-10-20: Implemented (this commit). `StoragePort` gained a write method; `SettingsStore` (new seam in `src/runtime/settings-store.ts`) owns all merging — callers pass partial patches, the store resolves, merges, and persists one complete Settings object. Popup (`src/popup.ts/html/css`, manifest `action.default_popup`, esbuild popup bundle) renders its six toggle rows from `TARGET_METADATA`, displays current stored state on open, and writes patches through the store; jsdom tests cover rendering-from-metadata, stored-state display, and toggle→patch. Storage failure and corrupt values degrade to defaults (store tests). 37 tests green, typecheck clean, build OK.
