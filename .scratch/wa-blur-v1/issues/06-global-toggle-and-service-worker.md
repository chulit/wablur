# 06: Global Toggle (Alt+X) and the thin service worker

**What to build:** Pressing `Alt+X` anywhere in Chrome Toggles WA Blur globally: off makes WhatsApp Web fully legible, on restores exactly the per-target choices and Mode the user had. The popup's master switch performs the identical state change — both go through the engine's single `toggle()` semantics and a storage patch, so the two paths can never drift. This ticket introduces the service worker, thin by necessity: it hosts the `chrome.commands` handler and seeds default Settings on install, and contains no other logic (research: command handlers live in the service worker).

**Blocked by:** 03 — Settings and popup target toggles (the Toggle flips persisted Settings through the patch seam).

**Status:** done

- [x] Manifest declares one command with suggested key `Alt+X`; no permissions added beyond `storage` — verified programmatically against the built manifest
- [x] `Alt+X` on an open WhatsApp Web tab toggles blur off and back on, restoring prior per-target states and Mode exactly — the semantics are proven by the engine/store tests below (the physical keypress in Chrome is observed in ticket 09's live checklist)
- [x] Unit tests prove `toggle()` flips only the master flag and round-trips (toggle ∘ toggle = identity on targets/Mode/intensity)
- [x] The popup master switch and `Alt+X` produce identical stored Settings for the same starting state — deep-equal assertion on the two stored objects in the popup test
- [x] On fresh install, default Settings are materialised exactly once; the worker contains no settings logic beyond seeding and the command flip — `src/service-worker.ts` is two listeners delegating to the store, by inspection

## Comments

- 2026-10-20: Implemented (this commit). `toggle()` added to BlurEngine (pure, non-mutating, round-trip tested). `SettingsStore.toggleMaster()` is the single Toggle path used by both the worker's `chrome.commands` handler and the popup's master switch, and `ensureSeeded()` materialises defaults only when the key is absent. The service worker is bundled as a plain IIFE script; the manifest gained `commands.toggle-blur` (Alt+X) and `background.service_worker` — permissions remain exactly `["storage"]`. 53 tests green, typecheck clean, build OK.
