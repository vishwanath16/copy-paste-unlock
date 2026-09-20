// Copy-Paste Unlock
// Runs at document_start in the page's MAIN world (registered dynamically by
// background.js only while the extension is turned on), so it patches the
// blocking APIs before the page's own scripts get a chance to use them.
//
// Design rule: NEVER remove a page's event listener. Real web apps (WhatsApp
// Web, ChatGPT, Claude, Gmail, ...) implement image/file paste, rich copy and
// drag & drop *inside* their copy/cut/paste/dragstart handlers. Dropping those
// listeners does not "unlock" anything, it just breaks the app.
//
// Instead every interesting listener is wrapped, and only its ability to call
// preventDefault() is taken away -- and only when the listener looks like a
// pure blocker rather than a real handler. See shouldGuard()/decide() below.

(function () {
  "use strict";

  const FLAG = "__copyPasteUnlockInstalled__";
  if (window[FLAG]) return;
  try {
    Object.defineProperty(window, FLAG, { value: true });
  } catch (e) {
    window[FLAG] = true;
  }

  const GUARDED_EVENTS = new Set([
    "copy",
    "cut",
    "paste",
    "contextmenu",
    "selectstart",
    "dragstart",
    "mousedown", // some sites (ab)use this to kill selection
    "keydown",   // some sites use this to catch Ctrl+C / Ctrl+V
  ]);

  // Events where the page's handler needs to read the payload to do real work.
  // Touching that payload is our signal that the handler is not a blocker.
  const DATA_PROP = {
    copy: "clipboardData",
    cut: "clipboardData",
    paste: "clipboardData",
    dragstart: "dataTransfer",
  };

  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  const nativePreventDefault = Event.prototype.preventDefault;
  const hasOwn = Object.prototype.hasOwnProperty;

  // --- Helpers ------------------------------------------------------------

  function isGlobalTarget(t) {
    return (
      t === window ||
      t === document ||
      t === document.documentElement ||
      (!!document.body && t === document.body)
    );
  }

  function isEditable(node) {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (!el.closest) return false;
    try {
      return !!el.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])"
      );
    } catch (e) {
      return false;
    }
  }

  function isClipboardShortcut(e) {
    if (!e.ctrlKey && !e.metaKey && !(e.shiftKey && e.key === "Insert")) return false;
    const k = typeof e.key === "string" ? e.key.toLowerCase() : "";
    return k === "c" || k === "v" || k === "x" || k === "a" || k === "insert";
  }

  // A "pure blocker" is a handler whose whole body is preventDefault /
  // stopPropagation / return false. Anything else (a real app handler, even
  // minified) is left alone.
  const blockerCache = new WeakMap();
  function looksLikeBlocker(fn) {
    if (typeof fn !== "function") return false;
    if (blockerCache.has(fn)) return blockerCache.get(fn);
    let result = false;
    try {
      const src = Function.prototype.toString.call(fn);
      if (src.length <= 300 && src.indexOf("[native code]") === -1) {
        const brace = src.indexOf("{");
        const arrow = src.indexOf("=>");
        let body;
        if (brace !== -1 && (arrow === -1 || brace < arrow + 4)) {
          body = src.slice(brace + 1, src.lastIndexOf("}"));
        } else if (arrow !== -1) {
          body = src.slice(arrow + 2);
        } else {
          body = src;
        }
        const stripped = body
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/[^\n]*/g, "")
          .replace(/(["'`])use strict\1\s*;?/g, "")
          .replace(
            /[\w$.]*\b(?:preventDefault|stopPropagation|stopImmediatePropagation)\s*\(\s*\)\s*;?/g,
            ""
          )
          .replace(/[\w$.]*\breturnValue\s*=\s*(?:false|!1)\s*;?/g, "")
          .replace(/\breturn\s+(?:false|!1)\s*;?/g, "")
          .replace(/\breturn\s*;?/g, "")
          .replace(/[{}();,\s]/g, "");
        result = stripped.length === 0;
      }
    } catch (e) {
      result = false;
    }
    blockerCache.set(fn, result);
    return result;
  }

  // Should this dispatch be intercepted at all? Anything that returns false
  // runs completely untouched, exactly as the page wrote it.
  function shouldGuard(type, event, listener) {
    if (looksLikeBlocker(listener)) return true;

    const global = isGlobalTarget(event.currentTarget);
    if (!global) return false; // element-level handlers are real app code

    if (type === "keydown") {
      // Only Ctrl/Cmd + C/V/X/A, and never inside an editor -- otherwise we
      // would break Enter-to-send, Escape, arrow keys, IME, shortcuts, ...
      return !isEditable(event.target) && isClipboardShortcut(event);
    }
    if (type === "mousedown") {
      return !isEditable(event.target);
    }
    return true;
  }

  function ownGetter(obj, prop) {
    let o = obj;
    while (o) {
      const d = Object.getOwnPropertyDescriptor(o, prop);
      if (d) return d.get || null;
      o = Object.getPrototypeOf(o);
    }
    return null;
  }

  // Temporarily shadow preventDefault (and friends) on this one event object,
  // record what the handler did, then decide whether to let the block through.
  function installGuard(event, type) {
    const state = { prevented: false, touchedData: false };
    const undo = [];

    function shadow(prop, descriptor) {
      const had = hasOwn.call(event, prop);
      const old = had ? Object.getOwnPropertyDescriptor(event, prop) : null;
      try {
        Object.defineProperty(event, prop, descriptor);
      } catch (e) {
        return;
      }
      undo.push(function () {
        try {
          if (had) Object.defineProperty(event, prop, old);
          else delete event[prop];
        } catch (e) {
          /* ignore */
        }
      });
    }

    shadow("preventDefault", {
      configurable: true,
      writable: true,
      value: function () {
        state.prevented = true;
      },
    });
    shadow("returnValue", {
      configurable: true,
      get: function () {
        return !state.prevented;
      },
      set: function (v) {
        if (v === false) state.prevented = true;
      },
    });

    const dataProp = DATA_PROP[type];
    if (dataProp) {
      const getter = ownGetter(event, dataProp);
      if (getter) {
        shadow(dataProp, {
          configurable: true,
          get: function () {
            state.touchedData = true;
            return getter.call(event);
          },
        });
      }
    }

    state.finish = function (listener) {
      for (let i = undo.length - 1; i >= 0; i--) undo[i]();
      if (!state.prevented) return false;
      // Suppress the block when it is a pure blocker, or when a clipboard /
      // drag handler prevented the default without ever looking at the data
      // it was handed -- that is a blocker, not a handler.
      const suppress = looksLikeBlocker(listener) || (dataProp ? !state.touchedData : true);
      if (!suppress) {
        try {
          nativePreventDefault.call(event);
        } catch (e) {
          /* ignore */
        }
      }
      return suppress;
    };

    return state;
  }

  function callListener(listener, thisArg, event) {
    if (typeof listener === "function") return listener.call(thisArg, event);
    if (listener && typeof listener.handleEvent === "function") {
      return listener.handleEvent.call(listener, event);
    }
  }

  function handlerFn(listener) {
    return typeof listener === "function" ? listener : listener && listener.handleEvent;
  }

  // --- 1. Wrap (never drop) listeners for the interesting events ----------

  const wrappers = new WeakMap(); // listener -> Map(type -> wrapped)

  function makeWrapper(type, listener) {
    return function (event) {
      if (!shouldGuard(type, event, handlerFn(listener))) {
        return callListener(listener, this, event);
      }
      const guard = installGuard(event, type);
      let result;
      try {
        result = callListener(listener, this, event);
      } finally {
        var suppressed = guard.finish(handlerFn(listener));
      }
      // `return false` from a handler is equivalent to preventDefault().
      if (suppressed && result === false) return undefined;
      return result;
    };
  }

  function wrapperFor(type, listener) {
    let byType = wrappers.get(listener);
    if (!byType) {
      byType = new Map();
      wrappers.set(listener, byType);
    }
    let wrapped = byType.get(type);
    if (!wrapped) {
      wrapped = makeWrapper(type, listener);
      byType.set(type, wrapped);
    }
    return wrapped;
  }

  function isWrappable(listener) {
    return (
      typeof listener === "function" ||
      (listener && typeof listener === "object" && typeof listener.handleEvent === "function")
    );
  }

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (typeof type === "string" && GUARDED_EVENTS.has(type.toLowerCase()) && isWrappable(listener)) {
      try {
        return nativeAdd.call(this, type, wrapperFor(type.toLowerCase(), listener), options);
      } catch (e) {
        /* fall through to the untouched path */
      }
    }
    return nativeAdd.call(this, type, listener, options);
  };

  // Without this, pages could never remove their own listeners again (they
  // hold the original function, we registered the wrapper), which leaks
  // handlers and duplicates behaviour in SPAs.
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (typeof type === "string" && GUARDED_EVENTS.has(type.toLowerCase()) && isWrappable(listener)) {
      const byType = wrappers.get(listener);
      const wrapped = byType && byType.get(type.toLowerCase());
      if (wrapped) nativeRemove.call(this, type, wrapped, options);
    }
    return nativeRemove.call(this, type, listener, options);
  };

  // --- 2. Wrap the on* handler properties the same way --------------------

  const propOriginals = new WeakMap(); // wrapper -> original handler

  const HANDLER_PROPS = [
    "oncopy",
    "oncut",
    "onpaste",
    "oncontextmenu",
    "onselectstart",
    "ondragstart",
    "onmousedown",
    "onkeydown",
  ];

  function patchHandlerProp(proto, prop) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.configurable || typeof d.get !== "function" || typeof d.set !== "function") return;
    const type = prop.slice(2);
    try {
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: d.enumerable,
        get: function () {
          const cur = d.get.call(this);
          const original = cur && propOriginals.get(cur);
          return original || cur;
        },
        set: function (value) {
          if (typeof value === "function") {
            const wrapped = makeWrapper(type, value);
            propOriginals.set(wrapped, value);
            d.set.call(this, wrapped);
          } else {
            d.set.call(this, value);
          }
        },
      });
    } catch (e) {
      /* non-configurable in this engine; ignore */
    }
  }

  const protos = [Document.prototype, HTMLElement.prototype, Window.prototype];
  if (typeof SVGElement !== "undefined") protos.push(SVGElement.prototype);
  for (const proto of protos) {
    for (const prop of HANDLER_PROPS) patchHandlerProp(proto, prop);
  }

  // --- 3. Strip inline on* attributes coming from the HTML ----------------
  // (content attributes bypass the IDL setters patched above)

  const HANDLER_ATTRS = [
    "oncopy",
    "oncut",
    "onpaste",
    "oncontextmenu",
    "onselectstart",
    "ondragstart",
  ];
  const ATTR_SELECTOR = HANDLER_ATTRS.map((a) => "[" + a + "]").join(",");

  function stripOn(el) {
    if (!el || !el.hasAttribute) return;
    for (const a of HANDLER_ATTRS) {
      if (el.hasAttribute(a)) el.removeAttribute(a);
    }
  }

  function stripTree(root) {
    if (!root || root.nodeType !== 1) return;
    stripOn(root);
    if (root.querySelectorAll) {
      // Query only the six attributes instead of every element in the
      // subtree -- the old "*" walk froze DOM-heavy apps.
      const matches = root.querySelectorAll(ATTR_SELECTOR);
      for (let i = 0; i < matches.length; i++) stripOn(matches[i]);
    }
  }

  let pending = [];
  let scheduled = false;
  const defer =
    typeof window.requestIdleCallback === "function"
      ? function (cb) {
          window.requestIdleCallback(cb, { timeout: 500 });
        }
      : function (cb) {
          setTimeout(cb, 50);
        };

  function flush() {
    scheduled = false;
    const queue = pending;
    pending = [];
    for (const node of queue) {
      try {
        stripTree(node);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function schedule(node) {
    if (pending.length > 500) return; // a full sweep will catch the rest
    pending.push(node);
    if (!scheduled) {
      scheduled = true;
      defer(flush);
    }
  }

  function sweep() {
    stripTree(document.documentElement);
  }

  sweep();
  if (document.readyState === "loading") {
    nativeAdd.call(document, "DOMContentLoaded", sweep);
  }

  const observer = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      if (m.type === "attributes") {
        stripOn(m.target);
      } else if (m.addedNodes) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const n = m.addedNodes[i];
          if (n.nodeType === 1) schedule(n);
        }
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: HANDLER_ATTRS,
  });

  // --- 4. Force CSS that blocks selection back on -------------------------

  const style = document.createElement("style");
  style.id = "__copy_paste_unlock_style__";
  // Draggable elements are excluded: forcing user-select on them breaks
  // drag & drop (file uploads, reordering) in real apps.
  style.textContent =
    '*:not([draggable="true"]):not([draggable="true"] *) {' +
    "user-select: text !important;" +
    "-webkit-user-select: text !important;" +
    "-moz-user-select: text !important;" +
    "-ms-user-select: text !important;" +
    "}";
  (document.head || document.documentElement).appendChild(style);
})();
