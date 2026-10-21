import {
  ChromeLockStorageAdapter,
  ChromeStorageAdapter,
} from "./adapters/chrome-storage.js";
import { createDomStyleSink } from "./adapters/dom-style-sink.js";
import { startBlurRuntime } from "./runtime/blur-runtime.js";
import { startLockRuntime } from "./runtime/lock-runtime.js";
import { LockStore } from "./runtime/lock-store.js";

/**
 * Composition root for the content script: the only place adapters are
 * chosen. Everything below this line receives its dependencies.
 */
void startBlurRuntime({
  storage: new ChromeStorageAdapter(),
  styleSink: createDomStyleSink(document),
});

void startLockRuntime({
  store: new LockStore(new ChromeLockStorageAdapter()),
  doc: document,
});
