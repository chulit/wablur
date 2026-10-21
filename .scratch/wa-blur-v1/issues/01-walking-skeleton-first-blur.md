# 01: Walking skeleton — first blur end-to-end

**What to build:** An installable (unpacked) Chrome extension whose only behaviour is: opening WhatsApp Web shows Messages blurred from the first paint, with no configuration. This establishes the one test seam the whole project uses: a pure `BlurEngine` (`resolveSettings`, `compileCss`) whose Settings-in → CSS-out behaviour is exercised by unit tests, a thin runtime that accepts injected storage/style adapters and applies the generated CSS through a single owned style element, and a static stylesheet for the default state generated from the same selector catalogue (ADR-0001). The manifest is minimal: MV3, `permissions: ["storage"]`, one static content-script declaration for `https://web.whatsapp.com/*`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] Extension loads unpacked in Chrome with no manifest warnings beyond the content-script match — *live check, maintainer's Chrome (cannot run on the build VM)*
- [ ] On a hard reload of web.whatsapp.com, Messages are blurred at first paint — no unblurred flash — *live check, maintainer's Chrome*
- [x] `compileCss(DEFAULT_SETTINGS)` produces a base blur rule for Messages, proven by a unit test with no Chrome and no DOM
- [x] `resolveSettings` returns complete defaults for undefined input, proven by a unit test
- [x] The shipped static stylesheet is generated from the same catalogue as the runtime CSS (regenerating it produces no diff)
- [x] The runtime owns exactly one style element after repeated application — proven composed (runtime → real DomStyleSink) after code-review finding (a)
- [x] A synthetic EN fixture test shows the Messages selectors matching fixture structure

## Comments

- 2026-10-20: Implemented (commit 6810e34) and code-reviewed on both axes. Fixes applied in the follow-up commit: catalogue entries now carry `defaultEnabled` and `DEFAULT_SETTINGS.targets` derives from the catalogue (Standards, hard violation); manifest description no longer promises Names/Media/Reveal (Spec b); static-CSS vs runtime cascade bug fixed by scoping static rules to `:root:not(.wa-blur-live)` + the sink's LIVE_CLASS takeover mark, with a composed runtime→sink test (Spec a, c); built `extension/content.js` + `extension/manifest.json` are now gitignored build outputs (Standards, Duplicated Code). 17 tests green, typecheck clean. Remaining: the two live-Chrome checks above, on the maintainer's machine — hence ready-for-human.
