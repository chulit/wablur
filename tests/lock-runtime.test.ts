import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { shouldAutoLock, type DigestFn } from "../src/engine/lock.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { LockStore } from "../src/runtime/lock-store.js";
import { startLockRuntime } from "../src/runtime/lock-runtime.js";

/** Deterministic stub digest: a stable 64-char hex fingerprint of
 *  its input, so stored records pass the same shape validation the
 *  real SHA-256 output does (resolveLockRecord requires hex-64). */
const stubDigest: DigestFn = (data) => {
  const hex = [...data]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return Promise.resolve(hex.padEnd(64, "0").slice(0, 64));
};

function freshDocument(): Document {
  return new JSDOM(
    "<!doctype html><html><head></head><body><div id='app'></div></body></html>",
  ).window.document;
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

async function lockedStore(): Promise<{
  port: InMemoryStorageAdapter;
  store: LockStore;
}> {
  const port = new InMemoryStorageAdapter(undefined);
  const store = new LockStore(port, {
    digest: stubDigest,
    randomSalt: () => "c0ffee1234",
  });
  await store.setPin("1234");
  return { port, store };
}

function overlay(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>("#wa-blur-lock");
}

function overlayInput(doc: Document): HTMLInputElement {
  return overlay(doc)!.shadowRoot!.querySelector("input")!;
}

describe("shouldAutoLock", () => {
  const MIN = 60_000;
  it("never locks when auto-lock is off or no PIN exists", () => {
    expect(shouldAutoLock(100 * MIN, 0, 0, true)).toBe(false);
    expect(shouldAutoLock(100 * MIN, 0, 5, false)).toBe(false);
  });

  it("locks exactly at the limit and beyond, not before", () => {
    expect(shouldAutoLock(5 * MIN - 1, 0, 5, true)).toBe(false);
    expect(shouldAutoLock(5 * MIN, 0, 5, true)).toBe(true);
    expect(shouldAutoLock(6 * MIN, 0, 5, true)).toBe(true);
  });
});

describe("Lock overlay", () => {
  it("renders in a shadow root when locked with a PIN", async () => {
    const { store } = await lockedStore();
    await store.setLocked(true);
    const doc = freshDocument();
    const stop = await startLockRuntime({ store, doc });

    const host = overlay(doc);
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
    expect(host!.shadowRoot!.textContent).toContain("WA Blur");
    expect(host!.shadowRoot!.textContent).toContain(
      "Enter password to unlock WhatsApp",
    );
    expect(overlayInput(doc).type).toBe("password");
    expect(overlayInput(doc).getAttribute("inputmode")).toBe("numeric");
    // The page's own DOM carries nothing of the gate but the host.
    expect(doc.querySelector("#app")).not.toBeNull();
    stop();
    expect(overlay(doc)).toBeNull();
  });

  it("declares the sans font stack on .backdrop, not only on :host", async () => {
    // Regression (live, 2026-10-22): with the stack only on :host,
    // the Lock Screen rendered in the page's default serif —
    // WhatsApp's global reset wins the cascade for the host element
    // and forces font:inherit on it. The stack must also live on
    // .backdrop, inside the shadow tree where page CSS cannot
    // reach. JSDOM cannot reproduce that page-vs-:host cascade (no
    // competing page stylesheet, no real shadow-cascade
    // precedence), so this asserts on the rendered style text.
    const { store } = await lockedStore();
    await store.setLocked(true);
    const doc = freshDocument();
    const stop = await startLockRuntime({ store, doc });

    const css = overlay(doc)!.shadowRoot!.querySelector("style")!.textContent!;
    expect(css).toMatch(/\.backdrop\s*\{[^}]*font-family:[^;]*sans-serif/);
    expect(css).toContain(
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter,',
    );
    stop();
  });

  it("stays hidden when not locked, appearing via the change event", async () => {
    const { store } = await lockedStore();
    const doc = freshDocument();
    const stop = await startLockRuntime({ store, doc });
    expect(overlay(doc)).toBeNull();
    await store.setLocked(true);
    expect(overlay(doc)).not.toBeNull();
    stop();
  });

  it("stays hidden for the inconsistent locked-without-a-PIN record", async () => {
    const port = new InMemoryStorageAdapter({
      salt: null,
      pinHash: null,
      locked: true,
      autoLockMinutes: 0,
    });
    const store = new LockStore(port);
    const doc = freshDocument();
    const stop = await startLockRuntime({ store, doc });
    expect(overlay(doc)).toBeNull();
    stop();
  });

  it("the correct PIN unlocks through the store and dismisses the gate", async () => {
    const { store } = await lockedStore();
    await store.setLocked(true);
    const doc = freshDocument();
    const stop = await startLockRuntime({ store, doc });

    overlayInput(doc).value = "1234";
    const form = overlay(doc)!.shadowRoot!.querySelector("form")!;
    form.dispatchEvent(
      new doc.defaultView!.Event("submit", { cancelable: true }),
    );
    await flush();

    expect((await store.read()).locked).toBe(false);
    expect(overlay(doc)).toBeNull();
    stop();
  });

  it("a wrong PIN shows an error, clears the input, and stays locked", async () => {
    const { store } = await lockedStore();
    await store.setLocked(true);
    const doc = freshDocument();
    const stop = await startLockRuntime({ store, doc });

    const input = overlayInput(doc);
    input.value = "9999";
    const form = overlay(doc)!.shadowRoot!.querySelector("form")!;
    form.dispatchEvent(
      new doc.defaultView!.Event("submit", { cancelable: true }),
    );
    await flush();

    expect((await store.read()).locked).toBe(true);
    expect(overlay(doc)).not.toBeNull();
    expect(
      overlay(doc)!.shadowRoot!.querySelector(".error")?.textContent,
    ).toContain("Incorrect PIN");
    expect(overlayInput(doc).value).toBe("");
    stop();
  });
});

describe("Lock auto-lock watcher", () => {
  it("locks on a visibility check once the idle limit has passed", async () => {
    const { store } = await lockedStore();
    await store.setAutoLockMinutes(5);
    const doc = freshDocument();
    let nowMs = 1_000_000;
    const stop = await startLockRuntime({ store, doc, now: () => nowMs });

    // Activity now; check before the limit: stays unlocked.
    doc.dispatchEvent(new doc.defaultView!.Event("pointerdown"));
    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    expect((await store.read()).locked).toBe(false);
    expect(overlay(doc)).toBeNull();

    // Past the limit, the next visibility check engages the gate.
    nowMs += 2 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    expect((await store.read()).locked).toBe(true);
    expect(overlay(doc)).not.toBeNull();
    stop();
  });

  it("fresh activity resets the idle clock", async () => {
    const { store } = await lockedStore();
    await store.setAutoLockMinutes(5);
    const doc = freshDocument();
    let nowMs = 1_000_000;
    const stop = await startLockRuntime({ store, doc, now: () => nowMs });

    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("keydown"));
    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    expect((await store.read()).locked).toBe(false);
    stop();
  });

  it("wheel scrolling resets the idle clock", async () => {
    const { store } = await lockedStore();
    await store.setAutoLockMinutes(5);
    const doc = freshDocument();
    let nowMs = 1_000_000;
    const stop = await startLockRuntime({ store, doc, now: () => nowMs });

    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("wheel"));
    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    expect((await store.read()).locked).toBe(false);

    // And it does engage once the wheel has been still past the limit.
    nowMs += 2 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    expect((await store.read()).locked).toBe(true);
    stop();
  });

  it("mouse movement resets the idle clock", async () => {
    const { store } = await lockedStore();
    await store.setAutoLockMinutes(5);
    const doc = freshDocument();
    let nowMs = 1_000_000;
    const stop = await startLockRuntime({ store, doc, now: () => nowMs });

    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("mousemove"));
    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    expect((await store.read()).locked).toBe(false);
    stop();
  });

  it("counts activity even when a page handler stops propagation", async () => {
    const { store } = await lockedStore();
    await store.setAutoLockMinutes(5);
    const doc = freshDocument();
    let nowMs = 1_000_000;
    const stop = await startLockRuntime({ store, doc, now: () => nowMs });

    // A page handler on an ancestor that swallows pointerdown in
    // the bubble phase (as WhatsApp's own handlers may): a
    // bubble-phase tracker on the document would never see it.
    const app = doc.querySelector("#app")!;
    const inner = doc.createElement("div");
    app.appendChild(inner);
    app.addEventListener("pointerdown", (event) => event.stopPropagation());

    nowMs += 4 * 60_000;
    inner.dispatchEvent(
      new doc.defaultView!.Event("pointerdown", { bubbles: true }),
    );
    nowMs += 4 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    // 8 minutes since start but only 4 since the pointerdown:
    // unlocked only if the capture-phase tracker saw the event.
    expect((await store.read()).locked).toBe(false);
    stop();
  });

  it("teardown removes every activity listener with its capture flag", async () => {
    const { store } = await lockedStore();
    await store.setAutoLockMinutes(5);
    const doc = freshDocument();

    const added: Array<{ type: string; capture: boolean }> = [];
    const removed: Array<{ type: string; capture: boolean }> = [];
    const captureOf = (
      options?: boolean | AddEventListenerOptions | EventListenerOptions,
    ): boolean =>
      options === true ||
      (typeof options === "object" &&
        options !== null &&
        options.capture === true);
    const originalAdd = doc.addEventListener.bind(doc);
    const originalRemove = doc.removeEventListener.bind(doc);
    doc.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      added.push({ type, capture: captureOf(options) });
      originalAdd(type, listener, options);
    }) as typeof doc.addEventListener;
    doc.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      removed.push({ type, capture: captureOf(options) });
      originalRemove(type, listener, options);
    }) as typeof doc.removeEventListener;

    let nowMs = 1_000_000;
    const stop = await startLockRuntime({ store, doc, now: () => nowMs });
    stop();

    const activityTypes = [
      "pointerdown",
      "keydown",
      "wheel",
      "mousemove",
      "touchstart",
    ];
    for (const type of activityTypes) {
      expect(added).toContainEqual({ type, capture: true });
      expect(removed).toContainEqual({ type, capture: true });
    }

    // Behaviourally: after teardown, activity and checks do nothing.
    doc.dispatchEvent(new doc.defaultView!.Event("pointerdown"));
    nowMs += 10 * 60_000;
    doc.dispatchEvent(new doc.defaultView!.Event("visibilitychange"));
    await flush();
    expect((await store.read()).locked).toBe(false);
  });
});
