import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { DigestFn } from "../src/engine/lock.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { LockStore } from "../src/runtime/lock-store.js";
import { SettingsStore } from "../src/runtime/settings-store.js";
import { mountPopup } from "../src/popup.js";
import { mountOptions } from "../src/options.js";

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
const optionsHtml = readFileSync(
  new URL("../src/options.html", import.meta.url),
  "utf8",
);

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

function setValue(doc: Document, selector: string, value: string): void {
  doc.querySelector<HTMLInputElement>(selector)!.value = value;
}

describe("popup Lock action", () => {
  it("without a PIN it reads Set up Lock and opens Settings on click", async () => {
    const doc = new JSDOM(popupHtml).window.document;
    const { lockStore } = makeLockStore();
    let opened = 0;
    let closed = 0;
    await mountPopup(
      doc,
      new SettingsStore(new InMemoryStorageAdapter(undefined)),
      () => {
        opened += 1;
      },
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
    expect(opened).toBe(1);
    expect(closed).toBe(0);
    expect((await lockStore.read()).locked).toBe(false);
  });

  it("with a PIN it reads Lock now, locks on click, and closes the popup", async () => {
    const doc = new JSDOM(popupHtml).window.document;
    const { lockStore } = makeLockStore();
    await lockStore.setPin("1234");
    let opened = 0;
    let closed = 0;
    await mountPopup(
      doc,
      new SettingsStore(new InMemoryStorageAdapter(undefined)),
      () => {
        opened += 1;
      },
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
    expect(opened).toBe(0);
  });
});

describe("options Lock Screen card — no PIN", () => {
  async function mountNoPin() {
    const doc = new JSDOM(optionsHtml).window.document;
    const { lockStore } = makeLockStore();
    await mountOptions(
      doc,
      new SettingsStore(new InMemoryStorageAdapter(undefined)),
      { lockStore },
    );
    return { doc, lockStore };
  }

  it("shows the set-PIN form with the honest deterrent copy", async () => {
    const { doc } = await mountNoPin();
    expect(doc.querySelector(".set-pin-btn")).not.toBeNull();
    expect(doc.querySelector(".lock-new")).not.toBeNull();
    expect(doc.querySelector(".lock-confirm")).not.toBeNull();
    expect(doc.querySelector(".lock-section")?.textContent).toContain(
      "it is not encryption",
    );
    expect(doc.querySelector(".lock-section")?.textContent).toContain(
      "no PIN recovery",
    );
  });

  it("rejects a malformed PIN and a mismatched confirmation", async () => {
    const { doc, lockStore } = await mountNoPin();
    setValue(doc, ".lock-new", "12");
    setValue(doc, ".lock-confirm", "12");
    click(doc, doc.querySelector(".set-pin-btn")!);
    await flush();
    expect(doc.querySelector(".lock-error")?.textContent).toContain("4–6 digits");
    expect((await lockStore.read()).pinHash).toBeNull();

    setValue(doc, ".lock-new", "1234");
    setValue(doc, ".lock-confirm", "1235");
    click(doc, doc.querySelector(".set-pin-btn")!);
    await flush();
    expect(doc.querySelector(".lock-error")?.textContent).toContain(
      "do not match",
    );
    expect((await lockStore.read()).pinHash).toBeNull();
  });

  it("sets the PIN and re-renders into the PIN-set state", async () => {
    const { doc, lockStore } = await mountNoPin();
    setValue(doc, ".lock-new", "1234");
    setValue(doc, ".lock-confirm", "1234");
    click(doc, doc.querySelector(".set-pin-btn")!);
    await flush();
    expect((await lockStore.read()).pinHash).not.toBeNull();
    await expect(lockStore.verifyPin("1234")).resolves.toBe(true);
    expect(doc.querySelector(".change-pin-btn")).not.toBeNull();
    expect(doc.querySelector(".set-pin-btn")).toBeNull();
  });

  it("the auto-lock choice persists even before a PIN exists", async () => {
    const { doc, lockStore } = await mountNoPin();
    const select = doc.querySelector<HTMLSelectElement>(".auto-lock-select");
    expect(select).not.toBeNull();
    expect(select!.value).toBe("0");
    select!.value = "5";
    select!.dispatchEvent(new doc.defaultView!.Event("change"));
    await flush();
    expect((await lockStore.read()).autoLockMinutes).toBe(5);
  });
});

describe("options Lock Screen card — PIN set", () => {
  async function mountWithPin() {
    const doc = new JSDOM(optionsHtml).window.document;
    const { lockStore } = makeLockStore();
    await lockStore.setPin("1234");
    await mountOptions(
      doc,
      new SettingsStore(new InMemoryStorageAdapter(undefined)),
      { lockStore },
    );
    return { doc, lockStore };
  }

  it("change PIN refuses a wrong current PIN", async () => {
    const { doc, lockStore } = await mountWithPin();
    setValue(doc, ".lock-current", "0000");
    setValue(doc, ".lock-change-new", "5678");
    setValue(doc, ".lock-change-confirm", "5678");
    click(doc, doc.querySelector(".change-pin-btn")!);
    await flush();
    expect(doc.querySelector(".lock-error")?.textContent).toContain(
      "Current PIN is incorrect",
    );
    await expect(lockStore.verifyPin("1234")).resolves.toBe(true);
  });

  it("change PIN with the correct current PIN swaps the PIN", async () => {
    const { doc, lockStore } = await mountWithPin();
    setValue(doc, ".lock-current", "1234");
    setValue(doc, ".lock-change-new", "5678");
    setValue(doc, ".lock-change-confirm", "5678");
    click(doc, doc.querySelector(".change-pin-btn")!);
    await flush();
    await expect(lockStore.verifyPin("5678")).resolves.toBe(true);
    await expect(lockStore.verifyPin("1234")).resolves.toBe(false);
  });

  it("remove PIN requires the current PIN and also unlocks", async () => {
    const { doc, lockStore } = await mountWithPin();
    await lockStore.setLocked(true);
    setValue(doc, ".lock-current", "0000");
    click(doc, doc.querySelector(".remove-pin-btn")!);
    await flush();
    expect(doc.querySelector(".lock-error")?.textContent).toContain(
      "Current PIN is incorrect",
    );
    expect((await lockStore.read()).pinHash).not.toBeNull();

    setValue(doc, ".lock-current", "1234");
    click(doc, doc.querySelector(".remove-pin-btn")!);
    await flush();
    const record = await lockStore.read();
    expect(record.pinHash).toBeNull();
    expect(record.locked).toBe(false);
    // The card falls back to the set-PIN form.
    expect(doc.querySelector(".set-pin-btn")).not.toBeNull();
  });

  it("the auto-lock choice renders the stored value", async () => {
    const doc = new JSDOM(optionsHtml).window.document;
    const { lockStore } = makeLockStore();
    await lockStore.setPin("1234");
    await lockStore.setAutoLockMinutes(15);
    await mountOptions(
      doc,
      new SettingsStore(new InMemoryStorageAdapter(undefined)),
      { lockStore },
    );
    expect(
      doc.querySelector<HTMLSelectElement>(".auto-lock-select")?.value,
    ).toBe("15");
  });
});
