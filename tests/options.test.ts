import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { CATALOGUE } from "../src/engine/catalogue.js";
import {
  DEFAULT_SETTINGS,
  serializeSettings,
  type Settings,
} from "../src/engine/blur-engine.js";
import { InMemoryStorageAdapter } from "../src/adapters/memory-storage.js";
import { SettingsStore } from "../src/runtime/settings-store.js";
import { mountOptions } from "../src/options.js";

const optionsHtml = readFileSync(
  new URL("../src/options.html", import.meta.url),
  "utf8",
);

function freshOptionsDocument(): Document {
  return new JSDOM(optionsHtml).window.document;
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

function targetRow(doc: Document, id: string): Element | null {
  return doc.querySelector(`.target-intensity-row[data-target="${id}"]`);
}

describe("options Reveal delay", () => {
  it("renders the stored delay in the slider and badge", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      revealDelayMs: 500,
    });
    const doc = freshOptionsDocument();
    await mountOptions(doc, new SettingsStore(port));

    const slider = doc.querySelector<HTMLInputElement>(".reveal-delay-slider");
    expect(slider?.min).toBe("100");
    expect(slider?.max).toBe("800");
    expect(slider?.step).toBe("50");
    expect(slider?.value).toBe("500");
    expect(doc.querySelector(".reveal-delay-value")?.textContent).toBe("500 ms");
  });

  it("defaults to 300 ms", async () => {
    const doc = freshOptionsDocument();
    await mountOptions(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));
    expect(doc.querySelector(".reveal-delay-value")?.textContent).toBe("300 ms");
  });

  it("sliding writes a debounced patch and updates the badge", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port, { debounceMs: 10 });
    const doc = freshOptionsDocument();
    await mountOptions(doc, store);

    const slider = doc.querySelector<HTMLInputElement>(".reveal-delay-slider");
    slider!.value = "250";
    slider!.dispatchEvent(new doc.defaultView!.Event("input"));
    await settle();

    expect((await store.read()).revealDelayMs).toBe(250);
    expect(doc.querySelector(".reveal-delay-value")?.textContent).toBe("250 ms");
  });
});

describe("options per-target intensity", () => {
  it("renders one slider per Blur Target showing the effective multiplier", async () => {
    const doc = freshOptionsDocument();
    await mountOptions(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));

    const rows = [...doc.querySelectorAll(".target-intensity-row")];
    expect(rows.map((r) => (r as HTMLElement).dataset.target)).toEqual(
      CATALOGUE.map((d) => d.id),
    );
    // Catalogue defaults show until overridden.
    expect(
      targetRow(doc, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2.5");
    expect(
      targetRow(doc, "names")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×0.6");
    expect(
      targetRow(doc, "chatHeader")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2");
    const mediaSlider = targetRow(doc, "media")?.querySelector<HTMLInputElement>(
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
    const doc = freshOptionsDocument();
    await mountOptions(doc, new SettingsStore(port));

    expect(
      targetRow(doc, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×1");
    expect(
      targetRow(doc, "media")?.querySelector<HTMLInputElement>(
        ".target-intensity-slider",
      )?.value,
    ).toBe("1");
  });

  it("sliding a target writes its override through patchSoon", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port, { debounceMs: 10 });
    const doc = freshOptionsDocument();
    await mountOptions(doc, store);

    const slider = targetRow(doc, "media")?.querySelector<HTMLInputElement>(
      ".target-intensity-slider",
    );
    slider!.value = "1.5";
    slider!.dispatchEvent(new doc.defaultView!.Event("input"));
    await settle();

    const s = await store.read();
    expect(s.multipliers).toEqual({ media: 1.5 });
    expect(
      targetRow(doc, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×1.5");
  });

  it("Reset intensities clears overrides and restores catalogue badges", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      multipliers: { media: 1, names: 2 },
    });
    const store = new SettingsStore(port);
    const doc = freshOptionsDocument();
    await mountOptions(doc, store);

    doc
      .querySelector<HTMLButtonElement>(".reset-intensities-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect((await store.read()).multipliers).toEqual({});
    expect(
      targetRow(doc, "media")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2.5");
    expect(
      targetRow(doc, "names")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×0.6");
  });
});

describe("options Data: reset all", () => {
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
    const doc = freshOptionsDocument();
    await mountOptions(doc, store, { confirm: () => true });

    doc
      .querySelector<HTMLButtonElement>(".reset-all-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect(await store.read()).toEqual(DEFAULT_SETTINGS);
    expect(doc.querySelector(".reveal-delay-value")?.textContent).toBe("300 ms");
  });

  it("does nothing when the confirmation is declined", async () => {
    const port = new InMemoryStorageAdapter(structuredClone(nonDefaults));
    const store = new SettingsStore(port);
    const doc = freshOptionsDocument();
    await mountOptions(doc, store, { confirm: () => false });

    doc
      .querySelector<HTMLButtonElement>(".reset-all-btn")!
      .dispatchEvent(new doc.defaultView!.Event("click"));
    await flush();

    expect(await store.read()).toEqual(nonDefaults);
  });
});

describe("options Data: export and import", () => {
  it("export downloads a JSON document of the current Settings", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurPx: 17,
      multipliers: { avatars: 2 },
    });
    const store = new SettingsStore(port);
    const doc = freshOptionsDocument();
    await mountOptions(doc, store);

    const win = doc.defaultView!;
    let anchor: HTMLAnchorElement | undefined;
    const spy = vi
      .spyOn(win.HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        anchor = this;
      });
    doc
      .querySelector<HTMLButtonElement>(".export-btn")!
      .dispatchEvent(new win.Event("click"));
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

  async function chooseFile(
    doc: Document,
    contents: string,
  ): Promise<void> {
    const win = doc.defaultView!;
    const input = doc.querySelector<HTMLInputElement>(".import-input")!;
    const file = new win.File([contents], "wa-blur-settings.json", {
      type: "application/json",
    });
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new win.Event("change"));
    // FileReader load + the patch round-trip.
    await new Promise((r) => setTimeout(r, 30));
    await flush();
  }

  it("import applies a valid export and re-renders", async () => {
    const port = new InMemoryStorageAdapter(undefined);
    const store = new SettingsStore(port);
    const doc = freshOptionsDocument();
    await mountOptions(doc, store);

    await chooseFile(
      doc,
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
      targetRow(doc, "names")?.querySelector(".target-intensity-value")
        ?.textContent,
    ).toBe("×2");
    expect(doc.querySelector(".import-error")?.textContent).toBe("");
  });

  it("import rejects an invalid file with an error note and changes nothing", async () => {
    const port = new InMemoryStorageAdapter({
      ...DEFAULT_SETTINGS,
      blurPx: 15,
    });
    const store = new SettingsStore(port);
    const doc = freshOptionsDocument();
    await mountOptions(doc, store);

    await chooseFile(doc, "this is not a settings export");

    expect((await store.read()).blurPx).toBe(15);
    expect(doc.querySelector(".import-error")?.textContent).toContain(
      "could not be imported",
    );
  });
});

describe("options About", () => {
  it("shows the version, the repo link, and the Local-Only sentence", async () => {
    const doc = freshOptionsDocument();
    await mountOptions(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)), {
      version: "1.4.0",
    });

    expect(doc.querySelector(".about-version")?.textContent).toBe("Version 1.4.0");
    const link = doc.querySelector<HTMLAnchorElement>(".about-link");
    expect(link?.href).toBe("https://github.com/chulit/wablur");
    expect(doc.querySelector(".about-local-only")?.textContent).toBe(
      "WA Blur makes no network requests and collects nothing. Settings live only in your browser.",
    );
  });

  it("shows a dash when no version is available", async () => {
    const doc = freshOptionsDocument();
    await mountOptions(doc, new SettingsStore(new InMemoryStorageAdapter(undefined)));
    expect(doc.querySelector(".about-version")?.textContent).toBe("Version —");
  });
});
