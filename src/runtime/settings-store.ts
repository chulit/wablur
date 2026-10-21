import {
  DEFAULT_SETTINGS,
  resolveSettings,
  toggle,
  type Mode,
  type Settings,
} from "../engine/blur-engine.js";
import type { BlurTargetId } from "../engine/catalogue.js";
import type { StoragePort } from "./blur-runtime.js";

/**
 * SettingsStore — the one seam through which Settings are read and
 * written. Callers pass partial patches; merging happens here, never
 * by callers spreading objects (spec, Implementation Decisions).
 * Persisted shape: one complete Settings object under one key,
 * owned by the storage adapter behind the port.
 */

export interface SettingsPatch {
  enabled?: boolean;
  mode?: Mode;
  blurPx?: number;
  targets?: Partial<Record<BlurTargetId, boolean>>;
}

/** Merges a patch over complete Settings and re-validates the whole. */
export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  return resolveSettings({
    ...current,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
    ...(patch.blurPx !== undefined ? { blurPx: patch.blurPx } : {}),
    targets: { ...current.targets, ...(patch.targets ?? {}) },
  });
}

/** Combines two pending patches; the later one wins per field. */
function combinePatches(a: SettingsPatch, b: SettingsPatch): SettingsPatch {
  return {
    ...a,
    ...b,
    targets: { ...(a.targets ?? {}), ...(b.targets ?? {}) },
  };
}

interface PendingPatch {
  patch: SettingsPatch;
  waiters: {
    resolve: (s: Settings) => void;
    reject: (e: unknown) => void;
  }[];
}

export class SettingsStore {
  private readonly debounceMs: number;
  private pending: PendingPatch | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly port: StoragePort,
    opts: { debounceMs?: number } = {},
  ) {
    // chrome.storage.sync enforces write quotas (research.md §1.2);
    // rapid patches (a slider drag) are coalesced inside the store.
    this.debounceMs = opts.debounceMs ?? 200;
  }

  /** Current Settings; storage failure degrades to safe defaults. */
  async read(): Promise<Settings> {
    try {
      return resolveSettings(await this.port.get());
    } catch {
      return resolveSettings(undefined);
    }
  }

  /** Applies a partial patch and persists the complete result. */
  async patch(patch: SettingsPatch): Promise<Settings> {
    await this.flushPending();
    return this.applyPatch(patch);
  }

  /**
   * Debounced patch for rapid-fire changes (slider drags): calls
   * within the debounce window are combined into a single write, and
   * every caller's promise resolves with the written Settings.
   */
  patchSoon(patch: SettingsPatch): Promise<Settings> {
    return new Promise<Settings>((resolve, reject) => {
      if (this.pending) {
        this.pending.patch = combinePatches(this.pending.patch, patch);
        this.pending.waiters.push({ resolve, reject });
      } else {
        this.pending = { patch, waiters: [{ resolve, reject }] };
      }
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void this.flushPending();
      }, this.debounceMs);
    });
  }

  private async applyPatch(patch: SettingsPatch): Promise<Settings> {
    const next = mergeSettings(await this.read(), patch);
    try {
      await this.port.set(next);
    } catch {
      // A failed write (quota, sync unavailable) must not throw at
      // callers in the popup or worker: the merged Settings are still
      // returned as the in-memory truth, and Blur keeps applying from
      // the last persisted state rather than crashing the surface.
    }
    return next;
  }

  private async flushPending(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    try {
      const written = await this.applyPatch(pending.patch);
      for (const w of pending.waiters) w.resolve(written);
    } catch (e) {
      for (const w of pending.waiters) w.reject(e);
    }
  }

  /** Resolved Settings on every stored change. */
  subscribe(fn: (settings: Settings) => void): () => void {
    return this.port.subscribe((raw) => fn(resolveSettings(raw)));
  }

  /**
   * The global Toggle path, shared by the worker's `Alt+X` handler
   * and the popup's master switch: read, flip via the engine's
   * `toggle()`, persist the result.
   */
  async toggleMaster(): Promise<Settings> {
    const current = await this.read();
    return this.patch({ enabled: toggle(current).enabled });
  }

  /**
   * Materialises DEFAULT_SETTINGS if — and only if — nothing is
   * stored yet. Called by the worker on install; never overwrites an
   * existing Settings object. Best-effort: storage failure leaves the
   * runtime's resolve-on-read defaults in charge.
   */
  async ensureSeeded(): Promise<void> {
    try {
      const raw = await this.port.get();
      if (raw === undefined) {
        await this.port.set(structuredClone(DEFAULT_SETTINGS));
      }
    } catch {
      // Seeding is a convenience; defaults apply without it.
    }
  }
}
