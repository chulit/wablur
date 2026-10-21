# 09: Hardening and sideload release

**What to build:** WA Blur v1 becomes a releasable sideload build. The failure directions are all covered by tests: legacy or partial Settings shapes from older versions resolve to safe complete Settings; storage read/write failures degrade to defaults with Blur still applied; a Blur Target whose selectors stop matching (simulated by an empty-match fixture) leaves every other target working. The maintainer runs the full live verification checklist from the spec's Testing Decisions on his own WhatsApp Web in EN and ID. The repo gains a README: what WA Blur is (Visual Privacy, honestly worded — never "secure/protect/lock"), how to install it unpacked, how to run the tests, and the non-affiliation note (independent project, not affiliated with WhatsApp Inc. / Meta). The build is versioned and ready to tag; creating the GitHub repo and pushing still wait for the maintainer's explicit go.

**Blocked by:** 04 — Intensity slider, 06 — Global Toggle, 07 — Indonesian locale, 08 — Popup design and icon (all functional and visual tickets complete).

**Status:** ready-for-human

- [x] Tests cover legacy/partial/corrupt Settings shapes resolving to safe defaults (fail toward blurred)
- [x] Tests cover storage failure: defaults applied in memory, Blur still active, no thrown errors reaching the page — read failure (ticket 03) and now write failure: a rejecting `set` degrades inside the store instead of throwing at popup/worker callers
- [x] Tests cover one target matching nothing: other targets' CSS is emitted unchanged — fixture-level independence test (dialog removed → Names keeps its other anchors, all other targets unaffected, emission unchanged)
- [ ] The full live verification checklist (spec, Testing Decisions) passes on the maintainer's WhatsApp Web in EN and ID, including first-paint, Reveal timing, Screen Share Mode, `Alt+X` round-trip, and live Settings changes — *live check, maintainer's Chrome + WhatsApp Web (cannot run on the build VM)*
- [x] README exists with honest Visual Privacy wording, unpacked-install steps, test instructions, and the non-affiliation note; a wording sweep finds no "secure/protect/lock" claim about Blur in README or popup — sweep run: the only related word is "security" inside the negated honesty sentence ("visual privacy, not security")
- [x] The extension directory zips/loads cleanly as the v1 sideload artifact with a single version string in the manifest — zip verified: every manifest-referenced file present in the archive, version `1.0.0`, permissions exactly `["storage"]` (actual Chrome loading remains part of the live check above)

## Comments

- 2026-10-20: Implemented (this commit). Hardening suite added (`tests/hardening.test.ts`): predecessor-shaped legacy objects, wrong-typed fields, arrays/class instances, write-failure degradation (store change), and the target-independence fixture test. README written with the honest Visual Privacy framing, Local-Only explanation, EN+ID guarantee wording, unpacked-install steps, dev commands, architecture notes, and the non-affiliation statement. Version bumped to 1.0.0 in the manifest (and package/lockfile to match). 76 tests green, typecheck clean, build OK, zip verified. Remaining: the maintainer's live verification checklist in EN and ID — hence ready-for-human.
