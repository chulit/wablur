import {
  compileCss,
  mosaicCellSize,
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

/**
 * Applies compiled CSS. The second argument is the Mosaic cell size
 * when the Mosaic style needs its SVG pixelate filter planted in the
 * page, or null when the filter must be absent (any other style, or
 * the master Toggle off) — the compiled CSS alone cannot carry it,
 * because filter defs are DOM, not CSS.
 */
export type StyleSink = (css: CssText, mosaicCell?: number | null) => void;

export async function startBlurRuntime(deps: {
  storage: StoragePort;
  styleSink: StyleSink;
}): Promise<() => void> {
  const apply = (raw: unknown) => {
    const settings = resolveSettings(raw);
    const mosaicCell =
      settings.enabled && settings.blurStyle === "mosaic"
        ? mosaicCellSize(settings.blurPx)
        : null;
    deps.styleSink(compileCss(settings), mosaicCell);
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
