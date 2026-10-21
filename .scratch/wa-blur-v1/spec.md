Status: ready-for-agent

# WA Blur v1 — Spec

Vocabulary: `GLOSSARY.md` (terms are used exactly as defined there). Decisions: `grill-decisions.md`. Evidence: `research.md`. ADRs: `docs/adr/0001-static-css-first-paint.md`, `docs/adr/0002-no-lock-in-v1.md`.

## Problem Statement

When a user opens WhatsApp Web on a shared screen — presenting or screen-sharing, or sitting in a café or office — anyone who can see the screen can read their Messages, see who they talk to, and recognise faces and Media. Existing blur extensions solve only part of this: hover-only Reveal leaks content during Screen Share when the cursor passes over it, several carry more permissions than they need, one paywalls basic targets such as Names and Avatars, and their wording promises "security" or "protection" that a visual Blur cannot honestly give. The user wants an extension that is theirs, Local-Only, honest about being Visual Privacy, and safe in the Screen Share exposure by default design — not by the user's vigilance.

## Solution

WA Blur is a Chrome extension (Manifest V3) for `web.whatsapp.com` that blurs six Blur Targets — Messages, Previews, Names, Avatars, Media, and Chat Header — each independently toggleable and all on by default. In Standard Mode a blurred target Reveals only while the cursor rests on it; in Screen Share Mode Reveal is unavailable and everything stays blurred. A global Toggle (`Alt+X` or the popup's master switch) turns Blur on or off without losing per-target choices. The popup — the extension's only surface — holds the master Toggle, the Mode choice, the six target toggles, and one intensity slider, styled after the maintainer's 2026-10-21 popup mockup (design/popup-mockup-2026-10-21.png). The extension has no backend, makes no network requests, and collects nothing.

## User Stories

1. As a WhatsApp Web user, I want every Blur Target blurred the first time I open WhatsApp Web after installing, so that I am protected before I configure anything.
2. As a user about to share my screen, I want to switch to Screen Share Mode in one action from the popup, so that no Reveal can leak content during the share.
3. As a user in Screen Share Mode, I want Reveal to be completely unavailable, so that moving my cursor never unblurs anything.
4. As a user in Standard Mode, I want a Message to Reveal only after my cursor rests on it for 300ms, so that the cursor merely passing over does not expose it.
5. As a user in Standard Mode, I want a target to re-blur immediately when my cursor leaves it, so that exposure lasts no longer than my attention.
6. As a user, I want to Toggle all Blur off and back on with `Alt+X`, so that I can check something privately without opening the popup.
7. As a user, I want Toggle to preserve my per-target choices and Mode, so that turning Blur back on restores exactly the state I had.
8. As a user, I want to blur Messages but not Avatars (and any other combination), so that the extension matches the exposure I am actually in.
9. As a user, I want Previews blurred, so that my Chat List does not leak conversations I have not even opened.
10. As a user, I want Names and the Chat Header blurred, so that who I am talking to stays private even when message bodies are already hidden.
11. As a user, I want Media and its thumbnails blurred at a stronger intensity than text, so that images are not recognisable through a light blur.
12. As a user, I want one intensity slider (4–24px, default 8px), so that I can tune strength without learning per-target controls.
13. As a user, I want my Settings applied live without reloading WhatsApp Web, so that changing a toggle takes effect in the open tab immediately.
14. As a user, I want my Settings and Mode to persist across browser restarts, so that the extension behaves the way I left it.
15. As a user, I want the page to be blurred from the very first paint, so that nothing flashes unblurred while WhatsApp Web loads.
16. As a user whose WhatsApp Web is in Indonesian, I want the same Blur Targets guaranteed as in English, so that my locale is not a second-class citizen.
17. As a user, I want the extension to keep working when WhatsApp adds messages or switches chats without any action from me, so that protection does not silently lapse mid-session.
18. As a user, I want the typing surface to stay legible at all times, so that I can compose messages normally while everything else is blurred.
19. As a user, I want the extension to make no network requests and hold no account, so that using it requires trusting no server — including the developer's.
20. As a user, I want the extension to ask for the smallest permission set possible, so that installing it does not grant access it does not use.
21. As a user with a corrupted or stale Settings value (e.g. after an update), I want the extension to fall back to safe defaults — blurred — rather than crash or expose content.
22. As a maintainer, I want all selector knowledge in one catalogue, so that a WhatsApp Web redesign is a one-place fix.
23. As a maintainer, I want Settings-to-CSS behaviour testable without Chrome or a WhatsApp account, so that the risky logic is covered by fast unit tests.
24. As a maintainer, I want test fixtures to be synthetic, so that maintaining this public repo never exposes the user's real contacts or messages.
25. As a maintainer, I want a WhatsApp selector break to affect only its own Blur Target, so that one redesign cannot take down the whole extension.

## Implementation Decisions

- **One deep module: `BlurEngine`** (pure, in-process, no DOM and no Chrome globals). Its interface is the test surface:
  - `DEFAULT_SETTINGS` — master on, Standard Mode, intensity 8, all six Blur Targets on.
  - `resolveSettings(raw: unknown): Settings` — the only entry for persisted data; always returns a complete valid Settings (per-field fallback to defaults, intensity clamped 4–24, unknown data dropped, fail-safe direction is toward blurred).
  - `compileCss(settings): CssText` — pure and deterministic; `CssText` is opaque and applied whole, never concatenated or split by callers. Master off yields empty CSS; a target off yields zero rules for it; Screen Share Mode yields zero hover rules; Standard Mode yields exactly one hover rule per base rule, with a 300ms reveal delay and no transition delay on re-blur.
  - `toggle(settings): Settings` — the single definition of what the global Toggle flips (master, preserving targets and Mode), shared by `Alt+X` and the popup's master switch.
- **Selector catalogue as data, inside the engine.** Each Blur Target is one catalogue entry: its id (closed union: `messages | previews | names | avatars | media | chatHeader`), popup label, selector list, default, and an internal intensity multiplier (so Media blurs harder than Names without any extra user-facing control). The engine exposes read-only target metadata so the popup renders its toggles from data, not hard-coded rows.
- **Selector strategy**: semantic anchors first (`aria-label`, `role`, structural ids), obfuscated classes only as a disposable fallback layer, and the previous WhatsApp generation's selectors kept as fallback within each entry. Localised anchor variants for English and Indonesian are both first-class catalogue data.
- **Thin `BlurRuntime` wiring** in the content script: it accepts an injected storage port and an injected style sink (it creates neither), subscribes to storage changes, and on each change runs `resolveSettings → compileCss → styleSink`. It owns exactly one style element, replaced wholesale — never appended duplicates. No MutationObserver anywhere: declarative CSS matches whatever DOM WhatsApp creates.
- **Static default stylesheet (ADR-0001)**: the shipped package contains a CSS file covering `DEFAULT_SETTINGS`, generated at build time from the same catalogue (one catalogue, two uses) and declared in the manifest's content scripts, so first paint is blurred before any JavaScript runs. The runtime's generated CSS then refines it to the user's actual Settings.
- **Settings storage**: one object under one key in `chrome.storage.sync`. The popup writes partial patches; merging happens inside the store seam, never by callers spreading objects. Rapid writes (slider drags) are debounced/coalesced inside the runtime/store, respecting sync write limits. Storage failure degrades to defaults in memory — Blur still applies.
- **Service worker, thin by necessity**: it exists only because `chrome.commands` handlers live there. Its jobs: on `Alt+X`, flip Settings via `toggle()` + a storage patch; on install, materialise defaults if absent. No other logic lives in it.
- **Manifest minimalism**: `manifest_version: 3`, permissions exactly `["storage"]`, one static content-script declaration matching `https://web.whatsapp.com/*`, one command with suggested key `Alt+X`. No `host_permissions`, no `activeTab`, no `scripting`.
- **Popup**: a single surface (no options page) containing master Toggle (an "Enable Blur" card), Mode choice (Standard / Screen Share segmented control), six target toggles rendered from engine metadata with per-target icons, the intensity slider with a live `px` badge, and a Local-Only footer card. English UI. Styling follows the maintainer's 2026-10-21 mockup (`design/popup-mockup-2026-10-21.png`): pale blue-grey background, white rounded cards (18px), teal accent for on-states and the active Mode, pill toggles, local system font stack (no remote font fetch).
- **Icon**: hairline eye glyph, ink on Canvas Mist, square — never the WhatsApp logo.
- **No Lock (ADR-0002)**: v1 has no PIN/idle Lock. If one is ever built it is a separate deep module consuming Settings; it is never folded into `BlurEngine`.
- **No remote anything**: no analytics, no update checks of its own, no remotely fetched selectors or CSS. Selector fixes ship as new extension versions.

## Testing Decisions

- A good test asserts observable behaviour through the `BlurEngine` interface — Settings in, CSS out — and survives a selector-catalogue rewrite; tests never assert on engine internals.
- `BlurEngine` unit tests (no Chrome, no DOM): defaults completeness; `resolveSettings` against undefined/corrupt/legacy/partial input (including the fail-safe-toward-blurred cases); clamping; `compileCss` invariants (master off → empty, target off → zero rules for it, Screen Share → zero hover rules, Standard → hover rule per base rule with the 300ms delay); `toggle` round-trips preserving targets and Mode.
- Catalogue tests: every Blur Target resolves to at least one selector in each guaranteed locale (EN, ID) against synthetic, sanitised DOM fixtures; a target whose selectors match nothing fails its own test without failing others.
- Runtime tests use the in-memory storage adapter and a string style sink (the production adapters' test counterparts — the seam is real because two adapters exist): a storage patch produces exactly one replacement stylesheet; repeated changes never accumulate style elements.
- Prior art: none in this repo (greenfield). The seam discipline follows the codebase-design comparison recorded in `grill-decisions.md` — tests replace, not layer: no tests are written against the runtime's internals or the popup's rendering details.
- Manual live verification (per release, on the maintainer's own WhatsApp Web, EN and ID): first-paint blurred on hard reload; all six targets blurred; 300ms Reveal and instant re-blur; Screen Share Mode admits no Reveal; `Alt+X` round-trip; Settings change applies without reload; typing surface legible throughout. Live verification observes his own account only — nothing from it is committed except sanitised fixture structure.

## Out of Scope

- Chrome Web Store publication (a separate later decision, with its own policy/paperwork surface documented in `research.md` §2).
- Any Lock: PIN, password, or blur-on-idle.
- Firefox, Edge-specific work, the WhatsApp desktop apps, and any site other than `web.whatsapp.com`.
- WhatsApp surfaces beyond the six Blur Targets: Status viewer, Calls UI, Communities internals (whether they are CSS-addressable is officially unknown — `research.md` Unknown #10).
- Per-target intensity controls in the UI; auto-detection of screen sharing of any kind.
- User-defined Modes/presets beyond Standard and Screen Share.
- Reading, storing, or transmitting any message content, contact data, or usage data — by design, forever, not just v1.

## Further Notes

- The honest product claim is Visual Privacy (see `GLOSSARY.md`): blurred content still exists in the page. Marketing or listing copy must never use "secure", "protect", or "lock" for what Blur does (D1).
- Maintenance expectation, from the evidence: WhatsApp Web redesigns will periodically break selectors — roughly per major WhatsApp release — and each break should be a catalogue-only fix (the locality the design was chosen for). Keeping the previous generation's selectors in the catalogue is deliberate, evidence-backed ballast.
- Name and trademark posture (`research.md` §2.3): "WA Blur" is a descriptive name with no affiliation implied; if publication is ever pursued, add the predecessors' non-affiliation disclaimer pattern and re-check policy then.
