# 07: Indonesian locale guarantee

**What to build:** WhatsApp Web in Indonesian gets the same guarantee as English (ticket 02): all six Blur Targets blurred. Because WhatsApp's `aria-label` anchors are localised, the catalogue carries the Indonesian anchor variants as first-class data beside the English ones — same entries, locale variant selectors — rather than a separate Indonesian catalogue. Synthetic, fully sanitised ID fixtures prove the matching; nothing from a real account is committed (S3 rule).

**Blocked by:** 02 — All six Blur Targets (the ID variants extend the EN catalogue entries).

**Status:** ready-for-human

- [x] Every Blur Target's catalogue entry includes Indonesian anchor variants where the anchor is label-based — the catalogue has exactly two label-anchored anchors, and both gained ID counterparts (Names: `Daftar chat`; Avatars: `foto profil`). Every other selector is structural (`role`, `#main`, `span[title]`, classes) and locale-free. Locale-sensitive targets: Names and Avatars (label-anchored entries); Messages, Previews, Media, Chat Header are structural only
- [x] Synthetic ID fixture tests show every target's selectors matching fixture structure, per target, failing independently
- [x] No fixture in the repo contains a real contact name, phone number, or message text — fixtures are fully fictional ("Kontak A", "Contoh pesan satu"); a phone-number-pattern grep over `tests/fixtures/` returns nothing (the maintainer's personal denylist check remains available to him locally, uncommitted)
- [ ] Manual check on the maintainer's WhatsApp Web (ID): all six targets visibly blurred, typing surface legible — *live check, maintainer's WhatsApp Web (cannot run on the build VM)*
- [x] The spec's locale wording is honoured exactly: EN + ID guaranteed, other locales best-effort and nowhere claimed as guaranteed — nothing in the package claims any other locale (README wording lands in ticket 09)

## Comments

- 2026-10-20: Implemented (this commit). ID variants added as first-class catalogue data beside the EN anchors (no separate ID catalogue). New synthetic ID fixture mirrors the EN structure with Indonesian `aria-label`s; per-locale fixture suites assert every selector *for that locale* matches, with foreign-locale anchors filtered per suite, plus a dedicated counterpart test pinning the two EN↔ID anchor pairs. The static default sheet was regenerated (+4 rules: the two ID selectors, base + hover). 61 tests green, typecheck clean, build OK. Remaining: the manual ID live check — hence ready-for-human.
