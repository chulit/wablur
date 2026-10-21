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
      // Links gallery entries (probed live 2026-10-21): a
      // link-gallery entry reuses the conversation bubble anatomy
      // (msg-container / tail-in / msg-meta), but the
      // .focusable-list-item anchor above does not exist there —
      // v1.8.2 live testing showed the Message body under each
      // preview card staying readable. The body text lives in
      // selectable-text spans and the URL in a url-element.
      '[data-testid="link-gallery"] [data-testid="selectable-text"]',
      '[data-testid="link-gallery"] [data-testid="url-element"]',
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
      // Search results (probed live 2026-10-21): result rows mirror
      // chat-list rows inside a localised results grid, so the
      // Preview line is the same titled span without dir. The EN
      // label is probed; the ID label is an unverified fallback
      // candidate.
      '[aria-label="Search results."] [role="row"] span[title]:not([dir="auto"])',
      '[aria-label="Hasil pencarian."] [role="row"] span[title]:not([dir="auto"])',
      // Media gallery view, Docs + Links tabs (probed live
      // 2026-10-21): the Docs filename caption is a plain span with
      // its own data-testid (the value literally contains a space)
      // and the Docs meta lines are span[title] without dir; link
      // titles and descriptions are plain spans with their own
      // testids, and the message snippet inside a link entry is a
      // bare span[dir="auto"] without title. The link-preview-*
      // testids are deliberately unscoped — those components only
      // exist inside link galleries.
      '[data-testid="doc-gallery"] [data-testid="document-caption selectable-text"]',
      '[data-testid="doc-gallery"] span[title]',
      '[data-testid="link-preview-title"]',
      '[data-testid="link-description"]',
      '[data-testid="link-gallery"] span[dir="auto"]:not([title])',
      // Links gallery, second live pass (probed live 2026-10-21):
      // the small domain line under a preview card (e.g.
      // "id.shp.ee") escaped v1.8.2 — it is a span[dir="ltr"]
      // inside the link-preview-container.
      '[data-testid="link-gallery"] [data-testid="link-preview-container"] span[dir="ltr"]',
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
      // Search surfaces (probed live 2026-10-21): search-result
      // rows mirror chat-list rows inside a localised results grid,
      // and Recent searches items are buttons inside a localised
      // group living outside #pane-side — the Name span carries
      // title + dir="auto" in both. The EN labels are probed; the
      // ID labels are unverified fallback candidates.
      '[aria-label="Search results."] [role="row"] span[title][dir="auto"]',
      '[aria-label="Hasil pencarian."] [role="row"] span[title][dir="auto"]',
      '[role="group"][aria-label="Recent searches"] span[title][dir="auto"]',
      '[role="group"][aria-label="Pencarian terakhir"] span[title][dir="auto"]',
      // Contact/Group info panel (probed live 2026-10-21): the
      // drawer root carries a locale-independent data-testid, and
      // the identity texts (Name, phone, about) are bare dir="auto"
      // spans — no title attributes anywhere in the drawer.
      '[data-testid="chat-info-drawer"] span[dir="auto"]',
      // Media gallery view, Docs + Links tabs (probed live
      // 2026-10-21): inside doc-gallery the sender names / bidi
      // texts are bare span[dir="auto"] (no title); inside
      // link-gallery the sender names keep the classic
      // title + dir="auto" signature.
      '[data-testid="doc-gallery"] span[dir="auto"]',
      '[data-testid="link-gallery"] span[title][dir="auto"]',
      // Bubble author names inside link-gallery entries carry
      // their own data-testid (probed live 2026-10-21).
      '[data-testid="link-gallery"] [data-testid="author"]',
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
      // Search surfaces (probed live 2026-10-21): the img of a
      // search-result row inside the localised results grid, and
      // the img of a Recent searches item (a button inside a
      // localised group outside #pane-side). The EN labels are
      // probed; the ID labels are unverified fallback candidates.
      '[aria-label="Search results."] [role="row"] img',
      '[aria-label="Hasil pencarian."] [role="row"] img',
      '[role="group"][aria-label="Recent searches"] img',
      '[role="group"][aria-label="Pencarian terakhir"] img',
      // Contact/Group info panel (probed live 2026-10-21): the
      // profile photo is an SVG <image> (svg > g > image) — the
      // only svg in the drawer containing an <image>; the other
      // svgs are plain icons. The drawer holds no <img> at all.
      '[data-testid="chat-info-drawer"] svg:has(image)',
      // Media gallery view, Links tab (probed live 2026-10-21):
      // entry avatars are plain <img> elements inside link-gallery.
      '[data-testid="link-gallery"] img',
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
      // Media-canvas thumbnails (probed live 2026-10-21 on two
      // surfaces: the Contact/Group info panel strip and the
      // Media/Links/Docs view, which replaces the drawer — so the
      // selector is deliberately NOT drawer-scoped; the component
      // means Media wherever it appears). Background-image divs
      // carrying a locale-independent data-testid, on the
      // thumbnail element itself or its immediate parent —
      // selecting the testid element covers both, as a filter on
      // the parent blurs its subtree rendering.
      '[data-testid="media-canvas-img"]',
      // Media gallery view thumbnails (probed live 2026-10-21):
      // document thumbnails in the Docs tab and link-preview
      // thumbnails in the Links tab carry their own
      // locale-independent data-testids.
      '[data-testid="document-thumb"]',
      '[data-testid="link-preview-thumbnail-jpeg"]',
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
