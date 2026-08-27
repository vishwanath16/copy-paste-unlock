# Copy-Paste Unlock

A small Chrome extension that re-enables copy, cut, paste, right-click, and
text selection on pages that try to block them (common on some banking-style
number-entry fields, "protected" articles, etc.).

## How it works
- **Disabled by default.** Click the extension icon and flip the toggle on
  to activate it. Toggling reloads your current tab so the change applies.
- When enabled, on every page it:
  - Blocks pages from registering `copy` / `cut` / `paste` / `contextmenu` /
    `selectstart` / `dragstart` event listeners.
  - Neutralizes inline handlers like `onpaste="return false"`.
  - Forces `user-select: text` via injected CSS so text stays selectable.
  - Runs at `document_start`, so it wins the race against the page's own
    blocking scripts.
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
  doesn't catch yet (e.g. via a Flash/plugin, or intercepting at the OS
  clipboard level) — let me know the site and I can adjust the script.
- This only affects your own browser's handling of the page; it doesn't
  bypass server-side validation, so if a field also rejects pasted values on
  submit, that's a separate check.
