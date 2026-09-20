# Copy-Paste Unlock

A small Chrome extension that re-enables copy, cut, paste, right-click, and
text selection on pages that try to block them (common on some banking-style
number-entry fields, "protected" articles, etc.).

## How it works
- **Disabled by default.** Click the extension icon and flip the toggle on
  to activate it. Toggling reloads your current tab so the change applies.
- When enabled, on every page it:
  - Wraps (never removes) `copy` / `cut` / `paste` / `contextmenu` /
    `selectstart` / `dragstart` / `mousedown` / `keydown` listeners and takes
    away only their ability to call `preventDefault()` — and only when the
    listener looks like a blocker rather than a real handler.
  - Neutralizes inline handlers like `onpaste="return false"`.
  - Forces `user-select: text` via injected CSS so text stays selectable
    (elements marked `draggable="true"` are left alone so drag & drop works).
- A listener is treated as a blocker when its entire body is
  `preventDefault` / `stopPropagation` / `return false`, or when it is
  registered on `window` / `document` / `<html>` / `<body>` and blocks the
  event without ever reading the `clipboardData` (or `dataTransfer`) it was
  handed. Anything that actually reads the payload — the way WhatsApp Web,
  ChatGPT or Claude read a pasted image — is left completely alone.
  `keydown` is only touched for Ctrl/Cmd + C/V/X/A outside of editable
  fields, so app shortcuts like Enter-to-send keep working.
- The patch script is registered as a `MAIN` world content script by the
  background service worker while the toggle is on, so it runs at
  `document_start` before the page's own scripts, and is not affected by the
  page's Content-Security-Policy.
- The on/off state is stored via `chrome.storage.local` and applies across
  all tabs and sites until you turn it off again.

## Install (Developer Mode — unpacked)
1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension from this folder).
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Select this folder (`copy-paste-unlock`).
6. Done — it runs automatically on every page. Click the extension icon any
   time to confirm it's active on the current tab.

## Notes
- If a specific site still blocks paste, it's likely doing it in a way this
  doesn't catch yet (e.g. intercepting at the OS clipboard level, or a
  handler that reads `clipboardData` purely as a decoy) — let me know the
  site and I can adjust the script.
- Sites that overwrite your clipboard on copy (`clipboardData.setData` with
  a "read more at ..." string) are deliberately left alone: that is
  indistinguishable from the rich-text copy real apps do.
- This only affects your own browser's handling of the page; it doesn't
  bypass server-side validation, so if a field also rejects pasted values on
  submit, that's a separate check.
