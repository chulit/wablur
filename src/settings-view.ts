import { CATALOGUE } from "./engine/catalogue.js";
import {
  parseSettings,
  serializeSettings,
  type Settings,
} from "./engine/blur-engine.js";
import {
  AUTO_LOCK_CHOICES,
  DEFAULT_LOCK_RECORD,
  isValidPinFormat,
  type LockRecord,
} from "./engine/lock.js";
import type { LockStore } from "./runtime/lock-store.js";
import type { SettingsStore } from "./runtime/settings-store.js";

/**
 * Settings view — the popup's second view (v1.7.0), holding the
 * less-frequent Settings that do not belong on the popup's quick
 * surface: the Reveal delay, per-target intensity overrides, the
 * Lock Screen card, Settings export/import/reset, and About. It
 * replaced the separate options page: the gear in the popup header
 * switches to this view instead of opening a tab.
 *
 * Same architecture as the popup's main view: this module renders
 * the sections inside its container (the static shell in
 * popup.html) and writes partial patches through the SettingsStore
 * seam; WhatsApp tabs react via storage.onChanged, exactly as for
 * main-view writes. The popup re-mounts it on every open, so the
 * sections always render from current store state.
 *
 * Import is paste-JSON rather than a file picker: an extension
 * popup closes as soon as a file dialog opens, so a chosen file
 * could never survive the trip.
 */

export interface SettingsViewHooks {
  /** Extension version for the About section (the popup bootstrap
   *  reads it from the manifest; absent outside the extension). */
  version?: string;
  /** Confirmation prompt for destructive actions. Defaults to the
   *  document window's confirm; where no prompt exists, the action
   *  is refused rather than assumed. */
  confirm?: (message: string) => boolean;
}

export interface SettingsViewDeps {
  store: SettingsStore;
  /** Lock record seam for the Lock Screen card (the popup
   *  bootstrap wires the real store; without it the card renders
   *  nothing). */
  lockStore?: LockStore;
  hooks?: SettingsViewHooks;
}

/** Badge text for an intensity multiplier: ×1, ×0.6, ×2.5. */
function formatMultiplier(value: number): string {
  return `×${Number(value.toFixed(2))}`;
}

/** Teal track fill up to the thumb, as on the popup's sliders. */
function paintSlider(slider: HTMLInputElement): void {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const pct = ((Number(slider.value) - min) / (max - min)) * 100;
  slider.style.background =
    `linear-gradient(to right, #0bb5c7 ${pct}%, #dce8ec ${pct}%)`;
}

function sectionTitle(doc: Document, text: string): HTMLHeadingElement {
  const title = doc.createElement("h2");
  title.className = "section-title";
  title.textContent = text;
  return title;
}

function sectionDesc(doc: Document, text: string): HTMLParagraphElement {
  const desc = doc.createElement("p");
  desc.className = "section-desc";
  desc.textContent = text;
  return desc;
}

export async function mountSettingsView(
  doc: Document,
  container: Element,
  deps: SettingsViewDeps,
): Promise<void> {
  const store = deps.store;
  const hooks = deps.hooks ?? {};
  const view: { settings: Settings } = { settings: await store.read() };
  const lockStore = deps.lockStore;
  const lock: { record: LockRecord } = {
    record: lockStore
      ? await lockStore.read()
      : { ...DEFAULT_LOCK_RECORD },
  };
  const confirmFn: (message: string) => boolean =
    hooks.confirm ??
    ((message) => {
      const w = doc.defaultView as unknown as {
        confirm?: (m: string) => boolean;
      } | null;
      return typeof w?.confirm === "function" ? w.confirm(message) : false;
    });

  // Every section lookup stays inside this view's container: the
  // popup's main view reuses some class names (intensity, lock).
  const q = (selector: string): Element | null =>
    container.querySelector(selector);

  function renderRevealSection(): void {
    const el = q(".reveal-section");
    if (!el) return;
    el.textContent = "";
    el.append(
      sectionTitle(doc, "Reveal delay"),
      sectionDesc(
        doc,
        "How long the cursor must rest on blurred content before it Reveals. Standard Mode only — Screen Share Mode never Reveals.",
      ),
    );

    const row = doc.createElement("div");
    row.className = "slider-row";
    const label = doc.createElement("span");
    label.className = "row-label";
    label.textContent = "Delay";
    const slider = doc.createElement("input");
    slider.type = "range";
    slider.className = "slider reveal-delay-slider";
    slider.min = "100";
    slider.max = "800";
    slider.step = "50";
    slider.value = String(view.settings.revealDelayMs);
    slider.setAttribute("aria-label", "Reveal delay");
    const badge = doc.createElement("span");
    badge.className = "value-badge reveal-delay-value";
    badge.textContent = `${view.settings.revealDelayMs} ms`;
    paintSlider(slider);
    slider.addEventListener("input", () => {
      badge.textContent = `${slider.value} ms`;
      paintSlider(slider);
      void store
        .patchSoon({ revealDelayMs: Number(slider.value) })
        .then((next) => {
          view.settings = next;
        });
    });
    row.append(label, slider, badge);
    el.append(row);
  }

  function renderIntensitySection(): void {
    const el = q(".intensity-section");
    if (!el) return;
    el.textContent = "";
    el.append(
      sectionTitle(doc, "Intensity per target"),
      sectionDesc(
        doc,
        "Fine-tune how strongly each Blur Target is blurred, relative to the popup's global intensity.",
      ),
    );

    for (const def of CATALOGUE) {
      const effective = view.settings.multipliers[def.id] ?? def.multiplier;
      const row = doc.createElement("div");
      row.className = "slider-row target-intensity-row";
      row.dataset.target = def.id;

      const label = doc.createElement("span");
      label.className = "row-label";
      label.textContent = def.label;

      const slider = doc.createElement("input");
      slider.type = "range";
      slider.className = "slider target-intensity-slider";
      slider.min = "0.5";
      slider.max = "3";
      slider.step = "0.25";
      slider.value = String(effective);
      slider.setAttribute("aria-label", `${def.label} intensity`);

      const badge = doc.createElement("span");
      badge.className = "value-badge target-intensity-value";
      badge.textContent = formatMultiplier(effective);
      paintSlider(slider);
      slider.addEventListener("input", () => {
        const value = Number(slider.value);
        badge.textContent = formatMultiplier(value);
        paintSlider(slider);
        const multipliers = { ...view.settings.multipliers, [def.id]: value };
        void store.patchSoon({ multipliers }).then((next) => {
          view.settings = next;
        });
      });

      row.append(label, slider, badge);
      el.append(row);
    }

    const reset = doc.createElement("button");
    reset.type = "button";
    reset.className = "btn reset-intensities-btn";
    reset.textContent = "Reset intensities";
    reset.addEventListener("click", () => {
      void store.patch({ multipliers: {} }).then((next) => {
        view.settings = next;
        renderIntensitySection();
      });
    });
    // The reset lives in a footer row inside the card, separated
    // from the target rows by the same hairline they use — as a
    // loose button under the rows it read as outside the card.
    // A <footer> (not a <div>) keeps the last target row the
    // :last-of-type div, so its borderless bottom stays intact.
    const footer = doc.createElement("footer");
    footer.className = "intensity-footer";
    footer.append(reset);
    el.append(footer);
  }

  function renderDataSection(): void {
    const el = q(".data-section");
    if (!el) return;
    el.textContent = "";
    el.append(
      sectionTitle(doc, "Data"),
      sectionDesc(
        doc,
        "Export your Settings to a file, or import by pasting an export below. Everything stays on this device.",
      ),
    );

    const actions = doc.createElement("div");
    actions.className = "data-actions";

    const exportBtn = doc.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "btn export-btn";
    exportBtn.textContent = "Export settings";
    exportBtn.addEventListener("click", () => {
      const text = serializeSettings(view.settings);
      let url: string;
      if (typeof URL.createObjectURL === "function") {
        url = URL.createObjectURL(
          new Blob([text], { type: "application/json" }),
        );
      } else {
        // Fallback for environments without Blob URLs (tests).
        url = `data:application/json;charset=utf-8,${encodeURIComponent(text)}`;
      }
      const a = doc.createElement("a");
      a.href = url;
      a.download = "wa-blur-settings.json";
      doc.body.append(a);
      a.click();
      a.remove();
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });

    const resetBtn = doc.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn reset-all-btn";
    resetBtn.textContent = "Reset all settings";
    resetBtn.addEventListener("click", () => {
      if (!confirmFn("Reset all WA Blur settings to their defaults?")) return;
      void store.resetAll().then((next) => {
        view.settings = next;
        renderAll();
      });
    });

    actions.append(exportBtn, resetBtn);
    el.append(actions);

    const importRow = doc.createElement("div");
    importRow.className = "import-row";
    const importLabel = doc.createElement("span");
    importLabel.className = "row-label";
    importLabel.textContent = "Import settings";
    const textarea = doc.createElement("textarea");
    textarea.className = "import-text";
    textarea.setAttribute("aria-label", "Import settings");
    textarea.setAttribute(
      "placeholder",
      "Paste a WA Blur settings export (JSON)",
    );

    const importBtn = doc.createElement("button");
    importBtn.type = "button";
    importBtn.className = "btn import-btn";
    importBtn.textContent = "Import from text";

    const error = doc.createElement("p");
    error.className = "import-error";

    importBtn.addEventListener("click", () => {
      const parsed = parseSettings(textarea.value);
      if (!parsed) {
        error.textContent =
          "That text could not be imported — it is not a valid WA Blur settings export.";
        return;
      }
      error.textContent = "";
      void store
        .patch({
          enabled: parsed.enabled,
          mode: parsed.mode,
          blurPx: parsed.blurPx,
          revealDelayMs: parsed.revealDelayMs,
          multipliers: { ...parsed.multipliers },
          targets: { ...parsed.targets },
        })
        .then((next) => {
          view.settings = next;
          textarea.value = "";
          renderAll();
        });
    });

    importRow.append(importLabel, textarea, importBtn);
    el.append(importRow, error);
  }

  function pinRow(
    labelText: string,
    inputClass: string,
  ): { row: HTMLDivElement; input: HTMLInputElement } {
    const row = doc.createElement("div");
    row.className = "lock-row";
    const label = doc.createElement("span");
    label.className = "row-label";
    label.textContent = labelText;
    const input = doc.createElement("input");
    input.type = "password";
    input.className = `pin-input ${inputClass}`;
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-label", labelText);
    row.append(label, input);
    return { row, input };
  }

  function renderLockSection(): void {
    const el = q(".lock-section");
    if (!el || !lockStore) return;
    el.textContent = "";
    el.append(
      sectionTitle(doc, "Lock Screen"),
      sectionDesc(
        doc,
        "A full-screen gate over WhatsApp Web, opened with a PIN you set. The Lock Screen deters casual access — it is not encryption, and anyone who can remove the extension or inspect the page can get past it. There is no PIN recovery: if you forget it, remove the extension's data from chrome://extensions to reset.",
      ),
    );

    const error = doc.createElement("p");
    error.className = "lock-error";

    const refresh = async (): Promise<void> => {
      lock.record = await lockStore.read();
      renderLockSection();
    };

    // The row plus, while no PIN exists, its hint. The hint rides in
    // the fragment AFTER the row rather than inside it: as a third
    // flex child it was crushed into a ~50px column (2026-10-22).
    const autoLockRow = (): DocumentFragment => {
      const fragment = doc.createDocumentFragment();
      const row = doc.createElement("div");
      row.className = "lock-row auto-lock-row";
      const label = doc.createElement("span");
      label.className = "row-label";
      label.textContent = "Auto-lock";
      const select = doc.createElement("select");
      select.className = "auto-lock-select";
      select.setAttribute("aria-label", "Auto-lock");
      for (const minutes of AUTO_LOCK_CHOICES) {
        const option = doc.createElement("option");
        option.value = String(minutes);
        option.textContent =
          minutes === 0
            ? "Off"
            : `After ${minutes} minute${minutes === 1 ? "" : "s"}`;
        select.append(option);
      }
      select.value = String(lock.record.autoLockMinutes);
      select.addEventListener("change", () => {
        void lockStore
          .setAutoLockMinutes(Number(select.value))
          .then((next) => {
            lock.record = next;
          });
      });
      row.append(label, select);
      fragment.append(row);
      if (lock.record.pinHash === null) {
        const hint = doc.createElement("span");
        hint.className = "auto-lock-hint";
        hint.textContent = "Applies once a PIN is set.";
        fragment.append(hint);
      }
      return fragment;
    };

    if (lock.record.pinHash === null) {
      // No PIN yet: the set-PIN form (PIN + confirmation).
      const pin = pinRow("New PIN", "lock-new");
      const confirmPin = pinRow("Confirm PIN", "lock-confirm");
      const actions = doc.createElement("div");
      actions.className = "lock-actions";
      const setBtn = doc.createElement("button");
      setBtn.type = "button";
      setBtn.className = "btn set-pin-btn";
      setBtn.textContent = "Set PIN";
      setBtn.addEventListener("click", () => {
        if (!isValidPinFormat(pin.input.value)) {
          error.textContent = "PIN must be 4–6 digits.";
          return;
        }
        if (pin.input.value !== confirmPin.input.value) {
          error.textContent = "PINs do not match — try again.";
          return;
        }
        void lockStore.setPin(pin.input.value).then(refresh);
      });
      actions.append(setBtn);
      el.append(pin.row, confirmPin.row, actions, autoLockRow(), error);
      return;
    }

    // PIN set: change (current + new + confirm), remove (current),
    // and the auto-lock choice.
    const status = doc.createElement("p");
    status.className = "lock-status";
    status.textContent =
      "A PIN is set. Lock from the popup, with Alt+Shift+L, or automatically when idle.";
    const current = pinRow("Current PIN", "lock-current");
    const next = pinRow("New PIN", "lock-change-new");
    const confirmNext = pinRow("Confirm new PIN", "lock-change-confirm");

    const actions = doc.createElement("div");
    actions.className = "lock-actions";
    const changeBtn = doc.createElement("button");
    changeBtn.type = "button";
    changeBtn.className = "btn change-pin-btn";
    changeBtn.textContent = "Change PIN";
    changeBtn.addEventListener("click", () => {
      void (async () => {
        if (!(await lockStore.verifyPin(current.input.value))) {
          error.textContent = "Current PIN is incorrect.";
          return;
        }
        if (!isValidPinFormat(next.input.value)) {
          error.textContent = "New PIN must be 4–6 digits.";
          return;
        }
        if (next.input.value !== confirmNext.input.value) {
          error.textContent = "New PINs do not match — try again.";
          return;
        }
        await lockStore.setPin(next.input.value);
        await refresh();
      })();
    });
    const removeBtn = doc.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn remove-pin-btn";
    removeBtn.textContent = "Remove PIN";
    removeBtn.addEventListener("click", () => {
      void (async () => {
        if (!(await lockStore.verifyPin(current.input.value))) {
          error.textContent = "Current PIN is incorrect.";
          return;
        }
        await lockStore.clearPin();
        await refresh();
      })();
    });
    actions.append(changeBtn, removeBtn);
    el.append(
      status,
      current.row,
      next.row,
      confirmNext.row,
      actions,
      autoLockRow(),
      error,
    );
  }

  function renderAboutSection(): void {
    const el = q(".about-section");
    if (!el) return;
    el.textContent = "";
    el.append(sectionTitle(doc, "About"));

    const text = doc.createElement("div");
    text.className = "about-text";
    const name = doc.createElement("span");
    name.className = "about-name";
    name.textContent = "WA Blur";
    const version = doc.createElement("span");
    version.className = "about-version";
    version.textContent = `Version ${hooks.version ?? "—"}`;
    const link = doc.createElement("a");
    link.className = "about-link";
    link.href = "https://github.com/chulit/wablur";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "github.com/chulit/wablur";
    const localOnly = doc.createElement("span");
    localOnly.className = "about-local-only";
    localOnly.textContent =
      "WA Blur makes no network requests and collects nothing. Settings live only in your browser.";
    text.append(name, version, link, localOnly);
    el.append(text);
  }

  function renderAll(): void {
    renderRevealSection();
    renderIntensitySection();
    renderDataSection();
    renderLockSection();
    renderAboutSection();
  }

  renderAll();
}
