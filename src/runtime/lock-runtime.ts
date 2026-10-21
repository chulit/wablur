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

const LOCK_MARK =
  '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" ' +
  'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="11" width="18" height="11" rx="2"/>' +
  '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

/* The lock screen carries its own visual protection — backdrop blur
   plus a dark tint — so the page is covered even if the master Blur
   Toggle is off. Styles live inside the shadow root: nothing from
   WhatsApp's stylesheets can leak in, and none of this leaks out. */
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
  background: rgba(9, 24, 30, 0.45);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
.card {
  background: #ffffff;
  border-radius: 18px;
  padding: 28px 28px 24px;
  width: 300px;
  max-width: calc(100vw - 48px);
  text-align: center;
  color: #12262e;
  box-shadow: 0 12px 40px rgba(9, 24, 30, 0.35);
}
.card.shake {
  animation: wa-blur-shake 0.3s ease;
}
@keyframes wa-blur-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-7px); }
  75% { transform: translateX(7px); }
}
.mark {
  display: flex;
  justify-content: center;
  color: #0899ad;
  margin-bottom: 10px;
}
h1 {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 4px;
}
.sub {
  font-size: 12.5px;
  color: #7a8b96;
  margin: 0 0 16px;
}
input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font: inherit;
  font-size: 16px;
  text-align: center;
  letter-spacing: 4px;
  border: 1px solid #d8e2e7;
  border-radius: 10px;
  background: #ffffff;
  color: #12262e;
}
input:focus {
  outline: 2px solid #0899ad;
  outline-offset: 1px;
}
.error {
  min-height: 16px;
  margin: 8px 0 4px;
  font-size: 12px;
  color: #b3261e;
}
button {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: #0bb5c7;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
button:hover {
  background: #0899ad;
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
    shadow.innerHTML =
      `<style>${OVERLAY_CSS}</style>` +
      '<div class="backdrop"><form class="card" novalidate>' +
      `<div class="mark">${LOCK_MARK}</div>` +
      "<h1>WA Blur is locked</h1>" +
      '<p class="sub">Enter your PIN to keep using WhatsApp Web.</p>' +
      '<input type="password" inputmode="numeric" autocomplete="off" ' +
      'aria-label="PIN" placeholder="PIN" />' +
      '<p class="error" role="alert"></p>' +
      '<button type="submit">Unlock</button>' +
      "</form></div>";

    const form = shadow.querySelector("form")!;
    const input = shadow.querySelector("input")!;
    const error = shadow.querySelector(".error")!;
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
