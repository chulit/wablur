import { ChromeStorageAdapter } from "./adapters/chrome-storage.js";
import { createDomStyleSink } from "./adapters/dom-style-sink.js";
import { startBlurRuntime } from "./runtime/blur-runtime.js";

/**
 * Composition root for the content script: the only place adapters are
 * chosen. Everything below this line receives its dependencies.
 */
void startBlurRuntime({
  storage: new ChromeStorageAdapter(),
  styleSink: createDomStyleSink(document),
});
