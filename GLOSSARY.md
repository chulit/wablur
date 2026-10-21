# WhatsApp Blur

Visual Privacy for WhatsApp Web in the browser. This file is the single source of truth for vocabulary — terms only, no decisions or implementation. Decisions live in `grill-decisions.md`; evidence lives in `research.md`.

## Language

**Visual Privacy**:
Protection of on-screen content from being read by onlookers. It is not security, encryption, or access control: blurred content still exists on the page and can be copied or inspected.
_Avoid_: security, protection, safe, encryption

**Blur**:
The state of content that is present and laid out as usual, but rendered illegible.
_Avoid_: hide, mask, redact, remove

**Blur Target**:
A named category of WhatsApp Web content that can be blurred independently of the others. The six targets are Messages, Previews, Names, Avatars, Media, and Chat Header.
_Avoid_: element, item, region, content

**Message**:
A single chat bubble inside the open conversation.
_Avoid_: chat text

**Preview**:
The short excerpt of the latest message shown for a conversation in the Chat List, outside the open conversation.
_Avoid_: last message, snippet

**Name**:
The displayed name of a contact or group, wherever it appears.
_Avoid_: title, label

**Avatar**:
The profile image of a contact, group, or the user themself.
_Avoid_: profile picture, photo

**Media**:
An image, video, sticker, or document shared inside a conversation, including its thumbnail.
_Avoid_: attachment, file

**Chat Header**:
The bar at the top of the open conversation identifying who the conversation is with.
_Avoid_: title bar

**Reveal**:
A temporary clearing of Blur on a single Blur Target that does not change any Settings — for example, hovering over one blurred Message.
_Avoid_: unblur, show, open

**Toggle**:
A deliberate change of state that turns Blur on or off globally, such as the master switch or its keyboard shortcut.
_Avoid_: reveal

**Mode**:
The named Reveal behaviour chosen in the popup: Standard or Screen Share. (Retired for one day on 2026-10-20 in favour of a bare Hover Reveal switch, then restored on 2026-10-21 when the maintainer adopted a popup design that carries Modes — the later decision wins; see `grill-decisions.md` amendments.)
_Avoid_: profile, configuration

**Standard Mode**:
The Mode for everyday use, in which Reveal is available.
_Avoid_: normal mode, default mode

**Screen Share Mode**:
The Mode for sharing or presenting the screen, in which Reveal is unavailable — nothing Reveals, whatever the cursor does. Per-target Blur Target choices are untouched (this Mode gates Reveal only).
_Avoid_: presentation mode, strict mode

**Exposure**:
A situation in which the screen may be seen by someone other than the user. The two recognised exposures are Screen Share and Shoulder Surfing.
_Avoid_: risk, threat

**Shoulder Surfing**:
Exposure in which a nearby person can look at the screen in a shared physical space.
_Avoid_: peeking

**Lock**:
A full-screen gate, unlocked by a PIN, that blocks viewing of WhatsApp Web entirely until the PIN is entered. Shipped in v1.5.0 (see grill-decisions amendment #5). Blur is never a Lock.
_Avoid_: blur, hide

**Blur Type**:
The visual style every Blur Target is rendered in, chosen once for all targets: Blur (the classic gaussian), Mosaic (pixelated blocks), Redact (solid bars for text, blacked-out images), Frost (heavy wash), or Fade (greyscale with a light blur). Shipped in v1.6.0 (amendment #6).
_Avoid_: effect, filter mode

**Settings**:
The user's own choices for which Blur Targets are blurred, in which Mode, and with what intensity.
_Avoid_: preferences, config

**Local-Only**:
The extension has no backend of its own and makes no network requests; all behaviour runs in the user's browser and Settings live in browser storage. If the user's browser sync is on, browser storage may be carried by the browser itself — that is the browser's doing, never the extension contacting a server.
_Avoid_: offline, private cloud, no-sync
