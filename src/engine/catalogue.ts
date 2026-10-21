/**
 * The selector catalogue: every piece of WhatsApp Web knowledge in the
 * codebase, as data. One entry per Blur Target (GLOSSARY.md).
 *
 * Selector strategy (research.md §3–§4): semantic anchors first
 * (`aria-label`, `role`, structural ids), obfuscated classes only as a
 * labelled disposable fallback layer, and the previous WhatsApp
 * generation's selectors kept as fallback — the LukasLen pattern of
 * carrying two generations side by side. Localised `aria-label`
 * variants (EN + ID) are first-class entries, per the locale guarantee.
 *
 * Multipliers follow the predecessor defaults at a global 8px
 * (research.md §3.2): messages 8px (×1), names 5px (×0.6), avatars
 * ~4px (×0.5), media 20px (×2.5).
 */
export type BlurTargetId =
  | "messages"
  | "previews"
  | "names"
  | "avatars"
  | "media"
  | "chatHeader";

export const ALL_TARGET_IDS: readonly BlurTargetId[] = [
  "messages",
  "previews",
  "names",
  "avatars",
  "media",
  "chatHeader",
];

export interface BlurTargetDef {
  readonly id: BlurTargetId;
  readonly label: string;
  /** CSS selectors for this target, most durable first. */
  readonly selectors: readonly string[];
  /** Whether this target is blurred in DEFAULT_SETTINGS. */
  readonly defaultEnabled: boolean;
  /** Internal intensity multiplier over the user's global blurPx. */
  readonly multiplier: number;
  /**
   * What the target's content is made of. Blur Styles that cannot
   * use a filter (Redact) treat the two kinds differently: text is
   * covered by an opaque bar, images are blacked out.
   */
  readonly kind: "text" | "image";
}

export const CATALOGUE: readonly BlurTargetDef[] = [
  {
    id: "messages",
    label: "Messages",
    selectors: [
      // Message bubbles in the open conversation (structural anchor,
      // the surviving piyushraj semantic set; confirmed live
      // 2026-10-21 — the class exists only while a chat is open).
      ".focusable-list-item",
      // Pinned-message bar (probed live 2026-10-21): a span that is
      // the direct next sibling of the conversation header inside
      // #main. It carries message content (sender + text) outside any
      // bubble, so it belongs to Messages. With no pinned message,
      // the header's next sibling is the conversation div — no match.
      "#main > header + span",
      // Fallback layer: current-generation obfuscated message structure.
      "div._amk4 > ._amk6",
      // Fallback layer: previous generation's message structure.
      "._2AOIt div:first-child",
    ],
    defaultEnabled: true,
    multiplier: 1,
    kind: "text",
  },
  {
    id: "previews",
    label: "Previews",
    selectors: [
      // Current generation (stylex era, probed live 2026-10-20): a
      // chat-list row carries exactly two [title] spans — the Name
      // (dir="auto") and the Preview line (no dir). Anchored on the
      // localised Chat list label + row role; EN and ID side by side.
      '[aria-label="Chat list"] [role="row"] span[title]:not([dir="auto"])',
      '[aria-label="Daftar chat"] [role="row"] span[title]:not([dir="auto"])',
      // No semantic anchor existed for the Preview line in the
      // predecessor generations (research.md §3.1–§3.2) — the preview
      // text was class-addressed. v2.3000 layer:
      'div[role="listitem"] div._ak8k',
      // Previous generation.
      'div[role="listitem"] .vQ0w7',
    ],
    defaultEnabled: true,
    multiplier: 1,
    kind: "text",
  },
  {
    id: "names",
    label: "Names",
    selectors: [
      // Current generation (stylex era, probed live 2026-10-20): the
      // row's name span carries the name as its `title`, equals its
      // text, and is marked dir="auto". Anchored on the localised
      // Chat list label + row role — EN and ID side by side.
      '[aria-label="Chat list"] [role="row"] span[title][dir="auto"]',
      '[aria-label="Daftar chat"] [role="row"] span[title][dir="auto"]',
      // v2.3000 layer: rows were role="listitem".
      '[aria-label="Chat list"] [role="listitem"] span[title]',
      '[aria-label="Daftar chat"] [role="listitem"] span[title]',
      // Same structural shape without the label anchor (locale-free).
      'div[role="listitem"] span[title]',
      // The open conversation's header name.
      "#main header span[title]",
      // Names/numbers inside dialogs (contact & group info).
      'div[role="dialog"] div.copyable-text',
      // Fallback layer: current-generation name class.
      'div[role="listitem"] ._ak8q',
      // Fallback layer: previous anchor form (rows were role="row"
      // before WhatsApp's Aug 2024 change — research.md §4).
      'div[role="row"] ._ak8q',
    ],
    defaultEnabled: true,
    multiplier: 0.6,
    kind: "text",
  },
  {
    id: "avatars",
    label: "Avatars",
    selectors: [
      // Own profile photo area (semantic anchor, localised EN + ID).
      '[aria-label="profile photo"] img',
      '[aria-label="foto profil"] img',
      // Current generation (stylex era, probed live 2026-10-20):
      // exactly one img per chat-list row — the Avatar.
      '[aria-label="Chat list"] [role="row"] img',
      '[aria-label="Daftar chat"] [role="row"] img',
      // v2.3000 layer: rows were role="listitem".
      'div[role="listitem"] img',
      // The open conversation's header avatar.
      "#main header img",
      // Fallback layer: current-generation avatar container class.
      'div[role="listitem"] ._ak8h',
      // Fallback layer: previous generation's avatar structure.
      "._1AHcd ._13jwn",
    ],
    defaultEnabled: true,
    multiplier: 0.5,
    kind: "image",
  },
  {
    id: "media",
    label: "Media",
    selectors: [
      // Media inside message bubbles (structural).
      ".focusable-list-item img",
      ".focusable-list-item video",
      // Fallback layer: sticker element in the current generation.
      "div._amk4 ._am2s",
      // Fallback layer: media gallery thumbnails.
      "div._ajuf._ajuh._ajug > div",
    ],
    defaultEnabled: true,
    multiplier: 2.5,
    kind: "image",
  },
  {
    id: "chatHeader",
    label: "Chat Header",
    selectors: [
      // The bar at the top of the open conversation (structural id +
      // element, the surviving piyushraj semantic set).
      "#main header",
    ],
    defaultEnabled: true,
    // ×2, not ×1: the header's identity text is large and bold, and
    // a live computed-style probe (2026-10-21) showed the plain global
    // intensity left it legible (blur applied, just too weak). The
    // header bar gets double so its name is unreadable like the rest.
    multiplier: 2,
    kind: "text",
  },
];

/** Read-only target metadata for surfaces that render Settings (popup). */
export const TARGET_METADATA: readonly Pick<
  BlurTargetDef,
  "id" | "label" | "defaultEnabled"
>[] = CATALOGUE.map(({ id, label, defaultEnabled }) => ({
  id,
  label,
  defaultEnabled,
}));
