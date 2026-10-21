# 04: Intensity slider and per-target multipliers

**What to build:** The popup gains one intensity slider (4–24px, default 8px) that sets the global blur strength. Per-target intensity multipliers live inside the catalogue as internal data — the user never sees them — so Media blurs materially harder than text targets and Names slightly softer, following the predecessor evidence in `research.md`. Slider writes are debounced/coalesced inside the storage seam so a drag cannot hammer `chrome.storage.sync` write limits.

**Blocked by:** 03 — Settings and popup target toggles (slider is a popup control writing through the patch seam).

**Status:** done

- [x] Slider in the popup adjusts blur strength live in the open tab, 4–24px, default 8px — slider writes flow through the store→runtime seam (one replacement stylesheet per stored change, ticket 03); the live-tab observation is in ticket 09's checklist
- [x] Unit tests prove clamping: stored or patched values outside 4–24 resolve into range
- [x] Unit tests prove the effective blur for Media exceeds the global value and for Names is at or below it, per catalogue multipliers — pinned to the research values at global 8px (messages 8, names 5, media 20)
- [x] A simulated slider drag produces coalesced storage writes (runtime test counting adapter writes) — 5 rapid `patchSoon` calls → exactly 1 write
- [x] The chosen intensity persists across browser restarts

## Comments

- 2026-10-20: Implemented (this commit). The debounce lives inside the SettingsStore seam as `patchSoon` (200ms trailing window, patches combined per-field, an immediate `patch` flushes a pending one first) — so every caller inherits quota-safe writes rather than the popup debouncing privately. Popup slider (`input[type=range]`, 4–24 step 1) shows the stored value and a live `Npx` readout, writing via `patchSoon` on `input`. 44 tests green, typecheck clean, build OK.
