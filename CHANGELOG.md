# Changelog

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
