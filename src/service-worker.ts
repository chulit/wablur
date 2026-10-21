import {
  ChromeLockStorageAdapter,
  ChromeStorageAdapter,
} from "./adapters/chrome-storage.js";
import { LockStore } from "./runtime/lock-store.js";
import { SettingsStore } from "./runtime/settings-store.js";

/**
 * Service worker — thin by necessity (spec): it exists only because
 * `chrome.commands` handlers live here. Its jobs and no more:
 * `Alt+X` flips the master Toggle in Settings, `Alt+Shift+S` flips
 * the Mode, `Alt+Shift+L` engages the Lock gate (LockStore refuses
 * when no PIN exists), and install seeds defaults for both stores
 * if absent. All semantics live in BlurEngine/LockStore; WhatsApp
 * tabs react via `storage.onChanged`. No catalogue, no CSS, no
 * message passing.
 */
const store = new SettingsStore(new ChromeStorageAdapter());
const lockStore = new LockStore(new ChromeLockStorageAdapter());

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-blur") {
    void store.toggleMaster();
  }
  if (command === "toggle-mode") {
    void store.toggleMode();
  }
  if (command === "lock-now") {
    void lockStore.lockNow();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void store.ensureSeeded();
  void lockStore.ensureSeeded();
});
