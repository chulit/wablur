import { ChromeStorageAdapter } from "./adapters/chrome-storage.js";
import { SettingsStore } from "./runtime/settings-store.js";

/**
 * Service worker — thin by necessity (spec): it exists only because
 * `chrome.commands` handlers live here. Three jobs and no more:
 * `Alt+X` flips the master Toggle in Settings, `Alt+Shift+S` flips
 * the Mode, and install seeds defaults if absent. All semantics
 * live in BlurEngine/SettingsStore; WhatsApp tabs react via
 * `storage.onChanged`. No catalogue, no CSS, no message passing.
 */
const store = new SettingsStore(new ChromeStorageAdapter());

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-blur") {
    void store.toggleMaster();
  }
  if (command === "toggle-mode") {
    void store.toggleMode();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void store.ensureSeeded();
});
