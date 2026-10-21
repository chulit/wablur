# 02: All six Blur Targets in the catalogue (EN)

**What to build:** Extend the selector catalogue from Messages-only to all six Blur Targets — Messages, Previews, Names, Avatars, Media, Chat Header — so that with default Settings every target is blurred on the English WhatsApp Web. Selectors are semantic-first (`aria-label`, `role`, structural ids), with obfuscated classes only as a disposable fallback layer and the previous WhatsApp generation's selectors kept as fallback. Each target fails independently: selectors that match nothing affect only their own target.

**Blocked by:** 01 — Walking skeleton (catalogue, engine, static-CSS generation must exist).

**Status:** ready-for-human

- [x] All six Blur Targets have catalogue entries with id, popup label, selectors, default on
- [x] Unit tests prove `compileCss` emits at least one base rule per enabled target and zero rules for a disabled target
- [x] Synthetic EN fixture tests show every target's selectors matching fixture structure
- [x] The regenerated static stylesheet covers all six targets (no diff on regeneration)
- [x] No selector from an obfuscated class is the *only* selector for a target where a semantic anchor exists — semantic/structural anchors lead every entry; the one exception is Previews, where no semantic anchor exists in either predecessor (research.md §3.1–§3.2), noted in the catalogue
- [ ] Manual check on the maintainer's WhatsApp Web (EN): all six targets visibly blurred, typing surface legible — *live check, maintainer's WhatsApp Web (cannot run on the build VM)*

## Comments

- 2026-10-20: Implemented (this commit). Catalogue completed for Previews, Names, Avatars, Media, Chat Header from research.md §3–§4 patterns: semantic anchors first (`aria-label`/`role`/`#main`/`span[title]`), obfuscated classes as labelled fallback layers, previous-generation selectors kept (`._2AOIt`, `.vQ0w7`, `role="row"] ._ak8q`, `._1AHcd ._13jwn`). Multipliers per predecessor defaults: messages ×1, previews ×1, names ×0.6 (5px), avatars ×0.5 (~4px), media ×2.5 (20px), chatHeader ×1. EN fixture extended to both generations, fully fictional, plus a typing-surface assertion (no selector matches the compose box). One ticket-01 test assertion was corrected from substring to rule-selector comparison (Media legitimately anchors inside `.focusable-list-item`). 27 tests green, typecheck clean, build OK. Remaining: the manual EN live check — hence ready-for-human.
