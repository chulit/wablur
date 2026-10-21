import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { TARGET_METADATA } from "../src/engine/catalogue.js";
import { DEFAULT_SETTINGS } from "../src/engine/blur-engine.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { SettingsStore } from "../src/runtime/settings-store.js";
import { mountPopup } from "../src/popup.js";

const popupHtml = readFileSync(new URL("../src/popup.html", import.meta.url), "utf8");

function freshPopupDocument(): Document {
  return new JSDOM(popupHtml).window.document;
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("popup header and footer (mockup 2026-10-21)", () => {
  it("renders the app icon tile, name, and tagline", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    expect(doc.querySelector(".app-name")?.textContent).toBe("WA Blur");
    expect(doc.querySelector(".tagline")?.textContent).toBe(
      "Visual Privacy for WhatsApp Web",
    );
    // Since v1.3.0 the tile shows the user's icon artwork as an
    // image (previously an inline hairline-eye SVG).
    const appIcon = doc.querySelector(".app-icon img");
    expect(appIcon).not.toBeNull();
    expect(appIcon?.getAttribute("src")).toBe("icons/icon-128.png");
    expect(appIcon?.getAttribute("alt")).toBe("WA Blur");
  });

  it("renders the Local-Only footer card", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    const footer = doc.querySelector(".local-only-card");
    expect(footer).not.toBeNull();
    expect(footer?.querySelector(".local-only-title")?.textContent).toBe("Local-Only");
    expect(footer?.querySelector(".local-only-desc")?.textContent).toBe(
      "Settings are stored only in your browser.",
    );
    expect(footer?.querySelector(".info-icon svg")).not.toBeNull();
  });
});

describe("popup settings gear and view switching", () => {
  it("renders a gear button in the header with an Open settings label", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    const btn = doc.querySelector<HTMLButtonElement>(".popup-header .settings-btn");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-label")).toBe("Open settings");
    expect(btn?.querySelector("svg")).not.toBeNull();
  });

  it("starts on the main view with the Settings view hidden", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    expect(doc.querySelector<HTMLElement>(".main-view")?.hidden).toBe(false);
    expect(doc.querySelector<HTMLElement>(".settings-view")?.hidden).toBe(true);
  });

  it("clicking the gear switches to the Settings view and mounts its sections", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    doc
      .querySelector<HTMLButtonElement>(".settings-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect(doc.querySelector<HTMLElement>(".main-view")?.hidden).toBe(true);
    expect(doc.querySelector<HTMLElement>(".settings-view")?.hidden).toBe(false);
    // The Settings view's sections rendered from current state.
    const view = doc.querySelector(".settings-view")!;
    expect(view.querySelector(".settings-title")?.textContent).toBe("Settings");
    expect(view.querySelector(".reveal-delay-value")?.textContent).toBe("300 ms");
    expect(view.querySelectorAll(".target-intensity-row")).toHaveLength(6);
  });

  it("the back button returns to the main view", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    doc
      .querySelector<HTMLButtonElement>(".settings-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();
    const back = doc.querySelector<HTMLButtonElement>(".settings-view .back-btn");
    expect(back?.getAttribute("aria-label")).toBe("Back");
    back!.dispatchEvent(new doc.defaultView!.Event("click"));

    expect(doc.querySelector<HTMLElement>(".main-view")?.hidden).toBe(false);
    expect(doc.querySelector<HTMLElement>(".settings-view")?.hidden).toBe(true);
  });

  it("re-opening the Settings view re-renders from current store state", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const doc = freshPopupDocument();
    await mountPopup(doc, store);

    const open = () =>
      doc
        .querySelector<HTMLButtonElement>(".settings-btn")!
        .dispatchEvent(new doc.defaultView!.Event("click"));
    open();
    await flush();
    expect(
      doc.querySelector(".settings-view .reveal-delay-value")?.textContent,
    ).toBe("300 ms");

    doc
      .querySelector<HTMLButtonElement>(".settings-view .back-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await store.patch({ revealDelayMs: 650 });
    open();
    await flush();
    expect(
      doc.querySelector(".settings-view .reveal-delay-value")?.textContent,
    ).toBe("650 ms");
  });

  it("the Settings view About shows the injected version", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)), {
      version: "1.7.0",
    });

    doc
      .querySelector<HTMLButtonElement>(".settings-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect(
      doc.querySelector(".settings-view .about-version")?.textContent,
    ).toBe("Version 1.7.0");
  });

  it("the Settings view renders without optional deps (version dash, no Lock card content)", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    doc
      .querySelector<HTMLButtonElement>(".settings-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect(
      doc.querySelector(".settings-view .about-version")?.textContent,
    ).toBe("Version —");
    expect(
      doc.querySelector(".settings-view .lock-section")?.textContent,
    ).toBe("");
  });
});

describe("popup master switch (Enable Blur card)", () => {
  it("shows the card title and description", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    expect(doc.querySelector(".master-title")?.textContent).toBe("Enable Blur");
    expect(doc.querySelector(".master-desc")?.textContent).toBe(
      "Hide sensitive content on WhatsApp Web",
    );
  });

  it("master switch shows stored state and matches the Alt+X (toggleMaster) result exactly", async () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      mode: "screen-share" as const,
      targets: { ...DEFAULT_SETTINGS.targets, media: false },
    };
    // Path A: the worker's Alt+X path.
    const portA = new InMemoryStorageAdapter(structuredClone(raw));
    await new SettingsStore(portA).toggleMaster();

    // Path B: the popup master switch, from the same starting state.
    const portB = new InMemoryStorageAdapter(structuredClone(raw));
    const storeB = new SettingsStore(portB);
    const doc = freshPopupDocument();
    await mountPopup(doc, storeB);
    const master = doc.querySelector<HTMLInputElement>(".master-section input.toggle");
    expect(master?.checked).toBe(true);
    master!.checked = false;
    master!.dispatchEvent(new doc.defaultView!.Event("change"));
    await flush();

    expect(await portB.get()).toEqual(await portA.get());
    expect((await storeB.read()).enabled).toBe(false);
    expect((await storeB.read()).mode).toBe("screen-share");
    expect((await storeB.read()).targets.media).toBe(false);
  });
});

describe("popup Mode buttons", () => {
  it("renders Standard and Screen Share, with the stored Mode active", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      mode: "screen-share" as const,
    });
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(port));

    const buttons = [...doc.querySelectorAll<HTMLButtonElement>(".mode-btn")];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      "Standard",
      "Screen Share",
    ]);
    const standard = buttons.find((b) => b.dataset.mode === "standard");
    const screenShare = buttons.find((b) => b.dataset.mode === "screen-share");
    expect(screenShare?.classList.contains("active")).toBe(true);
    expect(screenShare?.getAttribute("aria-pressed")).toBe("true");
    expect(standard?.classList.contains("active")).toBe(false);
    expect(standard?.getAttribute("aria-pressed")).toBe("false");
    // Each button carries its icon (check-circle / monitor).
    for (const b of buttons) expect(b.querySelector(".mode-icon svg")).not.toBeNull();
  });

  it("Standard is active by default", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    const standard = doc.querySelector<HTMLButtonElement>(
      '.mode-btn[data-mode="standard"]',
    );
    expect(standard?.classList.contains("active")).toBe(true);
    expect(standard?.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking Screen Share matches the Alt+Shift+S (toggleMode) result exactly", async () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      blurPx: 13,
      revealDelayMs: 500,
      multipliers: { media: 1.5 },
      targets: { ...DEFAULT_SETTINGS.targets, avatars: false },
    };
    // Path A: the worker's Alt+Shift+S path.
    const portA = new InMemoryStorageAdapter(structuredClone(raw));
    await new SettingsStore(portA).toggleMode();

    // Path B: the popup Mode button, from the same starting state.
    const portB = new InMemoryStorageAdapter(structuredClone(raw));
    const storeB = new SettingsStore(portB);
    const doc = freshPopupDocument();
    await mountPopup(doc, storeB);
    const screenShare = doc.querySelector<HTMLButtonElement>(
      '.mode-btn[data-mode="screen-share"]',
    );
    screenShare!.dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect(await portB.get()).toEqual(await portA.get());
    expect((await storeB.read()).mode).toBe("screen-share");
  });

  it("clicking a Mode button patches the store and moves the active state", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const doc = freshPopupDocument();
    await mountPopup(doc, store);

    const screenShare = doc.querySelector<HTMLButtonElement>(
      '.mode-btn[data-mode="screen-share"]',
    );
    screenShare!.dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect((await store.read()).mode).toBe("screen-share");
    expect(screenShare?.classList.contains("active")).toBe(true);
    expect(screenShare?.getAttribute("aria-pressed")).toBe("true");
    const standard = doc.querySelector<HTMLButtonElement>(
      '.mode-btn[data-mode="standard"]',
    );
    expect(standard?.classList.contains("active")).toBe(false);
    expect(standard?.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("popup target toggles", () => {
  it("renders one toggle per Blur Target from engine metadata, showing stored state", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      targets: { ...DEFAULT_SETTINGS.targets, names: false },
    });
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(port));

    const boxes = doc.querySelectorAll<HTMLInputElement>(".targets input.toggle");
    expect(boxes).toHaveLength(TARGET_METADATA.length);
    const labels = [...doc.querySelectorAll(".targets .row-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(TARGET_METADATA.map((d) => d.label));
    const byLabel = new Map(
      [...boxes].map((box) => [
        box.closest("label")?.querySelector(".row-label")?.textContent,
        box.checked,
      ]),
    );
    expect(byLabel.get("Names")).toBe(false);
    expect(byLabel.get("Messages")).toBe(true);
  });

  it("renders an icon per target row: inline SVG, with the Aa glyph for Names", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    const rows = [...doc.querySelectorAll(".targets .target-row")];
    expect(rows).toHaveLength(TARGET_METADATA.length);
    for (const row of rows) {
      const label = row.querySelector(".row-label")?.textContent;
      const icon = row.querySelector(".target-icon");
      expect(icon, `row should carry an icon: ${label}`).not.toBeNull();
      if (label === "Names") {
        expect(icon?.textContent).toBe("Aa");
      } else {
        expect(icon?.querySelector("svg"), `row icon should be SVG: ${label}`).not.toBeNull();
      }
    }
  });

  it("flipping a toggle writes the patch through the store", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const doc = freshPopupDocument();
    await mountPopup(doc, store);

    const boxes = [...doc.querySelectorAll<HTMLInputElement>(".targets input.toggle")];
    const mediaIndex = TARGET_METADATA.findIndex((d) => d.id === "media");
    const media = boxes[mediaIndex];
    expect(media).toBeDefined();
    if (!media) return;
    media.checked = false;
    media.dispatchEvent(new doc.defaultView!.Event("change"));
    await flush();

    expect((await store.read()).targets.media).toBe(false);
    expect((await store.read()).targets.messages).toBe(true);
  });

  it("a reopened popup displays the current stored state", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    await store.patch({ targets: { avatars: false } });

    const doc = freshPopupDocument();
    await mountPopup(doc, store);
    const boxes = [...doc.querySelectorAll<HTMLInputElement>(".targets input.toggle")];
    const avatarsIndex = TARGET_METADATA.findIndex((d) => d.id === "avatars");
    expect(boxes[avatarsIndex]?.checked).toBe(false);
  });
});

describe("popup intensity slider", () => {
  it("shows the stored value in the badge and writes a debounced patch", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurPx: 14,
    });
    const store = new SettingsStore(port, { debounceMs: 10 });
    const doc = freshPopupDocument();
    await mountPopup(doc, store);

    const slider = doc.querySelector<HTMLInputElement>(".intensity input.slider");
    expect(slider).not.toBeNull();
    expect(slider?.min).toBe("4");
    expect(slider?.max).toBe("24");
    expect(slider?.value).toBe("14");
    expect(doc.querySelector(".intensity-value")?.textContent).toBe("14 px");

    // Simulated drag: several input events, one coalesced write.
    for (const v of ["15", "16", "17"]) {
      slider!.value = v;
      slider!.dispatchEvent(new doc.defaultView!.Event("input"));
    }
    await new Promise((r) => setTimeout(r, 40));
    expect((await store.read()).blurPx).toBe(17);
    expect(doc.querySelector(".intensity-value")?.textContent).toBe("17 px");
  });
});

describe("popup Blur type chips (v1.6.0)", () => {
  it("renders five chips from the style metadata, with Blur active by default", async () => {
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    const chips = [...doc.querySelectorAll<HTMLButtonElement>(".blur-style-chip")];
    expect(chips.map((c) => c.textContent)).toEqual([
      "Blur",
      "Mosaic",
      "Redact",
      "Frost",
      "Fade",
    ]);
    const active = chips.filter((c) => c.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset.blurStyle).toBe("blur");
    expect(active[0]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("marks the stored style active", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurStyle: "frost",
    });
    const doc = freshPopupDocument();
    await mountPopup(doc, new SettingsStore(port));

    const chip = doc.querySelector<HTMLButtonElement>(
      '.blur-style-chip[data-blur-style="frost"]',
    );
    expect(chip?.classList.contains("active")).toBe(true);
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a chip patches the store and re-syncs the active chip", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const doc = freshPopupDocument();
    await mountPopup(doc, store);

    doc
      .querySelector<HTMLButtonElement>('.blur-style-chip[data-blur-style="redact"]')
      ?.click();
    await flush();

    expect((await store.read()).blurStyle).toBe("redact");
    const active = [...doc.querySelectorAll(".blur-style-chip.active")];
    expect(active).toHaveLength(1);
    expect(active[0]?.getAttribute("aria-pressed") ?? null).not.toBeNull();
    expect(
      doc
        .querySelector('.blur-style-chip[data-blur-style="redact"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(
      doc
        .querySelector('.blur-style-chip[data-blur-style="blur"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
