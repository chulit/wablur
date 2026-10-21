# AGENTS.md — WA Blur

WA Blur is a Chrome extension (Manifest V3) that gives WhatsApp Web Visual Privacy by blurring content until the user reveals it. Local-Only: no backend, no network requests by the extension, no tracking.

Before designing, building, or testing: read `GLOSSARY.md` for vocabulary (use its terms exactly) and `grill-decisions.md` for settled decisions. Open `research.md` only for a platform/policy/selector fact; open `DESIGN.md` only when building or reviewing the popup's visual design.

Conventions:
- Commits: Conventional Commits in Indonesian — `tipe(scope): deskripsi` (feat, fix, docs, ci, chore, test, refactor).
- Workflow: work locally, commit locally; push and PR only after Paduka Raja's confirmation.
- Every DOM fixture committed for tests is synthetic / fully sanitised — never real contact names or message content.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, label string equal to role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
