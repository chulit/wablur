import { TARGET_METADATA, type BlurTargetId } from "./engine/catalogue.js";
import type { Mode, Settings } from "./engine/blur-engine.js";
import { ChromeStorageAdapter } from "./adapters/chrome-storage.js";
import { SettingsStore } from "./runtime/settings-store.js";

/**
 * Popup — the extension's only surface, styled after the 2026-10-21
 * mockup (design/popup-mockup-2026-10-21.png). It renders Settings
 * controls from engine metadata (never hard-coded rows) and writes
 * partial patches through the SettingsStore seam; the open WhatsApp
 * tab reacts via storage.onChanged, with no reload and no message
 * passing.
 *
 * One renderer per popup section; mountPopup only orchestrates.
 * Section icons are local inline SVG and the header shows the
 * packaged icon artwork (popup.html) — no external assets.
 */

function svgIcon(body: string): string {
  return (
    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" ` +
    `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  );
}

/** Per-target icons, keyed by Blur Target id (mockup's "What to blur"). */
const TARGET_ICONS: Record<BlurTargetId, string> = {
  messages: svgIcon(
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  ),
  previews: svgIcon(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  ),
  // Names renders the literal "Aa" glyph instead of an SVG (mockup).
  names: "",
  avatars: svgIcon(
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  ),
  media: svgIcon('<polygon points="6 3 20 12 6 21 6 3"/>'),
  chatHeader: svgIcon(
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/>',
  ),
};

const MODES: readonly { id: Mode; label: string; icon: string }[] = [
  {
    id: "standard",
    label: "Standard",
    // Filled circle in the button's colour with a contrasting check.
    icon:
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9" fill="currentColor"/>' +
      '<polyline points="8.4 12.4 11 15 15.8 9.9" fill="none" stroke="#ffffff" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    id: "screen-share",
    label: "Screen Share",
    icon: svgIcon(
      '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    ),
  },
];

function renderMasterSection(
  doc: Document,
  store: SettingsStore,
  settings: Settings,
): void {
  const masterEl = doc.querySelector(".master-section");
  if (!masterEl) return;
  masterEl.textContent = "";

  const text = doc.createElement("div");
  text.className = "master-text";
  const title = doc.createElement("span");
  title.className = "master-title";
  title.textContent = "Enable Blur";
  const desc = doc.createElement("span");
  desc.className = "master-desc";
  desc.textContent = "Hide sensitive content on WhatsApp Web";
  text.append(title, desc);

  const input = doc.createElement("input");
  input.type = "checkbox";
  input.className = "toggle master-toggle";
  input.checked = settings.enabled;
  input.setAttribute("aria-label", "Enable Blur");
  input.addEventListener("change", () => {
    // The identical path Alt+X takes (engine toggle via the store).
    void store.toggleMaster().then((next) => {
      input.checked = next.enabled;
    });
  });

  masterEl.append(text, input);
}

function renderModeSection(
  doc: Document,
  store: SettingsStore,
  settings: Settings,
): void {
  const buttonsEl = doc.querySelector(".mode-buttons");
  if (!buttonsEl) return;
  buttonsEl.textContent = "";
  const buttons = new Map<Mode, HTMLButtonElement>();
  for (const mode of MODES) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "mode-btn";
    btn.dataset.mode = mode.id;

    const icon = doc.createElement("span");
    icon.className = "mode-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = mode.icon;
    const label = doc.createElement("span");
    label.textContent = mode.label;
    btn.append(icon, label);

    const sync = (active: Mode) => {
      btn.classList.toggle("active", active === mode.id);
      btn.setAttribute("aria-pressed", String(active === mode.id));
    };
    sync(settings.mode);
    btn.addEventListener("click", () => {
      void store.patch({ mode: mode.id }).then((next) => {
        for (const b of buttons.values()) {
          const id = b.dataset.mode as Mode;
          b.classList.toggle("active", id === next.mode);
          b.setAttribute("aria-pressed", String(id === next.mode));
        }
      });
    });
    buttons.set(mode.id, btn);
    buttonsEl.append(btn);
  }
}

function renderTargetsSection(
  doc: Document,
  store: SettingsStore,
  settings: Settings,
): void {
  const targetsEl = doc.querySelector(".targets");
  if (!targetsEl) return;
  targetsEl.textContent = "";
  for (const def of TARGET_METADATA) {
    const row = doc.createElement("label");
    row.className = "row target-row";

    const icon = doc.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    if (def.id === "names") {
      icon.className = "target-icon target-icon-text";
      icon.textContent = "Aa";
    } else {
      icon.className = "target-icon";
      icon.innerHTML = TARGET_ICONS[def.id];
    }

    const label = doc.createElement("span");
    label.className = "row-label";
    label.textContent = def.label;

    const input = doc.createElement("input");
    input.type = "checkbox";
    input.className = "toggle";
    input.checked = settings.targets[def.id];
    input.addEventListener("change", () => {
      void store.patch({ targets: { [def.id]: input.checked } });
    });

    row.append(icon, label, input);
    targetsEl.append(row);
  }
}

function renderIntensitySection(
  doc: Document,
  store: SettingsStore,
  settings: Settings,
): void {
  const intensityEl = doc.querySelector(".intensity-section");
  if (!intensityEl) return;
  intensityEl.textContent = "";

  const title = doc.createElement("h2");
  title.className = "section-title";
  title.textContent = "Blur intensity";

  const row = doc.createElement("div");
  row.className = "intensity";

  const slider = doc.createElement("input");
  slider.type = "range";
  slider.className = "slider";
  slider.min = "4";
  slider.max = "24";
  slider.step = "1";
  slider.value = String(settings.blurPx);
  slider.setAttribute("aria-label", "Blur intensity");

  const value = doc.createElement("span");
  value.className = "intensity-value";
  value.textContent = `${settings.blurPx} px`;

  // The track fills teal up to the thumb (mockup); the fill is a
  // hard-stop gradient driven from the slider's own value.
  const paint = () => {
    const pct = ((Number(slider.value) - 4) / (24 - 4)) * 100;
    slider.style.background =
      `linear-gradient(to right, #0bb5c7 ${pct}%, #dce8ec ${pct}%)`;
  };
  paint();
  slider.addEventListener("input", () => {
    value.textContent = `${slider.value} px`;
    paint();
    // Rapid writes are coalesced inside the store (sync quotas).
    void store.patchSoon({ blurPx: Number(slider.value) });
  });

  row.append(slider, value);
  intensityEl.append(title, row);
}

export async function mountPopup(
  doc: Document,
  store: SettingsStore,
): Promise<void> {
  const settings = await store.read();
  renderMasterSection(doc, store, settings);
  renderModeSection(doc, store, settings);
  renderTargetsSection(doc, store, settings);
  renderIntensitySection(doc, store, settings);
}

// Auto-mount in the real popup only (tests call mountPopup directly).
if (
  typeof document !== "undefined" &&
  document.getElementById("wa-blur-popup")
) {
  const store = new SettingsStore(new ChromeStorageAdapter());
  void mountPopup(document, store);
}
