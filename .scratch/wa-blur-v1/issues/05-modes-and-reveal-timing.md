# 05: Modes (Standard / Screen Share) and Reveal timing

**What to build:** The user picks a Mode in the popup — Standard or Screen Share — stored in Settings and restored on startup, with no auto-detection or auto-reset. In Standard Mode a blurred target Reveals only after the cursor rests on it for 300ms and re-blurs immediately when the cursor leaves; the Reveal is produced by transition-delay, never by animating `filter` on containers. In Screen Share Mode the compiled CSS contains zero hover rules, so no cursor movement can Reveal anything.

**Blocked by:** 03 — Settings and popup target toggles (Mode is a Settings field chosen in the popup).

**Status:** ready-for-human

- [x] Popup offers Standard / Screen Share Mode choice; the choice persists across browser restarts
- [x] Unit tests prove: Screen Share Mode → `compileCss` output contains no `:hover` rules; Standard Mode → exactly one hover rule per emitted base rule, carrying the 300ms reveal delay
- [x] Unit tests prove re-blur has no transition delay (immediate on cursor leave)
- [ ] Manual check: in Screen Share Mode, sweeping the cursor across the page Reveals nothing; in Standard Mode, a passing cursor Reveals nothing but a resting cursor does — *live check, maintainer's WhatsApp Web (cannot run on the build VM)*
- [x] Switching Mode applies live to the open tab without reload — through the store→`storage.onChanged`→runtime seam (tickets 01/03); final live observation is in ticket 09's checklist

## Comments

- 2026-10-20: Implemented (this commit). `compileCss` now pairs every base rule with a `:hover` rule in Standard Mode only: base carries `transition:filter 0.2s ease;transition-delay:0s`, hover carries `filter:none !important;transition-delay:0.3s` — the LukasLen transition-delay pattern (research.md §3.2), so Reveal waits for a 300ms rest and re-blur is immediate; the filter is never animated on containers. Screen Share Mode compiles to zero hover rules. The static default sheet was regenerated and now includes the scoped hover rules for the default (Standard) state. One ticket-01 static-CSS assertion was relaxed from exact rule string to the blur declaration, since base rules legitimately gained transition declarations. Popup gained the Mode control (two buttons, stored state shown on open, patch through the store). 47 tests green, typecheck clean, build OK. Remaining: the manual Reveal-timing observation — hence ready-for-human.

## Amendment — 2026-10-20

Superseded in part by the post-grill amendment (see `grill-decisions.md`): the Mode concept was removed at the maintainer's decision. This ticket's behaviour survives as the **Hover Reveal** switch — hover rules exist iff `hoverReveal` is on, with the same 300ms/rest + instant re-blur timing proven by the same tests (updated). "Mode choice in popup" and "Mode persists" read as "Hover Reveal switch in popup" and "the choice persists in Settings".

## Amendment #2 — 2026-10-21

The maintainer restored Modes (see `grill-decisions.md` amendment #2): the Hover Reveal switch shipped in v1.1.x is replaced again by the Standard / Screen Share Mode choice, with the same timing semantics (hover rules exist iff Standard). Settings migrate automatically both ways.
