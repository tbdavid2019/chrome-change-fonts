# Changelog

## 2.2.0 - 2026-11-25

- **Curated Cloud Google Fonts with On-Demand CDN Loading (`extension/shared.js`, `extension/content.js`, `extension/popup.js`, `extension/options.js`)**:
  - Added 10 curated coding and high-legibility Google Fonts (`JetBrains Mono`, `Fira Code`, `Google Sans Code`, `Geist Mono`, `Source Code Pro`, `Intel One Mono`, `Lilex`, `Atkinson Hyperlegible Mono`, `Atkinson Hyperlegible`, and `Anonymous Pro`) under a dedicated `Cloud Fonts (Google Fonts · On-Demand)` `<optgroup>` in both `Single font` and `CJK / Latin split` (Non-CJK) selectors as well as the Site Rules Manager (`options.html`), requiring zero new manifest permissions.
  - Added `selectedFontId` and `gf:*` resolution (`resolveCloudGoogleFont`) so explicit local system font selections (even sharing a family name like `JetBrains Mono`) never make external network requests, while cloud selections work across OSes without triggering `{font} (Not installed on this device)` warnings.
  - Added `syncCloudFontLink` / `removeCloudFontLinks` in `content.js` (including Document PiP windows) and `syncPopupCloudFontLink` in `popup.js` to inject `<link rel="stylesheet" referrerpolicy="no-referrer">` strictly on demand and remove it cleanly on switch/disable/teardown; updated `watchSingleStylesheetLink` and `handleStylesheetOrFontLoaded` to ignore extension-injected cloud font links/faces and avoid redundant icon rescans.
  - Updated `getFontStack` and `buildFontFaceCss` / `triggerLocalSlotProbesIfNeeded` so `CJK / Latin split` mode pairs `FontChangerCjk` directly with the selected Google Font family without local slot probing.
  - Bumped extension version to `2.2.0` in `extension/manifest.json` and updated `PRIVACY_POLICY.md`, `readme.md`, and test suites (`tests/shared.test.js`, `tests/content.test.js`, `tests/popup.test.js`, `tests/options.test.js`, `tests/font-rendering.test.js`).

## 2.1.2 - 2026-11-23

- **Fix Critical Chrome CPU & RAM Exhaustion Bugs (`extension/content.js`, `extension/shared.js`, `extension/background.js`)**:
  - **Eliminated full-document `sheet.disabled` style thrashing on ordinary text & animations**: Replaced `shouldCheckLongHostText` with strict `shouldCheckHostText` (immediately skipping non-ASCII/CJK prose, `<code>`/`<pre>`/`<kbd>`/`<samp>` descendants without icon hints, prose/control block tags, and punctuated prose runs while preserving PUA, ASCII ligatures, and inline Wingdings runs), narrowed `STYLE_FONT_OR_VAR_REGEX` to font/icon custom properties (`--scroll-y`, `--tw-*`, `--radix-*`, `transform`, `opacity` no longer trigger rescans or candidate probing), reordered initial `performActivePass` / `activatePipDocument` to scan unpolluted styles before attaching rules sheets (`0` boot toggles), and scoped `setDocSheetsDisabled` strictly to the target `Document` + its shared shadow sheet.
  - **Eliminated unbounded `MutationRecord` queue & `removedNodes` memory retention**: Replaced the raw `MutationRecord` queue and `setTimeout(flush, 0)` slice loop in `createDebouncedMutationObserver` with synchronous target extraction into deduplicated per-observer `Set`/`Map` collections (capped at `2,500` targets with single-pass overflow rescan), releasing detached `removedNodes` subtrees and `oldValue` strings immediately for GC.
  - **Shared single `CSSStyleSheet` across all `ShadowRoot`s per document**: Added `docShadowSheetMap` so pages with hundreds or thousands of open `ShadowRoot`s (e.g. YouTube, Lit/Polymer apps) share 1 `CSSStyleSheet` instance instead of N duplicate CSSOM sheets, reducing shadow `sheet.disabled` toggles to `O(1)` and throttling `WeakRef` shadow pruning (`2000ms`).
  - **Stopped CJK WebFont `unicode-range` subset cascade & synchronous `<link>` rescans**: Added `faceOverlapsIconRelevantRange` so non-ASCII/non-PUA `loadingdone` font subsets (e.g. 100+ `Noto Sans TC` slices) neither wipe `ligatureRatioCache` nor trigger full-DOM rescans, and coalesced `<link rel="stylesheet">` / `window` `load` events via `scheduleDebouncedFullRescan()`.
  - **Bounded `ligatureRatioCache` & skipped pure-digit Canvas shaping**: Added `512`-entry `O(1)` LRU eviction to `ligatureRatioCache` and skipped Canvas `measureText` on pure-digit strings (`/^\d+$/`).
  - **Memoized font helpers, cross-frame session slot cache & empty `about:blank` guard**: Memoized `buildNonCjkUnicodeRange`, `buildLocalFontCandidates`, and `formatLocalSrcList`, deduplicated concurrent `probeLocalFontSlots` calls with normalized cache keys and bounded 128-entry caller caches, added a bounded 128-entry volatile session cache in `background.js` (`getCachedFontSlots` / `setCachedFontSlots`, strictly bypassed for Incognito tabs/frames) with a `150ms` fallback timeout so multi-iframe pages avoid repeated `FontFace.load()` storms, and deferred slot probing in empty non-top `about:blank` tracking subframes until content arrives.
  - **Lifecycle & icon edge-case hardening**: Restored existing `ShadowRoot` observers and icon classification across `deactivate() -> activate()` transitions, released strong `root` closure references in `WeakRef`-backed `ShadowRoot` observers, fixed dynamic `<link rel="stylesheet">` `MutationObserver` binding and `<link>` `'load'` listener cleanup on teardown, bound `pipDoc.fonts` `'loadingdone'` on Document PiP windows, skipped `::before`/`::after` style reads on unattributed `<p>`/`<code>`/`<pre>` prose nodes, and preserved single-character ASCII/Dingbat symbol icons (`x`, `✕`, `✓`, `★`).
  - **Added dedicated stress & regression suite (`tests/performance.test.js`)**: Verified zero thrashing under AI text streaming, 60fps animations + `--scroll-y`, 2,500-mutation bursts, 500 `ShadowRoot`s, 100 CJK font subsets, and `<pre><code>` token storms + LRU cache eviction.

## 2.1.1 - 2026-11-23

- **Fix Gemini / SPA `loadingdone` infinite loop in `CJK / Latin split` mode (`extension/content.js`)**:
  - Separated `@font-face` declarations (`FontChangerCjk` / `FontChangerLatin`) into a dedicated, permanently-enabled `CSSStyleSheet` (`fontFaceSheet`) in `document.adoptedStyleSheets` (and fallback `<style>`) so `setActiveSheetsDisabled(true/false)` during icon probing only toggles selector rules and never unregisters/re-registers extension `@font-face`s or fires synthetic `document.fonts` `loadingdone` events.
  - Updated `handleStylesheetOrFontLoaded` to ignore `loadingdone` batches containing only extension-owned (`FontChangerCjk`, `FontChangerLatin`, `__fc_probe`) or already-seen `FontFace`s before touching `pendingTimeoutTimer` or re-scanning, and replaced global `pendingFontDeadline` resets with a per-element `pendingDeadlineMap` so pending elements converge reliably within `500ms`.
  - Allowed `evaluatePseudo` and `computeElementClassification` to fall through to Signal 2/3 icon protection (`Google Symbols`, `Luminous Symbols`, etc.) once an element's pending hold expires, preventing unused unloaded font subsets from stripping icon protection.
  - Guarded `triggerLocalSlotProbesIfNeeded` so async slot probing never attaches stylesheets prematurely before `performActivePass()` completes the initial `DOMContentLoaded` / `120ms` hold.

## 2.1.0 - 2026-11-22

- **Per-Site Custom Fonts (`siteFont:<host>`)**:
  - Added per-site font override support in both `Single font` and `CJK / Latin split` modes via the new scope switcher (`Global default` / `This site only`) in `extension/popup.html` / `extension/popup.js` and `extension/content.js`, with keyboard arrow navigation, draft/saved mode isolation, per-tab volatile Incognito overrides (`background.js` + `SET_TAB_SITE_FONT`) surviving reloads/subframes, and site-exclusion priority.
- **Chrome Icon `OFF` Badge (`extension/background.js`)**:
  - Added a lightweight MV3 service worker (`extension/background.js`) with zero new permissions; top-frame `content.js` (including bfcache `pageshow` restores) and `popup.js` sync `OFF` badge status (`#a9471d` background, `#ffffff` text) onto the Chrome toolbar icon whenever the active site is excluded (`siteDisabled:*` or Incognito tab override).
- **Site Rules & Exclusions Management Page (`extension/options.html`, `extension/options.js`)**:
  - Added a dedicated management page (`options_ui` with `open_in_tab: true`, reachable from `Site list` in the popup) to search, add, edit (including `host:port` / IPv6 keys, race-safe rename cleanup, and unavailable font ID preservation across locale switches), remove, and clear all excluded sites (`siteDisabled:*`) and per-site custom font rules (`siteFont:*`), with live `chrome.storage.onChanged` synchronization and sync quota reporting.
- **Feedback Link (`https://david888.com/contact`)**:
  - Added direct `Feedback` links/buttons in both the popup footer and the Site Rules Manager header routing to `https://david888.com/contact`.
- **Popup Layout & CPU/Style-Recalc Fixes (folded from 2.0.1)**:
  - Removed redundant description/help text inside the `CJK / Latin split` panel and tightened spacing so the popup stays comfortably within Chrome's 600px height limit.
  - Bounded attribute mutation subtree scanning, added read-only pre-filtering before `sheet.disabled` toggling, single-pass `document.fonts` indexing, `unicode-range`-filtered WebFont probing, per-face `loadingdone` deduplication, and `ownerDocument`-grouped pending retries.

## 2.0.0 - 2026-11-20

- **Packaging isolation & zero-build shared core (`extension/` & `tests/`)**:
  - Moved all runtime files (`manifest.json`, `shared.js`, `content.js`, `popup.html`, `popup.js`, `images/icon{16,48,128}.png`) into `extension/`, tests into `tests/`, and unreferenced SVG assets into `assets/`, removing `index.html` and web-preview dead code while preserving zero build steps and zero new Chrome permissions.
  - Extracted `extension/shared.js` as a classic IIFE library shared by `popup.js`, `content.js`, and tests; `ensureContentScript` now reads `content_scripts[0].js` directly from `manifest.json`.
- **Unpolluted Three-Signal Icon Protection Pipeline**:
  - Replaced `EXCLUDE_CLASSES` blacklists, English icon word lists, unguarded snake-case matching, and forced `'Google Symbols' !important` overrides with `adoptedStyleSheets` (`sheet.disabled = true/false`) unpolluted computed-style probing, `DOMContentLoaded` + `120ms` initial hold, lazy `@font-face` `data-fc-pending` + `face.load()` holding, and `loadingdone`/`<link>` re-evaluation.
  - Combined three non-poisoning signals: Signal 1 (PUA characters cleanly separated between host vs `::before`/`::after` pseudo elements), Signal 2 (validated icon font keyword Set + PUA-only `FontFace`s with ASCII `text-transform: none !important` ligature protection), and Signal 3 (Canvas 2D ZWNJ width-collapse ratio `< 0.85` against `monospace`), fixing Google Fonts/Meet/Play, Outlook Fluent/Fabric icons, and preserving `auto_machine` / `u_uuuu_uuuu` underscore words.
- **Lifecycle, Memory Leak Fixes & Document PiP**:
  - Added versioned singleton controller cleanup across re-injections, invalidated `chrome.runtime.id` self-teardown, `v1.8.8` legacy attribute/`<style.font-changer-style>` cleanup, synchronous `onMessage` (`return undefined`), and a Dormant/Active state machine with zero active observers when disabled or excluded.
  - Separated `trackedPipDocuments` from `WeakRef`-backed `WeakMap` `ShadowRoot` tracking, pruned detached hosts and closed-PiP sub-roots, unified debounced mutation observation, recursively copied `@font-face` rules into PiP safely, and fixed `querySelector` unescaped URL injection and cross-realm `CSSStyleSheet` creation.
- **Split Mode (`CJK / Latin`) & Synced Site Exclusions**:
  - Expanded `CJK_UNICODE_RANGE` to include Japanese Hiragana/Katakana and Korean Hangul while maintaining strict bilateral isolation (no fallback to `basicFont` when both split selects are empty).
  - Removed hardcoded personal font names and `chrome.storage.local` probe caches; implemented in-memory 3-slot (`bold`, `italic`, `boldItalic`) `FontFace.load()` probing per context with `>= 3` ASCII prefix extraction (`777jf金萱` preserved, `"思源黑體 TW"` unmangled).
  - Migrated per-site disable switches lazily on non-Incognito top frames into `chrome.storage.sync` (`siteDisabled:<host>`), enforced multi-hop cross-origin iframe union disables via `location.ancestorOrigins`, and isolated Incognito tabs to zero storage writes with all-frame in-memory overrides.
  - Made popup startup strictly read-only, preserved unavailable cross-OS synced fonts across language switches, fixed `localhost` badge/tooltips and semantic status colors, and added quota/`lastError` rollback UI.

## 1.8.8 - 2026-10-24

- Fixed mixed fonts on Disp BBS and similar pages: adjacent surrogate escapes in the Unicode PUA regex formed an unintended range that matched `--`, fullwidth slashes, supplementary Han, emoji, and other ordinary text. Match only the three actual private-use blocks.
- Prevented a short direct text node from excluding an entire article container and its descendants. Leaf elements are checked using their complete text, preserving real ligature and PUA icons.
- Added exhaustive Unicode classification checks and a Chrome DevTools regression test that checks actual platform fonts for BBS text, colored spans, preformatted text, CJK punctuation, bold/italic text, and dynamic additions. All new regressions fail against 1.8.7.

## 1.8.7 - 2026-10-23

- Fixed bold text losing its weight with restricted local fonts: use `font-weight: auto` instead of declaring every selected face supports weights 100–900. Updated both page rendering and popup preview.
- Added a headless Chrome rendering regression test that loads a local font and checks bold and italic pixels differ from normal text. The browser test skips when Chrome/Chromium is unavailable.

## 1.8.6 - 2026-10-23

- Restricted both selected fonts in CJK / Latin split mode with complementary `unicode-range` font faces. Removed unrestricted font-family fallbacks so missing Latin glyphs cannot fall back to the selected CJK font, and merged Latin fonts cannot take over CJK text.
- Routed fullwidth Latin letters and digits to the non-CJK font while preserving CJK punctuation and the original page text. Fullwidth characters retain their original character widths.
- Matched popup preview font faces and fallback order to page rendering, with regression tests for Unicode coverage, one-font configurations, and preview parity.

## 1.8.5 - 2026-10-23

- Improved icon stylesheet scanning to ignore extension-owned styles and avoid excluding ancestor classes from font replacement.
- Targeted page-state and site-disable messages at the main frame, and corrected the system-default font selection behavior.
- Trimmed local font name candidates and guarded shadow-root scanning against missing roots.

## 1.8.4 - 2026-10-23

- Fixed CJK / Latin split mode (`CJK / 英數分開`) failure and tab injection errors:
  - **Fixed `@font-face` `local()` CJK font resolution**: Expanded `buildLocalFontSources` in `content.js` and `popup.js` to include PostScript and Full Font Name candidates (e.g. `-Regular`, `-Medium`, `半糖`, ASCII prefix variants like `777jf-Medium`), preventing Chromium on macOS from failing to match CJK fonts by family name alone and falling through to merged non-CJK fonts (such as `777monolisa Regular 繁中`).
  - **Expanded `CJK_UNICODE_RANGE`**: Added `U+FE30-FE4F` and `U+FF00-FFEF` so fullwidth CJK punctuation (`，`, `。`, `！`, `？`, `（`, `）`) consistently uses the CJK font.
  - **Fixed `changeFont` message response & re-injection**: Added `sendResponse({ ok: true })` to `chrome.runtime.onMessage` in `content.js`, made `content.js` idempotent across re-injections (`var` top-level bindings and existing `style.font-changer-style` reuse), deduplicated concurrent `ensureContentScript` calls in `popup.js`, and added a main-frame fallback when `allFrames: true` encounters cross-origin iframes (such as embedded YouTube players on `music.david888.com`).

## 1.8.3 - 2026-10-23

- Fixed Google icons and general icon font display failures across Google properties (Google Search, Gmail, YouTube, Google Drive, Docs, Calendar) and web apps:
  - **Fixed MutationObserver batch dropping**: Resolved a critical debounce bug where rapid successive mutation batches reset the timeout and permanently discarded earlier batches, causing up to 90% of dynamic nodes during page load or infinite scroll to miss icon scanning. Now accumulates mutations in `pendingMutations` queue with concurrency-safe `splice(0)` snapshots and 250ms max-wait throttle.
  - **Added `isGoogleSite()` detection**: Accurately recognizes Google and YouTube domains with strict suffix boundaries to reliably identify icon elements while strictly preserving font replacement for regular UI navigation text (e.g. "Inbox", "History", "Settings").
  - **Expanded CSS exclusions in `EXCLUDE_CLASSES`**: Added `.z1asCe`, `[class*="z1asCe"]` (Google Search icons), `[class*="notranslate"]`, `[translate="no"]`, `svg`, `svg *`, `g-icon`, `yt-icon`, `iron-icon`, and `mwc-icon`, safeguarding icons at the CSS level before script execution.
  - **Fixed `isIconContext` heuristics**: Handled `SVGAnimatedString` classNames on SVG elements, checked parent `notranslate` / `translate="no"` / `aria-hidden="true"`, and detected Google Material 3 (`VfPpkd-*`) and `[jsname]` elements.
  - **Added Unicode Private Use Area (PUA) icon support**: Added detection for PUA ranges (`U+E000`–`U+F8FF`, `U+F0000`–`U+FFFFD`, `U+100000`–`U+10FFFD`) so icon fonts using codepoint glyphs (e.g. Material Icons codepoints, Font Awesome) are never replaced by standard fonts that lack PUA glyphs, preventing broken missing-glyph boxes `[?]` or blank spaces.
  - **Fixed container poisoning in `INTERACTIVE_EXCLUDE_SELECTOR`**: Removed `[jsaction]`, `[aria-haspopup]`, `[aria-expanded]`, and `[data-tooltip]` which previously caused entire search result cards, toolbars, and layout wrappers to be marked as excluded. Implemented `shouldExcludeInteractiveAncestor` so buttons containing both an icon and a text label (e.g. `<button><i>search</i> 搜尋</button>`) keep the custom font on the text label while protecting the icon.
  - **Expanded `SINGLE_WORD_ICON_NAMES`**: Added missing Google Workspace single-word icons including `history`, `inbox`, `archive`, `undo`, `redo`, `event`, `today`, `dashboard`, `description`, `palette`, `camera`, `photo`, `video`, `music`, `directions`, `place`, etc.
  - **Nested CSSOM rule traversal**: Enhanced `scanStylesheets` to recursively traverse nested grouping rules (`@media`, `@supports`, `@layer`) and added `octicon` and `entypo` detection.
  - **Page lifecycle sweep**: Added `DOMContentLoaded` and `load` listeners to perform complete icon and stylesheet sweeps once streaming/loading concludes.

- Redesigned visual styles to align with `david888.com` and `2md.aiurl.tw` signature design system:
  - Adopted the five base colors: Golden Saffron (`#ffb010`), Deep Navy Blue (`#17324d`), Warm Cream (`#fff9e8`), Warm Canvas (`#fff0cc`), and Ink (`#2b251a`), with terracotta clay (`#a9471d`) accents.
  - Added Deep Navy Command Center Dark Mode (`#0c1927` canvas, `#13273c` card surface, `#ffb010` saffron accents).
  - Added signature `333` golden brand badge in header.
- Enforced strict WCAG 2.1 AA / AAA accessibility & typography standards:
  - Audited and calibrated typography scales: eliminated cramped sub-12px Chinese text, raising panel descriptions, helps, hints, and badges to >= `12px` to prevent complex CJK character strokes from blurring.
  - Standardized font sizing: headings (`17.5px` / `18.5px`), mode tabs (`13px` / `13.5px`), labels (`13px` / `13.5px`), selects (`13.5px` / `14px`), status (`12.5px` / `13px`), preview input (`17px` / `16px`).
  - Contrast ratios for primary text exceed AAA standards (14.6:1 in light mode, 14.4:1 in dark mode).
  - High-visibility keyboard focus rings with prominent offsets (`2px` solid `#17324d` in light, `#ffb010` in dark).
  - UI control borders verified to meet WCAG 1.4.11 non-text contrast requirement (>= 3.0:1) in both light and dark modes.
  - Saffron backgrounds strictly enforce deep dark text (`#0f2337` / `#2b251a`) to eliminate common yellow/amber low-contrast accessibility failures.
- Added comprehensive Web version (`網頁版`) support alongside Chrome Extension mode:
  - Added standalone `index.html` entry point for web preview, testing, and deployment.
  - Implemented responsive bento layout: automatically fits 360px popup in Chrome Extension while expanding to an elegant centered container on wider web screens.
  - Added environment-safe storage abstraction in `popup.js` (`appStorage`), transparently using `chrome.storage.sync` in extension mode and `localStorage` in standalone web mode.
  - Added multi-tier font discovery: utilizes `chrome.fontSettings` when in extension, modern `window.queryLocalFonts()` API when supported in web browsers, and a rich curated Traditional Chinese/system font fallback.
  - Prevented runtime errors when extension APIs (`chrome.tabs`, `chrome.scripting`) are not present in standard web contexts.


## 1.8.2 - 2026-09-23

- Preserved broad underscore-based ligature icon detection while keeping code identifiers in code blocks eligible for custom font replacement.

## 1.8.1 - 2026-09-21

- Fixed Google Play Store (`play.google.com`) icons (`devices`, `family_home`, `expand_more`, `arrow_forward`, `search`, `help_outline`, `play_apps`, etc.) turning into plain or uppercase text strings.
- Fixed `google_logo Play` branding text in Google Play Store navbar header: detected `google_logo` ligature text, excluded it from custom font override, and preserved Google Sans / Product Sans font stack.
- Differentiated icon font stacks by family: prioritized `Google Material Icons` and `Material Icons Extended` on Google Play Store and for `[class*="google-material"]` selectors, preventing subsetted `Google Symbols` font from shadowing material icon glyphs.
- Enforced `text-transform: none !important` on icon elements and ligature attributes so parent button uppercase transforms (`.VfPpkd-LgbsSe`, `.VfPpkd-AznF2e`) do not break case-sensitive OpenType ligatures.
- Expanded `SINGLE_WORD_ICON_NAMES` to include `devices`, `device`, `tablet`, `apps`, `reviews`, `payment`, `redeem`, `badge`, `verified`, `expand`, `collapse`, `navigate`, `chevron`, `arrow`, `install`, `update`, `public`.

## 1.8.0 - 2026-09-18

- Fixed Google Meet control icons (`mic`, `videocam`, `center_focus_weak`, `more_vert`, `call_end`, `chat`, `domain_disabled`, etc.) turning into plain text strings.
- Enforced valid CSS `font-family: 'Google Symbols', 'Material Symbols Outlined', 'Google Material Icons', 'Material Icons' !important` specifically on icon elements, strictly avoiding CSS-wide keywords (`inherit`) in family lists to ensure Chromium CSSOM acceptance.
- Protected Google Meet buttons and interactive containers in selector exclusions without forcing icon fonts onto normal button text (e.g. "Present", "Leave call").
- Added automatic sharing and copying of font resources (`@font-face` rules, Google Fonts stylesheets, and `FontFace` objects) into Document Picture-in-Picture (PiP) windows, with initialization-only lifecycle guards and `shouldApplyCustomFont` checks to avoid redundant overhead on minor mutations.
- Added normalization for zero-width characters (`\u200B`, `\uFEFF`) and bidi isolate marks (`\u200E`, `\u200F`, `\u2066`–`\u2069`) in ligature text detection.
- Fixed marker cleanup so when an icon's text transitions back to normal text, `data-font-changer-ligature-icon` and `data-font-changer-exclude` are properly removed from the element and its ancestor.
- Expanded `SINGLE_WORD_ICON_NAMES` and interactive button selectors for Google web applications.

## 1.7.9 - 2026-07-21

- Improved compatibility with Google Meet's Picture-in-Picture (PiP) window, preventing control buttons (like `mic`, `videocam_off`, `call_end`) from rendering as fallback text.
- Fixed icon font rendering issues on Claude.ai and other modern sites by implementing a dynamic stylesheet scanning mechanism (`scanStylesheets`) that automatically detects and excludes custom web icon fonts.
- Expanded the default `EXCLUDE_CLASSES` to include case-insensitive matches for popular icon libraries (e.g. Lucide, Feather, FontAwesome, Remix Icon, Boxicons, Tabler Icons, etc.).
- Enhanced single-word ligature icon detection to cover common icons without underscores (such as `mic`, `search`, `home`, `settings`).
- Resolved cross-realm element verification bugs inside iframe and Picture-in-Picture window contexts.

## 1.7.8 - 2026-06-11

- Fixed `CJK / 英數分開` mode so CJK text still falls back to the selected CJK font when Chrome cannot resolve the generated `local()` font-face alias.
- Kept the non-CJK font before the direct CJK fallback, so English and numbers continue to use the non-CJK selector while CJK characters use the selected CJK font.

## 1.7.7 - 2026-06-10

- Merged the popup title and `EN/中` language toggle into a single header row so they no longer waste two separate lines.
- Tightened popup spacing and shortened the advanced split helper copy to reduce vertical overflow.
- Reduced preview textarea height specifically in `CJK / 英數分開` mode so the popup is less likely to show a vertical scrollbar.

## 1.7.6 - 2026-06-09

- Removed the popup header description text to free vertical space for the font mode tabs and settings controls.

## 1.7.5 - 2026-06-09

- Renamed the user-facing advanced mode copy to `CJK / Latin split` in English and `CJK / 英數分開` in Traditional Chinese, making the feature purpose clearer at a glance.
- Clarified that CJK means Chinese, Japanese, and Korean in popup labels and documentation instead of implying the mode is only for Chinese text.
- Updated README wording to use `CJK（中日韓）` and non-CJK/Latin terminology consistently.

## 1.7.4 - 2026-06-09

- Fixed CJK font matching in advanced split mode by saving the selected font's `fontId` alongside its display name.
- Generated CJK `@font-face` rules now try both `local(displayName)` and `local(fontId)`, which is more reliable for locally installed fonts whose display name does not match the internal face name Chrome expects.
- Kept non-CJK font handling as a direct `font-family` stack entry so English and number rendering continues to match single-font mode.

## 1.7.3 - 2026-06-09

- Added a mutually exclusive `basic` / `advanced` font mode model so single-font settings and split CJK/non-CJK settings can coexist without overriding each other.
- Added internal `Single font` / `Advanced split` tabs in the popup, making the active mode clear without duplicating advanced controls.
- Added separate advanced selectors for `Chinese / CJK` and `Non-CJK / English / numbers / punctuation`.
- Applied the non-CJK font directly in the generated `font-family` stack, matching the behavior that already works in single-font mode.
- Kept `@font-face` and `unicode-range` only for the CJK font, so CJK characters use the CJK selector while English, numbers, and other non-CJK text fall through to the directly named non-CJK font.
- Added regression tests that verify advanced CSS generation and ensure basic mode still wins when advanced settings are stored but not active.

## 1.6.4 - 2026-06-05

- Fixed Material Symbols ligature icons being overridden on sites such as Google Search Central Blog, which caused strings like `arrow_drop_down` to render as plain text after font replacement.
- Added a targeted exclusion for Google DevSite's `.devsite-nav-toggle` sidebar control, whose expand/collapse icon is rendered through CSS rather than a visible DOM text node.
- Added fallback detection for standalone ligature icon text and excluded its nearest interactive control from font replacement, while restoring the broader icon selector behavior to its previous scope.
- Added regression tests for Google DevSite sidebar toggles, ligature text fallback handling, and the absence of broad `.icon *` descendant exclusions.
- Renamed the extension and popup copy to `Website Font Changer 333` / `改字體 333` for clearer English wording and consistent `333` branding across your extensions.

## 1.6.3 - 2026-06-03

- Refreshed the extension icon with a new `字` and `F` design, exported to the 16px, 48px, and 128px PNG assets used by Chrome.
- Improved the popup preview text by replacing placeholder pangrams with randomized bilingual Tagore excerpts.
- Enlarged the popup and preview text area so longer Chinese and English preview samples are easier to inspect.
- Removed the footer hint text to keep the popup focused on font selection and live preview.

## 1.6.2 - 2026-05-18

- Fixed icon font breakage on sites that rely on custom glyph fonts, including Google Maps, Telegram Web, and 104 招募管理.
- Expanded the exclusion selector list for icon-related classes such as `google-symbols`, `icon`, `iconfont`, `arrow-icon`, and common `icon-*` naming patterns.
- Added regression tests to ensure generated CSS preserves those icon selectors while still overriding normal text content.

## 1.6.0 - 2026-05-15

- Switched page font replacement from inheritance-heavy selectors to direct nested coverage like `body *` and `:host *`, improving results on apps such as Microsoft Teams.
- Preserved icon-class exclusions so icon fonts are less likely to break while text elements are overridden more aggressively.
- Added a small Node regression test to verify generated selectors for normal documents and shadow roots.
- Added a per-site toggle stored in the page's `localStorage`, so specific websites can opt out of font replacement without changing the global setting.

## 1.4 - 2026-04-06

- Added `scripting` fallback injection so already-open tabs can receive the font changer without a manual reload.
- Moved content script startup to `document_start` so font overrides land earlier in the page lifecycle.
- Extended font style syncing to open shadow DOM and dynamically added content, improving coverage on component-based sites.
- Improved popup error messaging for browser-internal and other restricted pages that extensions cannot modify.

## 1.3 - 2026-03-31

- Fixed font application by using `displayName` instead of `fontId` as the CSS `font-family` value.
- Added backward compatibility for users who already had a saved `fontId` in storage.
- Expanded style injection coverage to `html`, form controls, and additional frames.
- Added `chrome.storage.onChanged` handling so active pages react more reliably to setting changes.
- Updated `README.md` with troubleshooting notes, installation reminders, and verification guidance.
