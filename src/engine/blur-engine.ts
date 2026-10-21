import {
  ALL_TARGET_IDS,
  CATALOGUE,
  type BlurTargetId,
} from "./catalogue.js";

/**
 * BlurEngine — the project's one deep module (see spec, Implementation
 * Decisions). Pure and in-process: no DOM, no Chrome globals. Its
 * interface is the test surface.
 */

/** The two Modes (restored 2026-10-21, following the popup mockup). */
export type Mode = "standard" | "screen-share";

export interface Settings {
  /** Master Toggle state. */
  enabled: boolean;
  /**
   * Active Mode. In Standard Mode a resting cursor Reveals a blurred
   * target on hover; in Screen Share Mode Reveal is unavailable.
   */
  mode: Mode;
  /** Global blur intensity in px, clamped to 4..24. */
  blurPx: number;
  /**
   * How long the cursor must rest on a blurred target before it
   * Reveals, in milliseconds, clamped to 100..800. Standard Mode only
   * (Screen Share Mode never Reveals).
   */
  revealDelayMs: number;
  /**
   * Per-target intensity overrides, keyed by Blur Target id. A target
   * with no entry uses its catalogue multiplier. Values are clamped
   * to 0.5..3 at resolve time.
   */
  multipliers: Partial<Record<BlurTargetId, number>>;
  targets: Record<BlurTargetId, boolean>;
}

export type CssText = string;

/**
 * Per-target defaults come from the catalogue (each entry carries its
 * own `defaultEnabled`). A target id without a catalogue entry falls
 * back to `true` — the fail-safe direction is blurred.
 */
function defaultTargets(): Record<BlurTargetId, boolean> {
  const targets = {} as Record<BlurTargetId, boolean>;
  for (const id of ALL_TARGET_IDS) {
    targets[id] = CATALOGUE.find((d) => d.id === id)?.defaultEnabled ?? true;
  }
  return targets;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: "standard",
  blurPx: 8,
  revealDelayMs: 300,
  multipliers: {},
  targets: defaultTargets(),
};

const MIN_BLUR_PX = 4;
const MAX_BLUR_PX = 24;
const MIN_REVEAL_DELAY_MS = 100;
const MAX_REVEAL_DELAY_MS = 800;
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampBlurPx(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_BLUR_PX, Math.max(MIN_BLUR_PX, Math.round(value)));
}

function clampRevealDelayMs(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(
    MAX_REVEAL_DELAY_MS,
    Math.max(MIN_REVEAL_DELAY_MS, Math.round(value)),
  );
}

/**
 * Keeps only known Blur Target ids whose override is a finite
 * number, clamped to 0.5..3. Anything else is dropped (no override =
 * the catalogue multiplier), never guessed at.
 */
function resolveMultipliers(
  raw: Record<string, unknown>,
): Partial<Record<BlurTargetId, number>> {
  const multipliers: Partial<Record<BlurTargetId, number>> = {};
  if (!isRecord(raw.multipliers)) return multipliers;
  for (const id of ALL_TARGET_IDS) {
    const v = raw.multipliers[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      multipliers[id] = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, v));
    }
  }
  return multipliers;
}

/**
 * Resolves the Mode. A valid stored `mode` (v1.0.x, and again v1.2+)
 * always wins. Otherwise the v1.1.x `hoverReveal` flag is migrated:
 * false meant Reveal was unavailable ("screen-share") and true meant
 * it was available ("standard"). The `hoverReveal` key itself is
 * never carried into the resolved Settings.
 */
function resolveMode(raw: Record<string, unknown>): Mode {
  if (raw.mode === "standard" || raw.mode === "screen-share") return raw.mode;
  if (raw.hoverReveal === false) return "screen-share";
  if (raw.hoverReveal === true) return "standard";
  return DEFAULT_SETTINGS.mode;
}

/**
 * The only entry point for persisted data. Always returns a complete,
 * valid Settings: missing/invalid fields fall back per-field to
 * DEFAULT_SETTINGS; unknown keys are dropped. Fail-safe direction is
 * toward blurred (defaults are on).
 */
export function resolveSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return structuredClone(DEFAULT_SETTINGS);

  const targets = { ...DEFAULT_SETTINGS.targets };
  if (isRecord(raw.targets)) {
    for (const id of ALL_TARGET_IDS) {
      const v = raw.targets[id];
      if (typeof v === "boolean") targets[id] = v;
    }
  }

  return {
    enabled:
      typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SETTINGS.enabled,
    mode: resolveMode(raw),
    blurPx: clampBlurPx(raw.blurPx, DEFAULT_SETTINGS.blurPx),
    revealDelayMs: clampRevealDelayMs(
      raw.revealDelayMs,
      DEFAULT_SETTINGS.revealDelayMs,
    ),
    multipliers: resolveMultipliers(raw),
    targets,
  };
}

/**
 * Settings as a portable JSON document (the export half of the
 * settings page's Export/Import). The input is already a resolved
 * Settings; serialisation is a plain pretty-printed stringify.
 */
export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2);
}

/**
 * The import half: parses an exported document back into Settings.
 * Returns null when the text is not JSON or not a JSON object at all
 * — anything object-shaped is resolved field-by-field by
 * resolveSettings, so a partial or older export still imports into
 * a complete, valid Settings.
 */
export function parseSettings(text: string): Settings | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  return resolveSettings(raw);
}

/**
 * The single definition of what the global Toggle flips: the master
 * flag, and only the master flag — per-target choices, the Mode, and
 * intensity are preserved exactly. Shared by `Alt+X` and the popup's
 * master switch so the two paths can never drift. Pure; the input is
 * not mutated.
 */
export function toggle(settings: Settings): Settings {
  return { ...settings, enabled: !settings.enabled };
}

/**
 * Formats a millisecond delay as compact CSS seconds: 300 -> "0.3s",
 * 250 -> "0.25s", 800 -> "0.8s". Milliseconds are already clamped
 * to whole numbers at resolve time, so three decimals always
 * suffice.
 */
function formatDelaySeconds(ms: number): string {
  const trimmed = (ms / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${trimmed}s`;
}

/**
 * Compiles Settings into the CSS that applies them. Pure, total,
 * deterministic: same Settings in, same CssText out. Callers must
 * treat CssText as opaque and apply it whole.
 *
 * Reveal mechanics (ticket 05, research.md §3.2/§5): in Standard
 * Mode, each base rule is paired with a `:hover` rule that clears
 * the filter after the Settings' Reveal delay (`transition-delay`,
 * 300ms by default) — the cursor must rest before anything Reveals
 * — while the base rule's own delay is 0s, so re-blur on cursor
 * leave is immediate. The filter itself is never animated on
 * containers. In Screen Share Mode, zero hover rules are emitted:
 * Reveal is unavailable, which is the safe state for presenting or
 * sharing the screen.
 *
 * A target's effective intensity is the Settings multiplier
 * override when one is set, otherwise its catalogue multiplier.
 */
export function compileCss(settings: Settings): CssText {
  if (!settings.enabled) return "";
  const rules: string[] = [];
  const revealDelay = formatDelaySeconds(settings.revealDelayMs);
  for (const def of CATALOGUE) {
    if (!settings.targets[def.id]) continue;
    const multiplier = settings.multipliers[def.id] ?? def.multiplier;
    const px = Math.round(settings.blurPx * multiplier);
    for (const selector of def.selectors) {
      rules.push(
        `${selector}{filter:blur(${px}px) !important;transition:filter 0.2s ease;transition-delay:0s;}`,
      );
      if (settings.mode === "standard") {
        rules.push(
          `${selector}:hover{filter:none !important;transition-delay:${revealDelay};}`,
        );
      }
    }
  }
  return rules.join("\n");
}
