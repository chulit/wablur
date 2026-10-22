import { shouldAutoLock, type LockRecord } from "../engine/lock.js";
import type { LockStore } from "./lock-store.js";

/**
 * LockRuntime — the content-side wiring for the Lock gate (see
 * engine/lock.ts for the record and rules). It owns exactly two
 * things: the full-screen overlay (a Shadow DOM host on the page,
 * shown iff the record says locked AND a PIN exists) and the
 * opt-in auto-lock idle watcher. All state changes travel through
 * the LockStore and its change events — unlocking writes
 * locked=false and the overlay dismisses itself when the change
 * arrives; nothing removes the overlay by a side path.
 */

const HOST_ID = "wa-blur-lock";
const CHECK_INTERVAL_MS = 15_000;

/**
 * Input signals that count as "the user is here". Listeners are
 * registered in the capture phase so page handlers cannot starve
 * the tracker by stopping propagation, and wheel/mousemove are
 * first-class activity because scrolling and reading are active
 * use — with pointerdown + keydown alone, the watcher locked the
 * page mid-use at the 1-minute setting (live bug, 2026-10-21).
 */
const ACTIVITY_EVENTS: readonly string[] = [
  "pointerdown",
  "keydown",
  "wheel",
  "mousemove",
  "touchstart",
];
const ACTIVITY_LISTENER_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: true,
};

/* Small lock glyph sitting inside the PIN pill. */
const LOCK_MARK =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="4" y="11" width="16" height="10" rx="2"/>' +
  '<path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const ARROW_MARK =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" ' +
  'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/></svg>';

/* Inline recreation of the badge mark — a grid of rounded squares
   in cyan / teal / navy — used only when the real icon cannot be
   addressed (chrome.runtime unavailable, e.g. in tests). */
const GRID_MARK =
  '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">' +
  '<rect x="3" y="3" width="12" height="12" rx="3.5" fill="#2ec5d8"/>' +
  '<rect x="18" y="3" width="12" height="12" rx="3.5" fill="#0b8ea3"/>' +
  '<rect x="33" y="3" width="12" height="12" rx="3.5" fill="#10365e"/>' +
  '<rect x="3" y="18" width="12" height="12" rx="3.5" fill="#0b8ea3"/>' +
  '<rect x="18" y="18" width="12" height="12" rx="3.5" fill="#2ec5d8" fill-opacity="0.55"/>' +
  '<rect x="33" y="18" width="12" height="12" rx="3.5" fill="#0e5a74"/>' +
  '<rect x="3" y="33" width="12" height="12" rx="3.5" fill="#10365e"/>' +
  '<rect x="18" y="33" width="12" height="12" rx="3.5" fill="#2ec5d8"/>' +
  '<rect x="33" y="33" width="12" height="12" rx="3.5" fill="#0b8ea3" fill-opacity="0.6"/>' +
  "</svg>";

/**
 * URL of the real extension icon for the badge, or null when the
 * chrome runtime cannot address it (tests, torn-down contexts) —
 * the badge then falls back to the inline grid mark above. The
 * manifest exposes icons/icon-128.png as a web-accessible resource
 * so this page-side overlay may load it.
 */
function badgeIconUrl(): string | null {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("icons/icon-128.png");
    }
  } catch {
    // Fall through to the inline mark.
  }
  return null;
}

/* The lock screen carries its own visual protection — a strengthened
   backdrop blur under a deep-blue tint (the mood of
   design/lock-screen-mockup-2026-10-21.png, without a wallpaper
   asset) — so the page is covered even if the master Blur Toggle is
   off. Styles live inside the shadow root: nothing from WhatsApp's
   stylesheets can leak in, and none of this leaks out.

   One leak the shadow root cannot stop: the cascade for the HOST
   element itself. For inherited properties, the page's stylesheets
   beat `:host` rules — WhatsApp's global reset forces font:inherit
   on divs, so a font stack declared only on `:host` loses and the
   host inherits the page root's UA-default serif (live-probed
   2026-10-22: host, backdrop, title and input all computed to
   "Times"). The font stack is therefore ALSO declared on
   `.backdrop`, an element inside the shadow tree that page CSS
   cannot reach; everything in the gate inherits it from there.
   Non-inherited `:host` properties (position, z-index) are safe
   where they are — the page sets nothing competing on the host. */
const OVERLAY_CSS = `
:host {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter,
    "Helvetica Neue", Arial, sans-serif;
}
.backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter,
    "Helvetica Neue", Arial, sans-serif;
  background:
    radial-gradient(130% 100% at 50% 0%, rgba(31, 116, 184, 0.38),
      rgba(5, 34, 74, 0.55) 62%),
    rgba(4, 24, 52, 0.45);
  backdrop-filter: blur(28px) saturate(1.35);
  -webkit-backdrop-filter: blur(28px) saturate(1.35);
}
.gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 320px;
  max-width: calc(100vw - 48px);
  text-align: center;
  color: #ffffff;
}
.gate.shake {
  animation: wa-blur-shake 0.3s ease;
}
@keyframes wa-blur-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-7px); }
  75% { transform: translateX(7px); }
}
.badge {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 32px rgba(2, 18, 44, 0.4);
  margin-bottom: 16px;
}
.badge img {
  width: 46px;
  height: 46px;
  border-radius: 11px;
  display: block;
}
h1 {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.2px;
  margin: 0 0 5px;
}
.sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  margin: 0 0 24px;
}
.pill {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 46px;
  box-sizing: border-box;
  padding: 0 6px 0 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.pill:focus-within {
  border-color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.18);
}
.pill.bad {
  border-color: rgba(255, 120, 110, 0.9);
}
.pill .lock {
  display: flex;
  flex: none;
  color: rgba(255, 255, 255, 0.7);
}
input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 15px;
  letter-spacing: 2px;
  color: #ffffff;
  caret-color: #ffffff;
}
input::placeholder {
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: normal;
}
input:focus {
  outline: none;
}
button {
  flex: none;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
button:hover {
  background: rgba(255, 255, 255, 0.34);
}
.error {
  min-height: 16px;
  margin: 10px 0 0;
  font-size: 12px;
  color: #ffa79d;
}
`;

export interface LockRuntimeDeps {
  store: LockStore;
  doc: Document;
  /** Clock seam for the auto-lock watcher; defaults to Date.now. */
  now?: () => number;
}

export async function startLockRuntime(
  deps: LockRuntimeDeps,
): Promise<() => void> {
  const { store, doc } = deps;
  const now = deps.now ?? Date.now;

  let host: HTMLElement | null = null;
  let current: LockRecord = await store.read();
  let lastActivity = now();
  let stopped = false;

  function buildOverlay(): HTMLElement {
    const el = doc.createElement("div");
    el.id = HOST_ID;
    const shadow = el.attachShadow({ mode: "open" });
    const iconUrl = badgeIconUrl();
    const badgeInner =
      iconUrl !== null
        ? `<img src="${iconUrl}" alt="" width="46" height="46" />`
        : GRID_MARK;
    shadow.innerHTML =
      `<style>${OVERLAY_CSS}</style>` +
      '<div class="backdrop"><form class="gate" novalidate>' +
      `<div class="badge">${badgeInner}</div>` +
      "<h1>WA Blur</h1>" +
      '<p class="sub">Enter password to unlock WhatsApp</p>' +
      '<div class="pill">' +
      `<span class="lock">${LOCK_MARK}</span>` +
      '<input type="password" inputmode="numeric" autocomplete="off" ' +
      'aria-label="PIN" placeholder="Enter password" />' +
      `<button type="submit" aria-label="Unlock">${ARROW_MARK}</button>` +
      "</div>" +
      '<p class="error" role="alert"></p>' +
      "</form></div>";

    const form = shadow.querySelector("form")!;
    const input = shadow.querySelector("input")!;
    const error = shadow.querySelector(".error")!;
    const pill = shadow.querySelector(".pill")!;
    input.addEventListener("input", () => pill.classList.remove("bad"));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void (async () => {
        if (await store.verifyPin(input.value)) {
          // Dismissal happens when the stored change comes back
          // through the subscription — never by removing the
          // overlay directly from here.
          await store.setLocked(false);
        } else {
          error.textContent = "Incorrect PIN — try again.";
          pill.classList.add("bad");
          input.value = "";
          form.classList.remove("shake");
          // Restart the shake animation even on repeated failures.
          void (form as HTMLElement).offsetWidth;
          form.classList.add("shake");
          input.focus();
        }
      })();
    });
    return el;
  }

  function render(record: LockRecord): void {
    current = record;
    // locked without a PIN is an inconsistent record: fail safe
    // toward the owner (no gate nothing could open).
    const shouldShow = record.locked && record.pinHash !== null;
    if (shouldShow && !host) {
      host = buildOverlay();
      doc.documentElement.append(host);
      host.shadowRoot?.querySelector("input")?.focus();
      // Engaging the gate restarts the idle clock for next time.
      lastActivity = now();
    } else if (!shouldShow && host) {
      host.remove();
      host = null;
    }
  }

  function checkAutoLock(): void {
    if (stopped || current.locked) return;
    if (
      shouldAutoLock(
        now(),
        lastActivity,
        current.autoLockMinutes,
        current.pinHash !== null,
      )
    ) {
      void store.setLocked(true);
    }
  }

  const noteActivity = () => {
    lastActivity = now();
  };
  const onVisibility = () => {
    // Becoming visible re-checks the idle time; becoming hidden
    // locks immediately if the limit was already exceeded while
    // the user was still looking at the page.
    checkAutoLock();
  };

  render(current);
  const unsubscribe = store.subscribe(render);
  for (const type of ACTIVITY_EVENTS) {
    doc.addEventListener(type, noteActivity, ACTIVITY_LISTENER_OPTIONS);
  }
  doc.addEventListener("visibilitychange", onVisibility);
  const timer = setInterval(checkAutoLock, CHECK_INTERVAL_MS);

  return () => {
    stopped = true;
    unsubscribe();
    for (const type of ACTIVITY_EVENTS) {
      // Removal only matches a registration whose capture flag
      // agrees, so teardown must pass capture back explicitly.
      doc.removeEventListener(type, noteActivity, { capture: true });
    }
    doc.removeEventListener("visibilitychange", onVisibility);
    clearInterval(timer);
    host?.remove();
    host = null;
  };
}
