# Changelog

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
