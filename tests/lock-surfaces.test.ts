import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { DigestFn } from "../src/engine/lock.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { LockStore } from "../src/runtime/lock-store.js";
import { SettingsStore } from "../src/runtime/settings-store.js";
import { mountPopup } from "../src/popup.js";

/** Deterministic stub digest: a stable 64-char hex fingerprint of
 *  its input, so stored records pass the same shape validation the
 *  real SHA-256 output does (resolveLockRecord requires hex-64). */
const stubDigest: DigestFn = (data) => {
  const hex = [...data]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return Promise.resolve(hex.padEnd(64, "0").slice(0, 64));
};

const popupHtml = readFileSync(new URL("../src/popup.html", import.meta.url), "utf8");

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function makeLockStore(): {
  port: InMemoryStorageAdapter;
  lockStore: LockStore;
} {
  const port = new InMemoryStorageAdapter(undefined);
  const lockStore = new LockStore(port, {
    digest: stubDigest,
    randomSalt: () => "c0ffee1234",
  });
  return { port, lockStore };
}

function click(doc: Document, el: Element): void {
  el.dispatchEvent(new doc.defaultView!.Event("click"));
}

describe("popup Lock action", () => {
  it("without a PIN it reads Set up Lock and switches to the Settings view on click", async () => {
    const doc = new JSDOM(popupHtml).window.document;
    const { lockStore } = makeLockStore();
    let closed = 0;
    await mountPopup(
      doc,
      new SettingsStore(new InMemoryStorageAdapter(undefined)),
      {
        lockStore,
        closePopup: () => {
          closed += 1;
        },
      },
    );
    await flush();

    const btn = doc.querySelector<HTMLButtonElement>(".lock-btn");
    expect(btn).not.toBeNull();
    expect(doc.querySelector(".lock-label")?.textContent).toBe("Set up Lock");
    click(doc, btn!);
    await flush();
    // The Settings view (where the PIN is created) is now showing.
    expect(doc.querySelector<HTMLElement>(".settings-view")?.hidden).toBe(false);
    expect(doc.querySelector<HTMLElement>(".main-view")?.hidden).toBe(true);
    expect(closed).toBe(0);
    expect((await lockStore.read()).locked).toBe(false);
  });

  it("with a PIN it reads Lock now, locks on click, and closes the popup", async () => {
    const doc = new JSDOM(popupHtml).window.document;
    const { lockStore } = makeLockStore();
    await lockStore.setPin("1234");
    let closed = 0;
    await mountPopup(
      doc,
      new SettingsStore(new InMemoryStorageAdapter(undefined)),
      {
        lockStore,
        closePopup: () => {
          closed += 1;
        },
      },
    );
    await flush();

    expect(doc.querySelector(".lock-label")?.textContent).toBe("Lock now");
    click(doc, doc.querySelector(".lock-btn")!);
    await flush();
    expect((await lockStore.read()).locked).toBe(true);
    expect(closed).toBe(1);
  });
});
