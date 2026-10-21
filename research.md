# WhatsApp Web Blur Extension — Primary-Source Research

- **Date:** 2026-10-20
- **Source access date:** 2026-10-20 (all sources below were opened on this date)
- **Purpose:** background research for a grill-me + codebase-design session. Not a build spec.
- **Authority:** evidence only. Decisions live in `grill-decisions.md` and vocabulary in `GLOSSARY.md` (same folder); the "Implications" subsections below are advisory and lose to `grill-decisions.md` on any conflict.
- **Method:** primary sources only — official Chrome documentation (`developer.chrome.com`), Chrome Web Store program policy pages, the GitHub repositories themselves (manifest / source / commits / issues read directly), MDN, web.dev, and the CSS Filter Effects specification that MDN links to. No blogs, no store-description claims, no DeepWiki summaries were used as evidence. Anything not found in a primary source is listed under **Unknown / not found**, not filled in.

---

## Executive summary — facts that change design decisions

1. **The documented minimal manifest is smaller than every existing implementation's.** With a statically declared `content_scripts` entry, host permissions are *not* required for injection, and `activeTab`/`scripting` are only needed for *programmatic* injection. The minimal set is `permissions: ["storage"]` + `content_scripts.matches: ["https://web.whatsapp.com/*"]`. Both open-source implementations carry more than this (see §1.4, §3) — and unused permissions are an explicit Chrome Web Store rejection class. (§1)
2. **Wanting the Alt+X shortcut is what forces a service worker to exist.** A service worker is *not* a required MV3 key, but the official docs place the `chrome.commands.onCommand` handler in the service worker. So the reveal-mechanism decision (shortcut toggle vs popup/content-only) is also an architecture decision. (§1.3, §1.5)
3. **Static CSS beats JS-injected CSS on the privacy-critical moment: first paint.** CSS files declared in `content_scripts` are injected *"before any DOM is constructed or displayed"*, while JS defaults to `document_idle` (after DOM/resources load). A JS-only design can flash unblurred messages on load; a declarative-CSS-first design cannot. One inspected implementation (i-naeem/BlurChat) is *entirely* declarative CSS in the manifest. (§1.1, §3.4)
4. **Selector churn, not code, is the dominant maintenance cost — and semantic anchors survive better than test IDs / obfuscated classes.** LukasLen keeps *two whole WhatsApp generations* of selectors (v2.2412.xx and v2.3000.xx) in parallel in every CSS file; one WhatsApp update commit touched 9 CSS files (+358 lines). Piyushraj's single selector-fix commit replaced *all* `data-testid` selectors with `aria-label` / `role` / `#main` anchors. (§3, §4)
5. **No MutationObserver is needed for the blur itself — in any inspected implementation.** All three open-source implementations apply blur purely as CSS (declarative file, `<link>` per category, or generated `<style>`); CSS matching covers DOM nodes WhatsApp adds later. JavaScript observation in these codebases exists only for *non-CSS state*: the idle timer, the shortcut toggle, and the toolbar icon. (§3, §4)
6. **"Collects nothing" does not mean "no privacy obligations" if published.** Store policy triggers on *handling* user data (collecting, transmitting, **using**, or sharing), explicitly including website content and personal communications, and local-only storage does **not** exempt an extension from disclosure or a privacy policy. Whether pure CSS blurring counts as "handling" is not answered by any official page (Unknown #1). (§2)
7. **Selector fixes cannot be hot-pushed.** MV3 requires the extension's full functionality to be discernible from the submitted package; remotely fetched logic is prohibited. A migration doc (not the policy page itself) says remotely hosted code "does not include data or things like JSON or CSS" — so remotely fetched *selectors* sit in a grey zone. Plan on selector fixes shipping as store-reviewed updates. (§2.4)
8. **Blur is a visual effect only — do not overclaim it.** MDN documents accessibility-tree removal for `visibility: hidden` and `display: none`, and documents *no* equivalent for `filter`; whether blurred text remains selectable/copyable/screen-reader-exposed is not stated in MDN/web.dev (Unknown #9). Also, `filter` on an ancestor creates a containing block for fixed-position descendants, so blurring a large container (e.g. `document.body`, as one implementation's idle mode does) is a layout risk; per-category elements are safer. (§5)

---

## 1. Manifest V3 platform facts

Sources: official Chrome Extensions documentation on `developer.chrome.com`.

### 1.1 Content scripts: matching, timing, world

- Static declaration is the documented pattern for a well-known set of pages: *"Use static content script declarations in manifest.json for scripts that should be automatically run on a well known set of pages"*; only `matches` plus either `js` or `css` are required.
  - https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
  - https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- A match pattern is `<scheme>://<host><path>`; `https://web.whatsapp.com/*` = https scheme, that exact host, any path.
  - https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- `run_at` **defaults to `document_idle`** — *"the DOM and resources have finished loading. This is the default."* `document_start` injects while the DOM is still loading; `document_end` when the DOM is complete but subresources may still load.
  - https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- Critically for a privacy blur, manifest-declared **CSS** is treated differently from JS: CSS files are *"injected in the order they appear in this array, before any DOM is constructed or displayed for the page."*
  - https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- `world` **defaults to `ISOLATED`**: *"a private isolated execution environment that isn't accessible to the page or other extensions."* Content scripts share the page's **DOM** but not its JavaScript environment — the content script cannot directly read/write the page's JS variables, and vice versa; page↔script communication must go through the shared DOM. Choosing `MAIN` shares the host page's execution environment and subjects the script to the page's CSP. Blur (CSS/DOM only) needs nothing from `MAIN`.
  - https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
  - https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts

### 1.2 chrome.storage: sync vs local, onChanged

All numbers from https://developer.chrome.com/docs/extensions/reference/api/storage :

| Fact | `storage.sync` | `storage.local` |
|---|---|---|
| Total quota | `QUOTA_BYTES` = **102,400** ("approximately 100 KB") | `QUOTA_BYTES` = **10,485,760 (10 MB)** |
| Per item | `QUOTA_BYTES_PER_ITEM` = **8,192** | none listed |
| Max items | `MAX_ITEMS` = **512** | none listed |
| Write limits | **120/minute**, **1,800/hour** (`MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE` is deprecated — "no longer has a sustained write operation quota") | none listed |
| Behaviour | Syncs to every Chrome the user is signed into if sync is enabled; if disabled, behaves like `local` | Local to the machine; cleared when the extension is removed |

- Google's own recommendation: *"We recommend using `storage.sync` to preserve user settings across synced browsers."* A handful of boolean toggles + blur intensities is orders of magnitude under every sync quota, and human-speed toggling is far under the write limits.
- `chrome.storage.onChanged` is *"Fired when one or more items change"*; the callback receives `(changes, areaName)`, each change carrying optional `oldValue`/`newValue`. The docs' canonical pattern is exactly this extension's shape: a settings UI *"immediately saves the new settings to `storage.sync`, and the service worker uses `storage.onChanged` to apply the setting as soon as possible"* (filtering on `area === 'sync'`).
  - https://developer.chrome.com/docs/extensions/reference/api/storage
  - Per-area form: https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea
- All extension contexts — service worker **and content scripts** — can access the Storage API directly, so a content script can listen and re-apply settings itself with no service-worker relay.
  - https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts

### 1.3 chrome.commands and Alt+X

Source: https://developer.chrome.com/docs/extensions/reference/api/commands

- Commands are declared under the manifest `"commands"` key (not in `permissions`). Each command takes `suggested_key` and `description` ("Descriptions are required for standard commands"). The LukasLen implementation's real declaration matches this shape exactly: `"toggle": { "suggested_key": { "default": "Alt+X" }, "description": "Toggle On/Off" }` (§3.2).
- **Limit: at most four suggested shortcuts per extension.** *"An extension can have many commands, but may specify at most four suggested keyboard shortcuts. The user can manually add more shortcuts from the `chrome://extensions/shortcuts` dialog."*
- Shortcuts must include `Ctrl` or `Alt` (`Shift` optional), so `Alt+X` is valid on its face. On macOS, `Alt` is the Option key and `Ctrl` is auto-converted to `Command`.
- A suggested key is **not a reservation**: OS and Chrome shortcuts *"always take priority … and cannot be overridden"*; if another extension already uses the shortcut, *"the second extension's shortcut won't register as expected"* (docs advise checking with `chrome.commands.getAll()` at install for commands whose `shortcut === ''`); users can remap any command at `chrome://extensions/shortcuts`. No mechanism to lock a shortcut is offered in the docs.
- The handler lives in the service worker: *"In your service worker, you can bind a handler to each of the commands defined in the manifest using `onCommand.addListener`."* The reserved `_execute_action` command is the exception — it triggers the action and does not dispatch `onCommand`.
  - https://developer.chrome.com/docs/extensions/develop/ui/respond-to-commands

### 1.4 Permissions: the minimal set

- `"storage"` is the permission that enables the Storage API, and the official permissions list shows **no "Warning displayed" line for `storage`, `scripting`, or `activeTab`**.
  - https://developer.chrome.com/docs/extensions/reference/api/storage
  - https://developer.chrome.com/docs/extensions/reference/permissions-list
- Host permissions are **not required** for *"Allowing the injection of a content script declared in the manifest."* `activeTab`/`scripting` + host access are the requirements for **programmatic** injection (`chrome.scripting.executeScript`), not for a static `content_scripts` declaration.
  - https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
  - https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- `content_scripts.matches` is itself a permission category: it *"allows content scripts to inject into one or more hosts. Changes may trigger a warning"*, and *"Adding or changing match patterns in the `"host_permissions"` and `"content_scripts.matches"` fields … will also trigger a warning."* So a warning tied to web.whatsapp.com access exists even in the minimal design — it comes from the match pattern, not from a `host_permissions` key.
  - https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- The exact wording of the single-site install warning is **not transcribed in the text of the official docs** (the tutorial shows it as a screenshot image) — see Unknown #6. Chromium's own security FAQ illustrates the pattern with an example prompt saying an extension can *"Read and change your data on google.com"*:
  - https://chromium.googlesource.com/chromium/src/+/main/extensions/docs/security_faq.md
- Store policy reinforces minimality from the other side: request *"the narrowest permissions necessary"* and don't "future proof"; requesting a permission the extension doesn't use is a listed rejection reason (`Purple Potassium`, "Excessive permissions").
  - https://developer.chrome.com/docs/webstore/program-policies/policies
  - https://developer.chrome.com/docs/webstore/troubleshooting

### 1.5 Service worker: when is one actually required?

- `"background"` is an **optional** manifest key. The only required keys are `"manifest_version"`, `"name"`, `"version"`; the manifest reference's minimal and content-script examples contain no `background` key.
  - https://developer.chrome.com/docs/extensions/reference/manifest
  - https://developer.chrome.com/docs/extensions/get-started/tutorial/scripts-on-every-tab
- A service worker becomes necessary in this design only for documented service-worker jobs:
  1. **A custom `chrome.commands` handler** (§1.3) — e.g. LukasLen's worker flips `settings.on` in storage when the `toggle` command fires, and updates the toolbar icon on storage change (§3.2).
  2. **`runtime.onInstalled` one-time initialisation** — *"fired when the extension is first installed, when the extension is updated to a new version, and when Chrome is updated… Use this event to set a state or for one-time initialization."* Seeding default settings is the tutorial pattern, but the docs do not state defaults *must* be seeded there (a reader-side fallback is a legitimate alternative design).
     - https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
     - https://developer.chrome.com/docs/extensions/reference/api/runtime
- If used, it is declared as `"background": { "service_worker": "<single JS file>" }`; no `navigator.serviceWorker.register()` call is needed.
  - https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics

#### Implications for our design (§1)

- **Seam placement:** `chrome.storage` is the only seam the popup module and the content-script module need to share — both can read/write/listen to it directly, so there is no message-passing module to design at all in the minimal shape. The interface is "one settings object in `storage.sync`", which keeps the settings module deep: every caller learns one key and one shape.
- **The service worker is an adapter added by one feature, not a foundation.** If the grill keeps the Alt+X global toggle, a thin worker module exists for exactly two jobs (command → flip `settings.on`; `onInstalled` → seed defaults). If reveal is hover/popup-only, the worker module is deleted entirely — the deletion test says it earns its place only while the command feature lives.
- **Locality of the flash-of-content risk:** because declarative CSS lands before DOM display and JS lands at `document_idle`, the *first-paint guarantee* lives in the manifest/CSS module, not in JS timing code. Design CSS-first (categories as static CSS), and let JS handle only settings-driven switching — never let the initial blur depend on a script running.
- **Grill impact (publish vs personal):** for a personal sideload, warnings don't matter; for publishing, the match-pattern warning is unavoidable but the *permission set* is a differentiator — `["storage"]` only is both the documented minimum and visibly smaller than piyushraj's `["activeTab","scripting","storage"]`.

---

## 2. Chrome Web Store policy facts

Sources: official program-policy and publishing pages on `developer.chrome.com/docs/webstore/…`.

### 2.1 Single purpose

- Quality Guidelines, verbatim: *"An extension must have a single purpose that is narrow and easy to understand. Don't create an extension that requires users to accept bundles of unrelated functionality."* Listed violations are bundles — e.g. a ratings tool that also injects ads, an email notifier combined with a news aggregator.
  - https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines
  - https://developer.chrome.com/docs/webstore/program-policies/policies
- The official FAQ defines the term two ways — a narrow **focus area/subject matter** (multiple related functions allowed) or a narrow **browser function** — and warns: *"Excessive permissions unrelated to your extension's single purpose will be viewed as enabling unrelated functionalities, resulting in a policy violation."*
  - https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq
- Publishing requires a detailed **single-purpose description** field in the dashboard, plus a per-permission justification for every manifest permission.
  - https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- A purpose stated as "blur WhatsApp Web content on web.whatsapp.com for privacy until the user reveals it" fits the narrow-focus limb on the face of this text. What endangers it is bundling: unrelated features behind the same action icon are a listed rejection reason.
  - https://developer.chrome.com/docs/webstore/troubleshooting

### 2.2 Privacy / data use: "handles", not "collects"

- Privacy Policy clause, verbatim trigger: *"If your Product handles any user data, then you must post an accurate and up to date privacy policy"* (linked from the designated dashboard field; putting it only in the description is a listed "common mistake" rejection).
  - https://developer.chrome.com/docs/webstore/program-policies/policies
  - https://developer.chrome.com/docs/webstore/troubleshooting
- The User Data FAQ defines handling broadly: *"'handle' [means] collecting, transmitting, using, or sharing user data"*, with examples including *"Clipping or scraping content from a website that the user visits"* and collecting *"information about the website content or resources a user requests or interacts with."* Its list of user-data types includes **"Website content and resources"** and **"Personal communications."**
  - https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Local-only does not exempt: *"Does an extension need to disclose user data handling if the data is only processed or stored locally on a user's device? **Yes.**"* — and a product that stores data locally **or via Chrome Storage Sync** and handles user data still must post a privacy policy (it "may not need to be long or complicated").
  - https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- The clean exemption is narrow: *"My Product DOES NOT handle user data. What do I need to do? **You have no special or new obligations under the User Data Policy.**"*
  - https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Limited Use: extensions *"may only collect, use, or transmit user data that is necessary for the extension's disclosed single purpose"*; *"Collection and use of web browsing activity is prohibited, except to the extent required for a user-facing feature described prominently in the Product's Chrome Web Store page and in the Product's user interface"*; an affirmative Limited Use compliance statement must appear on a website belonging to the extension.
  - https://developer.chrome.com/docs/webstore/program-policies/policies
- Disclosure must happen **prior to installation** and be prominent, with the user's "affirmative and informed consent", if the product handles user data; dashboard disclosures, the privacy policy, and actual behaviour must agree — discrepancies are a policy violation that can suspend the publisher's items.
  - https://developer.chrome.com/docs/webstore/program-policies/policies
  - https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

**The honest reading for this extension:** WhatsApp Web's DOM is, in the FAQ's categories, website content containing personal communications. A content script that *reads* DOM content plainly risks being treated as handling it. Whether a *pure-CSS* blur — selectors applied without reading, extracting, storing, or transmitting any content — counts as "handling" is **not answered by any official page found** (Unknown #1), and no official page states whether a locally stored preference alone is "user data" (Unknown #2). The policy-grounded publishing posture is therefore: post a short privacy policy and disclose website-content access, rather than certifying "handles no data" while running a content script on a messaging site.

### 2.3 Trademark, naming, impersonation

- Impersonation & IP, verbatim: *"Don't pretend to be someone else, and don't represent that your product is authorized by, endorsed by, or produced by another company or organization, if that is not the case"* and *"Don't infringe on the intellectual property rights of others, including patent, trademark…"*; visibility may be impacted for potential infringement. Metadata (title, icon, description, screenshots) that impersonates or claims endorsement is a listed rejection class.
  - https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property
  - https://developer.chrome.com/docs/webstore/troubleshooting
- The official **Branding Guidelines page covers Google trademarks only**: don't use Google marks in the extension name/logo without permission; compatibility references to a *Google* product use "for / for use with / compatible with" plus the ™ symbol. **It gives no rule for non-Google marks** — it cannot be cited as permission to use "for WhatsApp" or the WhatsApp logo (Unknown #5).
  - https://developer.chrome.com/docs/webstore/branding
- Existing practice in the primary sources themselves: both open-source projects carry an explicit non-affiliation disclaimer (LukasLen README: *"WhatsApp is a trademark of WhatsApp Inc.… This extension is an independent project… and has no relationship to WhatsApp or WhatsApp Inc."*; piyushraj README: *"not affiliated with WhatsApp Inc."*), and neither uses the WhatsApp logo as its icon (LukasLen uses an eye icon; piyushraj a custom "whatsappPrivacy" graphic).
  - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web
  - https://github.com/piyushraj2340/Whatsapp-Privacy-Extension

### 2.4 Modifying another site's UI / reading its DOM; remote code

- **No general ban was found** in the official policy pages on modifying a third-party site's UI or reading its DOM (Unknown #6). Documented risks are specific:
  - **Ads are regulated separately and strictly** — showing ads alongside a third-party site has its own conditions; bundling ad injection with another feature also breaks single-purpose (§2.1).
    - https://developer.chrome.com/docs/webstore/program-policies/ads
  - **Non-obvious functionality is a violation**: *"Don't misrepresent the functionality of your product or include non-obvious functionality that doesn't serve the primary purpose"* — and, pointed for this category, *"privacy… extensions that do not provide any discernible monitoring or protection"* are listed as impermissible, i.e. the claimed protection must be real and discernible.
    - https://developer.chrome.com/docs/webstore/program-policies/policies
  - **Content-script-injected persistent UI is discouraged** (recommendation, not ban): toolbars injected into every page *"are not recommended because they slow down every page load, clutter the UI, and can lead to security problems… Instead, consider using an action popup."* A CSS-only blur injects no UI, which keeps it clear of this guidance.
    - https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq
  - No policy page found makes violating the *target site's own Terms of Service* itself a Web Store violation (Unknown #6).
- **Remote code (MV3):** *"the full functionality of an extension must be easily discernible from its submitted code… The extension may reference and load data and other information sources that are external to the extension, but these external resources must not contain any logic."* Code must not be obfuscated (minification is allowed), and remote code use must be declared in the dashboard or the item "will be rejected."
  - https://developer.chrome.com/docs/webstore/program-policies/policies
  - https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- The CSS carve-out lives in a *migration doc*, not a policy page: *"Remotely hosted code, or RHC, is what the Chrome Web Store calls anything that is executed by the browser that is loaded from someplace other than the extension's own files. Things like JavaScript and WASM. It does not include data or things like JSON or CSS."*
  - https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code

#### Implications for our design (§2)

- **Grill impact (publish vs personal):** publishing is cheap in features but expensive in *paperwork surface* — single-purpose statement, per-permission justifications, privacy-practices checkboxes, a hosted privacy policy, and a Limited Use statement on a website. None of that exists in the personal-sideload path. This is a real, sourced cost to put in front of the publish decision.
- **Differentiation that policy rewards:** the narrowest permission set (§1.4) is simultaneously a store-review asset ("narrowest necessary") and a user-facing claim. Conversely, a "collects nothing" marketing claim that contradicts a dashboard certification is itself a removal risk — the interface between *what the module does* and *what the listing says* must be one consistent story.
- **Seam discipline for updates:** selector data wants to be remotely updatable (it breaks often, §4), but policy pushes all logic into the package. Keep the selector module *inside* the package and accept store-review latency for fixes; treat any remote-selector idea as a policy risk to be re-checked, not a default architecture.
- **Naming:** use a descriptive, non-WhatsApp-logo icon and an explicit non-affiliation disclaimer (the pattern both predecessors use). "…for WhatsApp" wording has no official blessing for non-Google marks — flag it as a judgement call, not a cleared fact.

---

## 3. Existing implementations — from source code

Correction to the original brief: the original extension's author is **Lukas Lenhardt (GitHub: LukasLen)** per the repo's README/LICENSE — the name "LukasHechenberger" appears nowhere in the primary sources (Unknown #11 covers the mix-up's origin; it is simply not in the repo).

### 3.1 piyushraj2340/Whatsapp-Privacy-Extension

- Repo: https://github.com/piyushraj2340/Whatsapp-Privacy-Extension — public, 6 commits, created 2023-02-15, current commit `08b1fec`. **No LICENSE file and no license field — license unknown.** Issues: 0 total.
- Manifest (MV3, v1.0): `permissions: ["activeTab","scripting","storage"]`, `background.service_worker: bgRunning.js`, popup at `popup/index.html`, and one content script with the exact match `"https://web.whatsapp.com/"` (**no `/*` wildcard**).
  - https://github.com/piyushraj2340/Whatsapp-Privacy-Extension/blob/master/manifest.json
- Selector strategy — `updateCSS()` in `privacy.js` makes exactly 8 calls, all semantic anchors, *no obfuscated classes*:
  - https://github.com/piyushraj2340/Whatsapp-Privacy-Extension/blob/master/privacy.js

  | Category | Exact selector | Setting |
  |---|---|---|
  | Own profile photo | `[aria-label="profile photo"] img` | `profileChecked` |
  | Open-chat header | `#main header` | `senderProfileChecked` |
  | Group-info panel | `[aria-label="Group Info"] .copyable-area` | `senderProfileChecked` |
  | Chat list | `[aria-label="Chat list"] [role="listitem"]` | `chatListChecked` |
  | Search results list | `[aria-label="Search results."] [role="listitem"]` | `chatListChecked` |
  | Messages | `.focusable-list-item` | `messageChecked` |
  | Input area | `#main footer` | `messageChecked` |
  | Reactions (emoji) | `.focusable-list-item .emoji` at **5×** blur | `messageReactionChecked` |

  There is **no dedicated name selector and no dedicated media selector** — names/media are blurred only incidentally inside the containers above. An earlier `data-testid`-based generation (`chatlist-header`, `conversation-header`, `msg-container`, `reaction-bubble`, …) survives only as commented-out dead code and an unused `class.js`.
- Blur application: a generated `<style>` element per call — `` `${selector} {filter: blur(${blurSize}px) !important; transition: filter 0.5s !important;} ${selector}:hover {filter: blur(0px) !important;}` `` — appended to `<head>`. **Every `updateCSS()` run appends 8 new `<style>` elements and never removes old ones**; re-runs are triggered by `chrome.storage.onChanged`. No `MutationObserver`; per-element inline styling exists only in commented-out code.
- Hover reveal: pure CSS `:hover` in the same generated string. No JS hover handling.
- Breakage history: exactly one explicit selector-fix commit out of 6 — `14b30c6` "updated the css selector" (2023-09-19) replaced the **entire** `data-testid` selector set with the aria/role/`#main` set above and added `!important`; one further commit title mentions a chat-list scrolling bug (2024-01-25).
  - https://github.com/piyushraj2340/Whatsapp-Privacy-Extension/commit/14b30c66b2e05f935539522fc81f8160dc0f50e5

### 3.2 LukasLen/Privacy-Extension-For-WhatsApp-Web (the original; store ID `jbojhlhhggfmmkpefknmbdhlaghehini`)

- Repo: https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web — public, **archived/read-only 2026-06-22**, 130 commits, 33 releases, created 2018-06-07, **MIT** (LICENSE, © 2018–2024 Lukas Lenhardt). README: *"This project is no longer actively maintained"*; development continues in a successor repo (§3.3). Issues: 73 closed, 1 open (#126).
- Manifest (MV3, v3.3.2): `permissions: ["storage"]`, `host_permissions: ["https://web.whatsapp.com/*"]`, content script `scripts/contentScript.js`, a `background.service_worker`, 9 category CSS files exposed as `web_accessible_resources`, and the `toggle` command with `suggested_key.default: "Alt+X"`.
  - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/manifest.json
  - Note the contrast with §1.4: the docs say `host_permissions` is not required for static injection — this project declares it anyway (its worker also runtime-requests `origins: ["https://web.whatsapp.com/*"]` + `storage` via `browser.permissions.request` on install).
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/background.js
- Selector strategy: **one CSS file per category**, and in every file **two WhatsApp generations are kept side by side** — selectors commented `former wa version (v2.2412.xx)` alongside `updated wa version (v2.3000.xx)`. The v2.3000 generation mixes structural anchors (`div[role="listitem"]`, `div[role="dialog"]`, `div.overlay`) with obfuscated classes (`._ak8q` names, `._ak8h` profile pics, `._amk6` message text). Examples, copied from source:
  - Messages (`messages.css`): `div._amk4 > ._amk6` (message text), `div._amk4 ._am2s` (sticker), `span._amk7`, with `filter: blur(var(--ms-blur)) grayscale(1)`.
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/css/messages.css
  - Names (`name.css`): ~37 selectors, incl. `div[role="listitem"] ._ak8q`, `div[role="dialog"] div.copyable-text` (phone numbers), and the open-chat header name via `div[role="button"].x78zum5.xdt5ytf… > div:nth-child(1)`. **There is no separate header category** — the header is covered by the name + profile-pic files.
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/css/name.css
  - Profile pics (`profilePic.css`): `div[role="listitem"] ._ak8h` etc., at three sizes via `--pp-blur` / `--pp-lg-blur` / `--pp-sm-blur`.
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/css/profilePic.css
  - Chat-list preview (`messagesPreview.css`): just `.vQ0w7` (former) and `div._ak8k` (v2.3000) — there is no chat-list *container* selector; rows are covered by the name + pic + preview selectors targeting `div[role="listitem"]`.
  - Media (`mediaPreview.css`, `mediaGallery.css`): long `:is(…):not(…)`-guarded selector lists over `div._amk4 > ._amk6 …`, gallery via `div._ajuf._ajuh._ajug > div` etc.
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/css/mediaPreview.css
  - Text input (`textInput.css`) is not blurred at all: `filter: grayscale(1) opacity(0.25)`.
- Blur application: the content script inserts one **`<link rel="stylesheet">` per enabled category** (`browser.runtime.getURL('css/'+id+'.css')`, class `pfwa`) and removes links for disabled ones; blur amounts are CSS variables set by a small generated `<style>` (`#whatsapp-web body { --ms-blur: 8px; … }`; defaults in the worker: messages/preview 8px, names 5px, profile pics 3/8/12px, media 20px, whole-page idle blur 14px). Settings live as **one object** under the single key `settings` in `storage.sync` (`{ on, styles: {…per-category booleans}, varStyles: {…}, blurOnIdle: {…} }`); the content script re-applies on `storage.onChanged` (area `sync`, key `settings`). **No `MutationObserver` anywhere in `src/`.**
  - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/scripts/contentScript.js
  - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/background.js
- The one place JS *does* touch the page directly is the non-CSS feature: **blur-on-idle** sets `document.body.style.filter = "blur(var(--wi-blur)) grayscale(1)"` from a timer listening to `pointermove`/`pointerdown`/`keydown` — an inline style on `<body>`, not a stylesheet rule.
- Hover reveal: pure CSS `:hover { filter: blur(0) grayscale(0); transition-delay: 0.3s; }` duplicated per selector in every category file; `noDelay.css` re-declares the hover selectors with `transition-delay: 0.04s !important`, and `unblurActive.css` re-declares them as `body:hover <selector>` for "unblur all on app hover" — i.e. each reveal variant costs a full copy of the selector list.
- Breakage history (from `git log`, 130 commits): at least **9 WhatsApp-version adaptation commits** (e.g. "Updated to WhatsApp 2.2142.12", 2021; "Update to support WhatsApp Web 2.2323.4", 2023). Two opened examples:
  - `20c4729` "Update to support WhatsApp Version 2.3000.xx" (2024-04-05): **9 CSS files, +358/−22** — an entire new selector generation added (the preview target was `div._ak8j` in that commit and is `div._ak8k` in the current file: even within one generation, classes drift).
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/commit/20c4729970fa500437ae33b41a05bae4cfbcdeb3
  - `33d6d9f` "Fix name and profile picture blur in new WA version" (2024-08-28): the semantic anchor itself changed — `div[role="row"] ._ak8q/._ak8h` → `div[role="listitem"] ._ak8q/._ak8h` across 4 files.
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/commit/33d6d9f12ea2634410af1be55e708aecbb1b139a
  - Last substantive fix `b0fddcd` (2025-03-09) rewrote the header selectors again (5 files, +52/−23).
    - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/commit/b0fddcdd750c0d9ef265167a4643b8a518036de0

### 3.3 Successor: aryomuzakki/privacy-whatsapp-web-auto-blur

- The archived repo's README names this as the continuation: https://github.com/aryomuzakki/privacy-whatsapp-web-auto-blur — public, created 2026-06-01, 178 commits, 4 releases, **MIT**, described as *"Actively maintained continuation… keeping up with every WhatsApp Web update."* Same feature family (per-category toggles, Alt+X, blur-on-idle) plus per-element blur amounts and a theme toggle. Its file-level selector detail was not re-inspected for this report (the LukasLen source above is the inspected baseline; the successor shares its lineage).
- The Firefox listing's version history independently shows the maintenance cadence of this codebase: releases whose entire changelog is *"Updated to support newest WhatsApp Web version"* (3.3.2, 2025-03-13; 3.3.3, 2026-06-23) and 3.0.0's *"Updated CSS files to support new WhatsApp Web version."*
  - https://addons.mozilla.org/id/firefox/addon/privacy-extension-for-whatsapp/versions/

### 3.4 WA Web Plus and BlurChat — source availability

- **WA Web Plus (Elbruz Technologies, wawplus.com): no official public source repository found.** GitHub repository searches for `"WA Web Plus"` and for `wawplus`/`elbruz` returned only unrelated same-name projects; none is identifiable as the official product. **Its selectors, blur method, hover implementation, license, and fix history are therefore Unknown — treat it as closed source for design purposes.**
  - https://github.com/search?q=%22WA+Web+Plus%22&type=repositories
- **BlurChat is two different products.** The store extension "BlurChat - Privacy for WhatsApp Web" by TECHNICAL DOST SOLUTIONS (ID `iehdpaamigekbpiimkjieikpmlknbncj`, v1.0.1, 2025-12-25) has **no GitHub repository found** for that publisher — implementation details Unknown.
- A different, public **i-naeem/BlurChat** (MIT, v1.3.0, branch `alpha`, 27 commits) matches a different store listing and is architecturally the most minimal of all: its manifest declares **declarative CSS only** — `"content_scripts": [{ "matches": ["https://web.whatsapp.com/*"], "css": ["src/blur.css"] }]` with `permissions: ["scripting"]` used solely for a toolbar-click re-injection via `chrome.scripting.insertCSS`.
  - https://github.com/i-naeem/blurchat/blob/alpha/manifest.json
  - Its single `blur.css` blurs messages + chat list with 6 selectors (`div[role="listitem"] div[aria-selected="false"]`, `div[aria-label="Chat list"] div[role="row"]`, `._amid`, `.focusable-list-item`, …) at a fixed `blur(3px)`, hover-reveals via `:hover { blur(0) !important }`, and **force-unblurs the currently open chat** (`div[aria-selected="true"] { blur(0) !important }`). **No dedicated name / profile-photo / media selectors** — they blur only if inside those containers. No MutationObserver, no `<style>` generation, no settings at all.
    - https://github.com/i-naeem/blurchat/blob/alpha/src/blur.css
    - https://github.com/i-naeem/blurchat/blob/alpha/src/background.js

#### Implications for our design (§3)

- **Locality is the whole game:** in LukasLen, one WhatsApp update forced edits in 9 files because the same selectors are repeated in the base rules, the `:hover` copies, `noDelay.css`, and `unblurActive.css`. A deep selector module — one list per category, with hover/delay variants *generated* from it instead of hand-copied — concentrates that recurring change in one place. This is the strongest codebase-design signal in the entire research.
- **Interface choice visible in the wild:** three real interfaces exist for the same behaviour — (a) declarative CSS file in the manifest (i-naeem: zero JS, zero settings, zero flexibility), (b) per-category `<link>` switching driven by one settings object (LukasLen: deep — the content script's interface is just "apply this settings object"), (c) generated `<style>` per selector call (piyushraj: shallow — the caller repeats selector+flag+size 8 times, and leaks `<style>` elements on every settings change). The evidence favours (b)'s shape with (a)'s static-CSS first-paint guarantee for the default-on state.
- **Settings as one object under one key** (LukasLen) vs flat keys (piyushraj): the single-object shape makes the storage seam atomic — one `onChanged` event, one consistent snapshot — and fits easily in sync's 8 KB/item limit.
- **Coverage honesty:** the two "simple" implementations quietly have *no* name/media categories at all. If the grill promises those categories, the selector module inherits LukasLen-level breadth (~37 selectors for names alone) — scope the MVP categories with that cost visible.
- **Grill impact (differentiation):** "open source + no server" is already taken (both inspected projects are local-only; LukasLen's README still notes it contacts its server only to display problem/update info — a nuance a stricter no-network design could differentiate on, but only if the implementation truly makes zero requests).

---

## 4. WhatsApp Web DOM stability evidence

Evidence here is drawn only from the repositories above (source comments, commits, issues) and the store version history of the same codebase. WhatsApp publishes no first-party DOM contract for web.whatsapp.com that was found — see Unknown #8.

- **Obfuscated classes churn every major WhatsApp version, and old ones are kept as dead weight.** LukasLen's CSS files literally carry both generations in parallel, commented `former wa version (v2.2412.xx)` vs `updated wa version (v2.3000.xx)` — e.g. messages moved from `._2AOIt div:first-child` to `div._amk4 > ._amk6`; profile pics from `._1AHcd ._13jwn` to `._ak8h`. Within the v2.3000 generation, the chat-preview class drifted `._ak8j` → `._ak8k` between the April 2024 update commit and the current file.
  - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/css/messages.css
  - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/blob/master/src/css/profilePic.css
- **`data-testid` proved the *least* durable anchor in the piyushraj history:** its one big selector commit deleted the complete `data-testid` set (`chatlist-header`, `conversation-header`, `cell-frame-container`, `msg-container`, `reaction-bubble`) and replaced it with `aria-label` / `role` / `#main` selectors, which are still the active set in the current source.
  - https://github.com/piyushraj2340/Whatsapp-Privacy-Extension/commit/14b30c66b2e05f935539522fc81f8160dc0f50e5
  - https://github.com/piyushraj2340/Whatsapp-Privacy-Extension/blob/master/privacy.js
- **Semantic/structural anchors are more durable but not immortal.** The anchors still in use across both projects: `[aria-label="Chat list"]`, `[aria-label="profile photo"]`, `[aria-label="Group Info"]`, `[role="listitem"]`, `[role="dialog"]`, `#main header`, `#main footer`, `.focusable-list-item`, `.copyable-area`. But LukasLen's Aug 2024 fix shows even the structural layer moves: WhatsApp changed list rows from `role="row"` to `role="listitem"`, breaking name/pic blur until fixed.
  - https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web/commit/33d6d9f12ea2634410af1be55e708aecbb1b139a
- **Breakage cadence:** ≥9 version-adaptation commits across LukasLen's 130-commit history (2018–2025), 73 closed issues, and store releases whose sole changelog line is a WhatsApp-version update (§3.3). Selector maintenance is a recurring, expected event — roughly per major WhatsApp Web release — not an exception.
- **CSS-only injection and DOM mutation:** all three implementations survive WhatsApp's constant DOM churn **with no MutationObserver at all** — CSS selectors match nodes whenever WhatsApp creates them. This is direct, repeated evidence across three independent codebases that declarative CSS does not need JS observation for messages, chat list, names, pics, or media *in the surfaces they cover*.
- **Where JS *was* still needed** (in these codebases): not for observing DOM additions, but for stateful behaviour CSS cannot express —
  - **Idle detection** (LukasLen blur-on-idle: pointer/keyboard listeners + a timer + an inline `body` filter).
  - **The global toggle** (worker-side `commands.onCommand` flipping a storage flag; the content script reacts via `storage.onChanged`).
  - **Toolbar icon state** (worker-side `storage.onChanged` → `action.setIcon`).
  - **Toolbar-click re-injection** (i-naeem's `scripting.insertCSS` on action click).
  - No inspected implementation uses JS observation for the media viewer, calls, or Status surfaces specifically — whether those surfaces need it is **Unknown** (Unknown #10); the media *gallery* in LukasLen is covered by plain CSS selectors like every other category.

#### Implications for our design (§4)

- **The selector module is the volatile adapter at a true-external seam.** WhatsApp's DOM is a dependency we don't control and can't version. Put *all* selector knowledge behind one module interface ("give me the CSS for category X") so a WhatsApp update is a one-module change — locality — and callers (popup, worker, content script) never learn a selector.
- **Layer selectors semantic-first, class-last:** each category should try `aria-label`/`role`/structural anchors first and treat obfuscated classes as a disposable layer that history says *will* be replaced. Keeping the previous generation's selectors in the file (LukasLen's pattern) is a deliberate, evidence-backed fallback strategy — but it doubles the list that hover variants must mirror, which argues again for generating variants.
- **No MutationObserver in the interface.** The evidence says the blur module needs no DOM-watching seam at all; adding one would be depth-destroying complexity. JS listeners belong to separate, small modules (idle, commands) whose interfaces are events, not DOM queries.
- **Grill impact (publish vs personal):** a published extension inherits a public maintenance promise at WhatsApp's release cadence, with store-review latency on every fix (§2.4). A personal build can be fixed the same day, locally. This cadence is the single strongest argument in the publish-vs-personal trade-off.

---

## 5. CSS blur technique facts

Sources: MDN, web.dev, developer.chrome.com (Chromium), and the Filter Effects spec MDN links to.

### 5.1 What `filter: blur()` is

- MDN: `blur()` *"Applies a Gaussian blur to the input image"*; its `<length>` is the blur radius / standard deviation — *"how many pixels on the screen blend into each other… A value of `0` leaves the input unchanged. Percentage values are invalid."*
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/filter
- `filter` applies to all elements, is **not inherited**, and is animatable as a filter function list (so `blur(8px) → blur(0)` interpolates).
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/filter
- The Filter Effects specification (linked from MDN as the property's spec) states the group semantics: a non-`none` filter renders the element's **descendants together as a group with the filter applied to the group as a whole**, covering content, background, borders, and text of the element and its descendants — and *"The filter property has no effect on the geometry of the target element's CSS boxes"* (no layout shift).
  - https://drafts.csswg.org/filter-effects/
- Documented side effect that matters here: a non-`none` `filter` on an ancestor **creates a containing block for absolute/fixed descendants** (MDN's containing-block guide, which also notes browser inconsistencies for `filter`). Blurring a big container can therefore re-anchor `position: fixed` elements inside WhatsApp's UI.
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block

### 5.2 Performance: what official docs do and don't say

- MDN's `filter`/`blur()` pages contain **no** blur-specific performance warning (that absence is itself recorded as Unknown #9 territory — no official per-property cost figure exists in these sources).
- web.dev's animation guide *does* warn, in general terms: *"anything that involves a blur (like a shadow, for example) takes longer to paint than drawing a red box"*, advises restricting animations to `opacity` and `transform` for the compositing stage, and says to *"avoid any property that triggers layout or paint unless it's absolutely necessary"* — `filter` is **not** in web.dev's compositor-only set, so a `transition: filter` hover reveal is paint-stage work.
  - https://web.dev/articles/animations-guide
- MDN's CSS performance guide adds the area principle: browsers repaint the changed area, so *"larger animations are more costly"* — relevant to transitioning blur on a full chat panel vs a single bubble.
  - https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS
- Chromium's RenderingNG docs place filters in the compositor's **effect tree** (*"opacity, filters, masks, blend modes…"*), distinct from the cheaply-updated transform tree.
  - https://developer.chrome.com/docs/chromium/renderingng-data-structures
- Practice in the inspected code matches the cautious reading: both CSS implementations reveal with a **0.3s `transition-delay`** (not an animated filter transition) in LukasLen, while piyushraj animates `transition: filter 0.5s` — the sources contain no measurement either way; any FPS/memory number would be invented (Unknown #9).

### 5.3 `backdrop-filter` — only relevant to an overlay design

- MDN: `backdrop-filter` *"applies filter effects to the pixels painted **behind** an element, up to the nearest ancestor that is a backdrop root"*; the element's own content stays sharp. Backdrop roots include any ancestor with `filter` ≠ `none` or `opacity` < 1 — a common source of "backdrop-filter does nothing" confusion.
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
- web.dev's canonical use is a translucent overlay/modal (`backdrop-filter: blur(10px)` + semi-transparent background) — i.e. it fits a *lock-screen overlay* design, not per-message blurring, which is `filter` on the content itself.
  - https://web.dev/articles/backdrop-filter

### 5.4 Blur vs the alternatives: layout, focus, accessibility tree

| Technique | Layout (MDN) | Accessibility tree / focus / pointer events (MDN) |
|---|---|---|
| `filter: blur()` | No geometry effect (spec, §5.1); creates stacking context + containing block for fixed/absolute descendants | **No statement** on MDN's `filter`/`blur()` pages — Unknown #9 |
| `visibility: hidden` | Box invisible but *"still affects layout as normal"* | *"removes it from the accessibility tree… no longer announced by screen reading technology"*; element *"cannot receive focus"* |
| `opacity: 0` | Element still laid out | Explicitly **not** hidden: *"still part of the DOM… they still register pointer events and… do get focus"*; MDN warns opacity alone should not be used to hide from screen readers |
| `display: none` | *"no effect on layout (rendered as though the element did not exist)"* | *"removes it from the accessibility tree"* |

- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/visibility
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/opacity
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/display

#### Implications for our design (§5)

- **Privacy claims must be scoped to eyes, not machines.** On official-docs evidence, blur is a *visual* treatment. Until tested directly (not documented), the design/grill must not claim blurred content is hidden from screen readers, find-in-page, selection, or copy — a competitor-style claim like "messages completely hidden" is exactly the overclaim §2.2's "discernible protection" rule could catch if marketed absolutely. This tempers the differentiation question: the honest differentiator is *shoulder-surfing / screen-share* protection.
- **Per-element blur, not container blur.** The containing-block side effect plus web.dev's "larger animations are more costly" make the *category-element* application (LukasLen/piyushraj shape) the safer default; whole-`body` blur (LukasLen's idle mode) should be treated as a known-risk feature, tested against WhatsApp's fixed-position elements (media viewer, menus) before it enters the design.
- **Reveal mechanism has a measurable-feeling cost axis:** a `transition-delay` reveal (0.3s, no filter animation) avoids animating a paint-expensive property on large areas; an animated `transition: filter` on a whole panel is the expensive option per web.dev. If the grill chooses animated reveal, scope it to the single hovered element, not containers.
- **Depth note:** all of this lives inside the CSS module. Callers should see "blur strength per category + reveal delay" as the interface; the `filter`/`grayscale`/delay mechanics — and any future swap to a different hiding technique per category (e.g. the text-input `opacity` trick) — stay implementation details behind that seam.

---

## Unknown / not found in primary sources

1. Whether **pure CSS-only blurring** (applying `filter` by selector, without reading/extracting/storing/transmitting content) counts as "handling user data" under the Chrome Web Store User Data Policy. No official page draws the CSS-vs-reading distinction.
2. Whether a **locally stored extension preference alone** (e.g. a blur toggle in `chrome.storage`) counts as "user data." The FAQ's examples don't list one; it only establishes that *if* data is handled, local-only storage doesn't exempt disclosure/policy duties.
3. The **exact official text of the dashboard data-usage checkbox labels** — the official dashboard-privacy page shows them only in a screenshot.
4. Any **prescribed wording/template** for the dashboard's per-permission justifications. Policy requires the justifications and narrow scoping; it does not dictate text.
5. Any **WhatsApp/Meta-specific naming guidance** — whether "…for WhatsApp" phrasing or any WhatsApp imagery is acceptable in a name/icon. The official branding page's "for / for use with / compatible with" rule covers **Google trademarks only**.
6. The **exact install-warning wording for a single-site host/content-script match** in developer.chrome.com *text* (shown only as a screenshot in the tutorial), and any general Web Store ban on modifying a third-party site's UI / reading its DOM, or any rule making violation of the *target site's own ToS* a Web Store offence. (Chromium's security FAQ illustrates the warning pattern with a google.com example — §1.4.)
7. Whether the MV3 **remote-code policy** treats remotely fetched *CSS/selectors* as prohibited logic — the program-policy page doesn't include the CSS carve-out; only the migration doc says remotely hosted code "does not include data or things like JSON or CSS."
8. Any **first-party (Meta/WhatsApp) DOM contract, selector stability commitment, or developer guidance** for web.whatsapp.com. None was found; all stability evidence is from extension repos reacting after the fact.
9. **Quantified performance cost** of `filter: blur()` (per-element or large-container) and of `transition: filter`, and any MDN/web.dev statement on whether blurred text remains **selectable, copyable, findable, or screen-reader-exposed**. Official docs consulted are silent on all of these.
10. Whether WhatsApp Web surfaces **not** covered by the inspected implementations (calls UI, Status viewer internals beyond the CSS-covered gallery, Communities) need JavaScript observation rather than CSS. No inspected codebase demonstrates it either way.
11. The origin of the name "LukasHechenberger" in the original brief — the original extension's repo, README, and LICENSE all name **Lukas Lenhardt**; no primary source connects any "Hechenberger" to this project.
12. **WA Web Plus's** selectors, blur method, hover implementation, license, and selector-fix history — no official public source repository was found (§3.4), and the same applies to the **TECHNICAL DOST BlurChat** store extension.
13. Piyushraj project's **license** — no LICENSE file in the repo and no license field in its manifest.
14. Current **Chrome Web Store developer registration fee amount** — the official registration page states a one-time fee must be paid but does not state the amount on the page read.
    - https://developer.chrome.com/docs/webstore/register

---

## Source index (primary sources actually opened)

- Chrome platform docs: content-scripts (concepts + manifest reference), match patterns, storage API (+ StorageArea), commands API, respond-to-commands, permissions list, declare-permissions, manifest reference, service-worker basics/lifecycle, runtime API — all at `developer.chrome.com/docs/extensions/…` (URLs inline above).
- Store policy: program policies (single page), quality guidelines + FAQ, user data FAQ, impersonation & IP, ads, branding, dashboard privacy, troubleshooting, register — all at `developer.chrome.com/docs/webstore/…` (URLs inline above); remote-hosted-code migration doc at `developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code`.
- Code: `github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web` (manifest, contentScript.js, background.js, all category CSS, LICENSE, commits `20c4729` / `33d6d9f` / `b0fddcd`, issues), `github.com/piyushraj2340/Whatsapp-Privacy-Extension` (manifest, privacy.js, popup, commit `14b30c6`), `github.com/i-naeem/blurchat` (manifest, blur.css, background.js), `github.com/aryomuzakki/privacy-whatsapp-web-auto-blur` (repo/README level), plus `addons.mozilla.org` version history for the LukasLen codebase.
- CSS: MDN `filter`, `backdrop-filter`, `visibility`, `opacity`, `display`, `pointer-events`, containing-block guide, CSS performance guide; web.dev animation guide + backdrop-filter article; Chromium RenderingNG data structures; Filter Effects Module spec (`drafts.csswg.org/filter-effects/`).
