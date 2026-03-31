# Changelog

## 1.3 - 2026-03-31

- Fixed font application by using `displayName` instead of `fontId` as the CSS `font-family` value.
- Added backward compatibility for users who already had a saved `fontId` in storage.
- Expanded style injection coverage to `html`, form controls, and additional frames.
- Added `chrome.storage.onChanged` handling so active pages react more reliably to setting changes.
- Updated `README.md` with troubleshooting notes, installation reminders, and verification guidance.
