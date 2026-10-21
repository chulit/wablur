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
  targets: defaultTargets(),
};

const MIN_BLUR_PX = 4;
const MAX_BLUR_PX = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampBlurPx(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_BLUR_PX, Math.max(MIN_BLUR_PX, Math.round(value)));
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
    targets,
  };
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
 * Compiles Settings into the CSS that applies them. Pure, total,
 * deterministic: same Settings in, same CssText out. Callers must
 * treat CssText as opaque and apply it whole.
 *
 * Reveal mechanics (ticket 05, research.md §3.2/§5): in Standard
 * Mode, each base rule is paired with a `:hover` rule that clears
 * the filter after a 300ms `transition-delay` — the cursor must rest
 * before anything Reveals — while the base rule's own delay is 0s,
 * so re-blur on cursor leave is immediate. The filter itself is
 * never animated on containers. In Screen Share Mode, zero hover
 * rules are emitted: Reveal is unavailable, which is the safe state
 * for presenting or sharing the screen.
 */
export function compileCss(settings: Settings): CssText {
  if (!settings.enabled) return "";
  const rules: string[] = [];
  for (const def of CATALOGUE) {
    if (!settings.targets[def.id]) continue;
    const px = Math.round(settings.blurPx * def.multiplier);
    for (const selector of def.selectors) {
      rules.push(
        `${selector}{filter:blur(${px}px) !important;transition:filter 0.2s ease;transition-delay:0s;}`,
      );
      if (settings.mode === "standard") {
        rules.push(
          `${selector}:hover{filter:none !important;transition-delay:0.3s;}`,
        );
      }
    }
  }
  return rules.join("\n");
}
