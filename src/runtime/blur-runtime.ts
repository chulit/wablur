import {
  compileCss,
  resolveSettings,
  type CssText,
} from "../engine/blur-engine.js";

/**
 * BlurRuntime — wiring only, no decisions (codebase-design hybrid).
 * Dependencies are accepted, never created: a storage port and a
 * style sink are injected by the composition root (content entry).
 */

export interface StoragePort {
  /** Raw persisted value, unknown shape — resolveSettings owns it. */
  get(): Promise<unknown>;
  /** Persists a complete raw value (the SettingsStore owns merging). */
  set(raw: unknown): Promise<void>;
  subscribe(fn: (raw: unknown) => void): () => void;
}

export type StyleSink = (css: CssText) => void;

export async function startBlurRuntime(deps: {
  storage: StoragePort;
  styleSink: StyleSink;
}): Promise<() => void> {
  const apply = (raw: unknown) => {
    deps.styleSink(compileCss(resolveSettings(raw)));
  };

  let initial: unknown;
  try {
    initial = await deps.storage.get();
  } catch {
    initial = undefined; // resolveSettings(undefined) = safe defaults
  }
  apply(initial);

  const unsubscribe = deps.storage.subscribe(apply);
  return () => {
    unsubscribe();
  };
}
