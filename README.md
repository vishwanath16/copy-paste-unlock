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
  - Removes inline handlers like `onpaste="return false"`, and removes
    `onkeydown` / `onmousedown` / `ondrop` attributes too when their inline
    source is just a blocker (e.g.
    `onkeydown="if(event.ctrlKey&&event.keyCode==86)return false"`).
  - Forces `user-select: text` via injected CSS so text stays selectable
    (elements marked `draggable="true"` are left alone so drag & drop works).
- For `copy` / `cut` / `paste` / `dragstart`, wherever the listener sits, the
  test is: **did it read the payload?** A listener that blocks the event
  without ever touching `clipboardData` / `dataTransfer` is a blocker and is
  overruled. Anything that actually reads the payload — the way WhatsApp Web,
  ChatGPT or Claude read a pasted image — is left completely alone. This is
  what catches the common
  `$("#field").on("paste", function (e) { e.preventDefault(); })` on
  government/banking forms, which sits on the input element rather than on
  `document`.
- `keydown` is only touched for Ctrl/Cmd + C/V/X and Shift+Insert (plus
  Ctrl/Cmd+A outside editable fields), so app shortcuts like Enter-to-send,
  Escape and arrow keys keep working.
- `contextmenu` / `selectstart` / `mousedown` are only overruled when the
  listener is a pure blocker or is registered on
  `window` / `document` / `<html>` / `<body>`, so custom right-click menus in
  real apps survive.
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
- The popup reports the truth rather than the stored flag: it asks the page
  whether the patch script actually ran, so "Enabled — reload this page" and
  "Could not start: ..." are real diagnostics.
- This only affects your own browser's handling of the page; it doesn't
  bypass server-side validation, so if a field also rejects pasted values on
  submit, that's a separate check.
