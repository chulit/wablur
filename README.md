# WA Blur

Visual Privacy for WhatsApp Web. WA Blur is a Chrome extension that blurs your chats on `web.whatsapp.com` until you choose to look — built for screen sharing and shared spaces.

## What it does

- Blurs six **Blur Targets**, each on its own toggle: **Messages**, **Previews**, **Names**, **Avatars**, **Media**, and the **Chat Header**. All six are blurred by default.
- Two **Modes**: in **Standard Mode**, a blurred target **Reveals** only while your cursor rests on it (a short pause — 300ms by default, adjustable — so a passing cursor reveals nothing). In **Screen Share Mode**, Reveal is off entirely — nothing is Revealed while you present. Switch modes from the popup or with `Alt+Shift+S`.
- A global **Toggle**: press `Alt+X` anywhere in Chrome, or use the master switch in the popup.
- One intensity slider (4–24px, default 8px). Media blurs harder than text by design; you only ever learn one knob.
- Five **Blur Types**, one look for everything: classic **Blur**, **Mosaic** (pixelated blocks — the intensity slider sets the block size), **Redact** (solid censor bars for text, blacked-out images), **Frost** (heavy milky wash), and **Fade** (greyscale with a light blur).
- A **Settings view inside the popup** (gear icon, no separate page): Reveal delay, per-target intensity multipliers, Lock Screen management, and settings export/import/reset — for the knobs you rarely touch. Import pastes JSON text (a file picker cannot survive inside an extension popup).
- A **Lock Screen**: an optional full-screen PIN gate over WhatsApp Web. Lock it from the popup or with `Alt+Shift+L`, or let it lock itself after inactivity (opt-in: 1/5/15/30 minutes). The PIN is stored only as a salted SHA-256 hash, in its own storage record, separate from your Settings.
- **Local-Only**: the extension has no backend, makes no network requests, and collects nothing. Your Settings live in your browser's storage (`chrome.storage.sync`); if your browser sync is on, your *browser* may carry them — the extension itself never contacts a server.
- Minimal by construction: the only permission it asks for is `storage`.

## What WA Blur is not

WA Blur gives **visual privacy, not security**. Blurring is a rendering effect: the blurred content is still present in the page, and anyone with access to the browser itself (DevTools, copy/paste, a screenshot tool that reads the DOM) can get to it. WA Blur stops eyes — a screen share audience, someone looking over your shoulder — not machines. The Lock Screen is a deterrent in the same spirit: it blocks casual viewing and clicking, but it is not encryption, anyone who can remove the extension can get past it, and a forgotten PIN has no recovery (reset the extension's data to start over). WA Blur is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta.

## Guaranteed locales

Blur Targets are guaranteed on WhatsApp Web in **English** and **Indonesian** — the two locales whose labels the selector catalogue is tested against. Other locales are best-effort: the structural selectors still apply, but label-dependent targets (Names, Previews) are not guaranteed there.

## Install (unpacked, from source)

Requires Node.js (for the build) and Chrome.

```sh
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repo's `extension/` folder.
3. Open [web.whatsapp.com](https://web.whatsapp.com) — everything is blurred from the first paint. Click the WA Blur toolbar icon to open the popup and adjust Modes, targets, and intensity.

## Development

```sh
npm test            # vitest suite (engine, catalogue fixtures EN+ID, runtime, store, popup, hardening)
npm run typecheck   # tsc --noEmit
npm run build       # regenerate the static stylesheet + bundle into extension/
```

How it fits together:

- **`BlurEngine`** (`src/engine/`) is a pure module — Settings in, CSS out — and the project's one test surface. All WhatsApp selector knowledge lives in its **catalogue**, as data.
- The shipped package includes a static stylesheet generated from that same catalogue, so the default state is blurred before any JavaScript runs.
- A thin **service worker** exists only to host the `Alt+X` command and to seed default Settings on install.
- Every DOM fixture in `tests/fixtures/` is synthetic — no real names or message content, ever.

WhatsApp changes its DOM regularly, and when it does, some selectors will stop matching. That maintenance is expected, and it is deliberately a catalogue-only fix: one file, then `npm run build`.

## License

Personal project, published for portfolio purposes. Not affiliated with WhatsApp or Meta.
