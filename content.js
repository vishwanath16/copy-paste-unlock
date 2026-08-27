// Copy-Paste Unlock
// Runs at document_start in the page's MAIN world, so it patches things
// before the page's own scripts get a chance to register their blockers.

(function () {
  "use strict";

  const BLOCKED_EVENTS = new Set([
    "copy",
    "cut",
    "paste",
    "contextmenu",
    "selectstart",
    "dragstart",
    "mousedown", // some sites (ab)use this to kill selection
    "keydown",   // some sites use this to catch Ctrl+C / Ctrl+V, we filter below
  ]);

  // --- 1. Stop new listeners for these events from ever attaching ---
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (typeof type === "string" && BLOCKED_EVENTS.has(type.toLowerCase())) {
      // For keydown/mousedown we only want to block if it's likely being used
      // as a copy/paste blocker, but that's hard to detect in general, so we
      // just wrap the listener to strip preventDefault/stopPropagation calls
      // for the safe events, and fully drop it for the clipboard-specific ones.
      const t = type.toLowerCase();
      if (t === "keydown" || t === "mousedown") {
        // Let it register, but neutralize its ability to block default action.
        const wrapped = function (e) {
          const fakeEvent = new Proxy(e, {
            get(target, prop) {
              if (prop === "preventDefault" || prop === "stopPropagation" || prop === "stopImmediatePropagation") {
                return function () {};
              }
              return target[prop];
            },
          });
          if (typeof listener === "function") {
            return listener.call(this, fakeEvent);
          } else if (listener && typeof listener.handleEvent === "function") {
            return listener.handleEvent(fakeEvent);
          }
        };
        return originalAddEventListener.call(this, type, wrapped, options);
      }
      // Drop copy/cut/paste/contextmenu/selectstart/dragstart blockers entirely.
      return;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // --- 2. Force the on* inline handler properties to always read as null ---
  const props = ["oncopy", "oncut", "onpaste", "oncontextmenu", "onselectstart", "ondragstart"];
  const targets = [
    [Document.prototype, props],
    [HTMLElement.prototype, props],
    [HTMLBodyElement.prototype, props],
    [Window.prototype, props],
  ];

  for (const [proto, propList] of targets) {
    for (const prop of propList) {
      try {
        Object.defineProperty(proto, prop, {
          configurable: true,
          get() {
            return null;
          },
          set(_value) {
            // swallow any attempt to set a blocking handler
          },
        });
      } catch (e) {
        // Some props may already be non-configurable; ignore.
      }
    }
  }

  // --- 3. Clean up any existing inline handlers already present in HTML attrs ---
  function stripInlineHandlers(root) {
    if (!root || !root.querySelectorAll) return;
    const attrs = ["oncopy", "oncut", "onpaste", "oncontextmenu", "onselectstart", "ondragstart"];
    const walk = (el) => {
      for (const a of attrs) {
        if (el.hasAttribute && el.hasAttribute(a)) el.removeAttribute(a);
      }
    };
    walk(root);
    root.querySelectorAll("*").forEach(walk);
  }

  function run() {
    stripInlineHandlers(document.documentElement);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes") {
        stripInlineHandlers(m.target);
      } else if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) stripInlineHandlers(n);
        });
      }
    }
  });
  const startObserving = () => {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["oncopy", "oncut", "onpaste", "oncontextmenu", "onselectstart", "ondragstart"],
    });
  };
  if (document.documentElement) {
    startObserving();
  } else {
    document.addEventListener("DOMContentLoaded", startObserving);
  }

  // --- 4. Force CSS that blocks selection back on ---
  function injectCss() {
    const style = document.createElement("style");
    style.id = "__copy_paste_unlock_style__";
    style.textContent = `
      * {
        user-select: text !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.head) {
    injectCss();
  } else {
    document.addEventListener("DOMContentLoaded", injectCss);
  }
})();
