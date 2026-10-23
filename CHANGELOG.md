# Changelog

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
