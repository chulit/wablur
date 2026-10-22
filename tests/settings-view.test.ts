import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { CATALOGUE } from "../src/engine/catalogue.js";
import {
  DEFAULT_SETTINGS,
  serializeSettings,
  type Settings,
} from "../src/engine/blur-engine.js";
import type { DigestFn } from "../src/engine/lock.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { LockStore } from "../src/runtime/lock-store.js";
import { SettingsStore } from "../src/runtime/settings-store.js";
import { mountSettingsView } from "../src/settings-view.js";

/** Deterministic stub digest: a stable 64-char hex fingerprint of
 *  its input, so stored records pass the same shape validation the
 *  real SHA-256 output does (resolveLockRecord requires hex-64). */
const stubDigest: DigestFn = (data) => {
  const hex = [...data]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return Promise.resolve(hex.padEnd(64, "0").slice(0, 64));
};

const popupHtml = readFileSync(
  new URL("../src/popup.html", import.meta.url),
  "utf8",
);

/** A popup document plus its (still hidden) settings-view shell. */
function freshSettingsView(): { doc: Document; view: HTMLElement } {
  const doc = new JSDOM(popupHtml).window.document;
  const view = doc.querySelector<HTMLElement>(".settings-view");
  expect(view).not.toBeNull();
  return { doc, view: view! };
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

/** Waits out the store's debounce (tests use debounceMs: 10). */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 40));
  await flush();
}

function targetRow(view: Element, id: string): Element | null {
  return view.querySelector(`.target-intensity-row[data-target="${id}"]`);
}

function click(doc: Document, el: Element): void {
  el.dispatchEvent(new doc.defaultView!.Event("click"));
}

describe("settings view Reveal delay", () => {
  it("renders the stored delay in the slider and badge", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      revealDelayMs: 500,
    });
    const { view } = freshSettingsView();
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(port),
    });

    const slider = view.querySelector<HTMLInputElement>(".reveal-delay-slider");
    expect(slider?.min).toBe("100");
    expect(slider?.max).toBe("800");
    expect(slider?.step).toBe("50");
    expect(slider?.value).toBe("500");
    expect(view.querySelector(".reveal-delay-value")?.textContent).toBe("500 ms");
  });

  it("defaults to 300 ms", async () => {
    const { view } = freshSettingsView();
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
    });
    expect(view.querySelector(".reveal-delay-value")?.textContent).toBe("300 ms");
  });

  it("sliding writes a debounced patch and updates the badge", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port, { debounceMs: 10 });
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, { store });

    const slider = view.querySelector<HTMLInputElement>(".reveal-delay-slider");
    slider!.value = "250";
    slider!.dispatchEvent(new doc.defaultView!.Event("input"));
    await settle();

    expect((await store.read()).revealDelayMs).toBe(250);
    expect(view.querySelector(".reveal-delay-value")?.textContent).toBe("250 ms");
  });
});

describe("settings view per-target intensity", () => {
  it("renders one slider per Blur Target showing the effective multiplier", async () => {
    const { view } = freshSettingsView();
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
    });

    const rows = [...view.querySelectorAll(".target-intensity-row")];
    expect(rows.map((r) => (r as HTMLElement).dataset.target)).toEqual(
      CATALOGUE.map((d) => d.id),
    );
    // Catalogue defaults show until overridden.
    expect(
      targetRow(view, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2.5");
    expect(
      targetRow(view, "names")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×0.6");
    expect(
      targetRow(view, "chatHeader")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2");
    const mediaSlider = targetRow(view, "media")?.querySelector<HTMLInputElement>(
      ".target-intensity-slider",
    );
    expect(mediaSlider?.min).toBe("0.5");
    expect(mediaSlider?.max).toBe("3");
    expect(mediaSlider?.step).toBe("0.25");
    expect(mediaSlider?.value).toBe("2.5");
  });

  it("shows stored overrides instead of catalogue defaults", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      multipliers: { media: 1 },
    });
    const { view } = freshSettingsView();
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(port),
    });

    expect(
      targetRow(view, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×1");
    expect(
      targetRow(view, "media")?.querySelector<HTMLInputElement>(
        ".target-intensity-slider",
      )?.value,
    ).toBe("1");
  });

  it("sliding a target writes its override through patchSoon", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port, { debounceMs: 10 });
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, { store });

    const slider = targetRow(view, "media")?.querySelector<HTMLInputElement>(
      ".target-intensity-slider",
    );
    slider!.value = "1.5";
    slider!.dispatchEvent(new doc.defaultView!.Event("input"));
    await settle();

    const s = await store.read();
    expect(s.multipliers).toEqual({ media: 1.5 });
    expect(
      targetRow(view, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×1.5");
  });

  it("Reset intensities sits in a footer row inside the card, under the last target row", async () => {
    const { view } = freshSettingsView();
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
    });

    const footer = view.querySelector(".intensity-section .intensity-footer");
    expect(footer).not.toBeNull();
    expect(footer!.querySelector(".reset-intensities-btn")).not.toBeNull();
    // The footer directly follows the last per-target row.
    const rows = view.querySelectorAll(".target-intensity-row");
    expect(footer!.previousElementSibling).toBe(rows[rows.length - 1]);
  });

  it("Reset intensities clears overrides and restores catalogue badges", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      multipliers: { media: 1, names: 2 },
    });
    const store = new SettingsStore(port);
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, { store });

    click(doc, view.querySelector(".reset-intensities-btn")!);
    await flush();

    expect((await store.read()).multipliers).toEqual({});
    expect(
      targetRow(view, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2.5");
    expect(
      targetRow(view, "names")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×0.6");
  });
});

describe("settings view Data: reset all", () => {
  const nonDefaults: Settings = {
    ...DEFAULT_SETTINGS,
    enabled: false,
    mode: "screen-share",
    blurPx: 20,
    revealDelayMs: 700,
    multipliers: { media: 3 },
    targets: { ...DEFAULT_SETTINGS.targets, names: false },
  };

  it("restores defaults after a confirmed reset and re-renders", async () => {
    const port = new InMemoryStorageAdapter(structuredClone(nonDefaults));
    const store = new SettingsStore(port);
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, {
      store,
      hooks: { confirm: () => true },
    });

    click(doc, view.querySelector(".reset-all-btn")!);
    await flush();

    expect(await store.read()).toEqual(DEFAULT_SETTINGS);
    expect(view.querySelector(".reveal-delay-value")?.textContent).toBe("300 ms");
  });

  it("does nothing when the confirmation is declined", async () => {
    const port = new InMemoryStorageAdapter(structuredClone(nonDefaults));
    const store = new SettingsStore(port);
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, {
      store,
      hooks: { confirm: () => false },
    });

    click(doc, view.querySelector(".reset-all-btn")!);
    await flush();

    expect(await store.read()).toEqual(nonDefaults);
  });
});

describe("settings view Data: export and import", () => {
  it("export downloads a JSON document of the current Settings", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurPx: 17,
      multipliers: { avatars: 2 },
    });
    const store = new SettingsStore(port);
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, { store });

    const win = view.ownerDocument.defaultView!;
    let anchor: HTMLAnchorElement | undefined;
    const spy = vi
      .spyOn(win.HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        anchor = this;
      });
    click(doc, view.querySelector(".export-btn")!);
    spy.mockRestore();

    expect(anchor).toBeDefined();
    expect(anchor?.download).toBe("wa-blur-settings.json");
    const href = anchor?.getAttribute("href") ?? "";
    if (href.startsWith("data:")) {
      // Fallback path (no Blob URLs in this environment): the whole
      // document rides in the href and must be the current Settings.
      const json = decodeURIComponent(href.slice(href.indexOf(",") + 1));
      expect(JSON.parse(json) as unknown).toEqual(await store.read());
    } else {
      // Blob path (Chrome, and this environment): content is inside
      // the Blob; its correctness is asserted via the helper below.
      expect(href.startsWith("blob:")).toBe(true);
    }
    // The pure helper the button is wired through:
    expect(serializeSettings(await store.read())).toBe(
      JSON.stringify(await store.read(), null, 2),
    );
  });

  async function pasteImport(
    doc: Document,
    view: Element,
    contents: string,
  ): Promise<void> {
    view.querySelector<HTMLTextAreaElement>(".import-text")!.value = contents;
    click(doc, view.querySelector(".import-btn")!);
    await flush();
  }

  it("import applies a valid pasted export and re-renders", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, { store });

    await pasteImport(
      doc,
      view,
      serializeSettings({
        ...DEFAULT_SETTINGS,
        blurPx: 18,
        mode: "screen-share",
        multipliers: { names: 2 },
        targets: { ...DEFAULT_SETTINGS.targets, media: false },
      }),
    );

    const s = await store.read();
    expect(s.blurPx).toBe(18);
    expect(s.mode).toBe("screen-share");
    expect(s.multipliers).toEqual({ names: 2 });
    expect(s.targets.media).toBe(false);
    expect(
      targetRow(view, "names")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2");
    expect(view.querySelector(".import-error")?.textContent).toBe("");
  });

  it("import rejects invalid pasted text with an error note and changes nothing", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurPx: 15,
    });
    const store = new SettingsStore(port);
    const { doc, view } = freshSettingsView();
    await mountSettingsView(doc, view, { store });

    await pasteImport(doc, view, "this is not a settings export");

    expect((await store.read()).blurPx).toBe(15);
    expect(view.querySelector(".import-error")?.textContent).toContain(
      "could not be imported",
    );
  });
});

describe("settings view About", () => {
  it("shows the version, the repo link, and the Local-Only sentence", async () => {
    const { view } = freshSettingsView();
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
      hooks: { version: "1.7.0" },
    });

    expect(view.querySelector(".about-version")?.textContent).toBe("Version 1.7.0");
    const link = view.querySelector<HTMLAnchorElement>(".about-link");
    expect(link?.href).toBe("https://github.com/chulit/wablur");
    expect(view.querySelector(".about-local-only")?.textContent).toBe(
      "WA Blur makes no network requests and collects nothing. Settings live only in your browser.",
    );
  });

  it("shows a dash when no version is available", async () => {
    const { view } = freshSettingsView();
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
    });
    expect(view.querySelector(".about-version")?.textContent).toBe("Version —");
  });
});

function makeLockStore(): LockStore {
  return new LockStore(new InMemoryStorageAdapter(undefined), {
    digest: stubDigest,
    randomSalt: () => "c0ffee1234",
  });
}

function setValue(view: Element, selector: string, value: string): void {
  view.querySelector<HTMLInputElement>(selector)!.value = value;
}

describe("settings view Lock Screen card — no PIN", () => {
  async function mountNoPin() {
    const { doc, view } = freshSettingsView();
    const lockStore = makeLockStore();
    await mountSettingsView(doc, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
      lockStore,
    });
    return { doc, view, lockStore };
  }

  it("shows the set-PIN form with the honest deterrent copy", async () => {
    const { view } = await mountNoPin();
    expect(view.querySelector(".set-pin-btn")).not.toBeNull();
    expect(view.querySelector(".lock-new")).not.toBeNull();
    expect(view.querySelector(".lock-confirm")).not.toBeNull();
    expect(view.querySelector(".lock-section")?.textContent).toContain(
      "it is not encryption",
    );
    expect(view.querySelector(".lock-section")?.textContent).toContain(
      "no PIN recovery",
    );
  });

  it("rejects a malformed PIN and a mismatched confirmation", async () => {
    const { doc, view, lockStore } = await mountNoPin();
    setValue(view, ".lock-new", "12");
    setValue(view, ".lock-confirm", "12");
    click(doc, view.querySelector(".set-pin-btn")!);
    await flush();
    expect(view.querySelector(".lock-error")?.textContent).toContain("4–6 digits");
    expect((await lockStore.read()).pinHash).toBeNull();

    setValue(view, ".lock-new", "1234");
    setValue(view, ".lock-confirm", "1235");
    click(doc, view.querySelector(".set-pin-btn")!);
    await flush();
    expect(view.querySelector(".lock-error")?.textContent).toContain(
      "do not match",
    );
    expect((await lockStore.read()).pinHash).toBeNull();
  });

  it("sets the PIN and re-renders into the PIN-set state", async () => {
    const { doc, view, lockStore } = await mountNoPin();
    setValue(view, ".lock-new", "1234");
    setValue(view, ".lock-confirm", "1234");
    click(doc, view.querySelector(".set-pin-btn")!);
    await flush();
    expect((await lockStore.read()).pinHash).not.toBeNull();
    await expect(lockStore.verifyPin("1234")).resolves.toBe(true);
    expect(view.querySelector(".change-pin-btn")).not.toBeNull();
    expect(view.querySelector(".set-pin-btn")).toBeNull();
  });

  it("the auto-lock hint renders under the row, not inside it", async () => {
    const { view } = await mountNoPin();
    const hint = view.querySelector(".auto-lock-hint");
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toBe("Applies once a PIN is set.");
    // Not a flex child of the .lock-row: as a sibling below the row
    // it gets the section's full width instead of a crushed column.
    expect(hint!.closest(".lock-row")).toBeNull();
    expect(hint!.parentElement).toBe(view.querySelector(".lock-section"));
    expect(view.querySelector(".auto-lock-row")!.nextElementSibling).toBe(hint);
  });

  it("the auto-lock choice persists even before a PIN exists", async () => {
    const { doc, view, lockStore } = await mountNoPin();
    const select = view.querySelector<HTMLSelectElement>(".auto-lock-select");
    expect(select).not.toBeNull();
    expect(select!.value).toBe("0");
    select!.value = "5";
    select!.dispatchEvent(new doc.defaultView!.Event("change"));
    await flush();
    expect((await lockStore.read()).autoLockMinutes).toBe(5);
  });
});

describe("settings view Lock Screen card — PIN set", () => {
  async function mountWithPin() {
    const { doc, view } = freshSettingsView();
    const lockStore = makeLockStore();
    await lockStore.setPin("1234");
    await mountSettingsView(doc, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
      lockStore,
    });
    return { doc, view, lockStore };
  }

  it("change PIN refuses a wrong current PIN", async () => {
    const { doc, view, lockStore } = await mountWithPin();
    setValue(view, ".lock-current", "0000");
    setValue(view, ".lock-change-new", "5678");
    setValue(view, ".lock-change-confirm", "5678");
    click(doc, view.querySelector(".change-pin-btn")!);
    await flush();
    expect(view.querySelector(".lock-error")?.textContent).toContain(
      "Current PIN is incorrect",
    );
    await expect(lockStore.verifyPin("1234")).resolves.toBe(true);
  });

  it("change PIN with the correct current PIN swaps the PIN", async () => {
    const { doc, view, lockStore } = await mountWithPin();
    setValue(view, ".lock-current", "1234");
    setValue(view, ".lock-change-new", "5678");
    setValue(view, ".lock-change-confirm", "5678");
    click(doc, view.querySelector(".change-pin-btn")!);
    await flush();
    await expect(lockStore.verifyPin("5678")).resolves.toBe(true);
    await expect(lockStore.verifyPin("1234")).resolves.toBe(false);
  });

  it("remove PIN requires the current PIN and also unlocks", async () => {
    const { doc, view, lockStore } = await mountWithPin();
    await lockStore.setLocked(true);
    setValue(view, ".lock-current", "0000");
    click(doc, view.querySelector(".remove-pin-btn")!);
    await flush();
    expect(view.querySelector(".lock-error")?.textContent).toContain(
      "Current PIN is incorrect",
    );
    expect((await lockStore.read()).pinHash).not.toBeNull();

    setValue(view, ".lock-current", "1234");
    click(doc, view.querySelector(".remove-pin-btn")!);
    await flush();
    const record = await lockStore.read();
    expect(record.pinHash).toBeNull();
    expect(record.locked).toBe(false);
    // The card falls back to the set-PIN form.
    expect(view.querySelector(".set-pin-btn")).not.toBeNull();
  });

  it("the auto-lock choice renders the stored value", async () => {
    const { view } = freshSettingsView();
    const lockStore = makeLockStore();
    await lockStore.setPin("1234");
    await lockStore.setAutoLockMinutes(15);
    await mountSettingsView(view.ownerDocument, view, {
      store: new SettingsStore(new InMemoryStorageAdapter(undefined)),
      lockStore,
    });
    expect(
      view.querySelector<HTMLSelectElement>(".auto-lock-select")?.value,
    ).toBe("15");
  });
});
