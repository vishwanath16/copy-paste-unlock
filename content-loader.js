// Runs in the extension's isolated world (has access to chrome.storage).
// Only injects the actual patching script (content.js) into the page's own
// JS context if the user has turned the extension ON for this browser.
// Default is OFF/disabled.

(function () {
  "use strict";

  chrome.storage.local.get({ enabled: false }, (result) => {
    if (chrome.runtime.lastError) return;
    if (result.enabled) {
      injectPageScript();
    }
  });

  function injectPageScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content.js");
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }
})();
