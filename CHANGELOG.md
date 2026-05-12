# Changelog

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
