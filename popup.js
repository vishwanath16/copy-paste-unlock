document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggle");
  const statusEl = document.getElementById("status");

  function show(text, cls) {
    statusEl.textContent = text;
    statusEl.className = "status " + cls;
  }

  function activeTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  // Ask the page itself whether the patch script actually ran, instead of
  // just trusting the stored flag.
  function isRunningIn(tabId) {
    return new Promise((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          world: "MAIN",
          func: () => !!window.__copyPasteUnlockInstalled__,
        },
        (results) => {
          if (chrome.runtime.lastError || !results || !results.length) resolve(null);
          else resolve(!!results[0].result);
        }
      );
    });
  }

  async function refresh(status) {
    toggle.checked = status.enabled;
    if (!status.enabled) {
      show("○ Disabled", "off");
      return;
    }
    if (!status.registered) {
      show("⚠ Could not start: " + (status.error || "registration failed"), "warn");
      return;
    }
    const tab = await activeTab();
    if (!tab || !tab.id) {
      show("● Enabled", "on");
      return;
    }
    const running = await isRunningIn(tab.id);
    if (running === true) show("● Active on this page", "on");
    else if (running === false) show("⚠ Enabled — reload this page", "warn");
    else show("● Enabled (can't run on this page)", "off");
  }

  chrome.runtime.sendMessage({ type: "getStatus" }, (status) => {
    if (chrome.runtime.lastError || !status) {
      show("⚠ Background worker not responding", "warn");
      return;
    }
    refresh(status);
  });

  toggle.addEventListener("change", () => {
    const enabled = toggle.checked;
    toggle.disabled = true;
    // The background worker owns the stored flag and the script registration.
    // Reload only after it confirms, otherwise the tab can reload before the
    // registration change has taken effect.
    chrome.runtime.sendMessage({ type: "setEnabled", enabled }, async (status) => {
      toggle.disabled = false;
      if (chrome.runtime.lastError || !status) {
        show("⚠ Background worker not responding", "warn");
        return;
      }
      const tab = await activeTab();
      if (tab && tab.id !== undefined) chrome.tabs.reload(tab.id);
      show(
        status.enabled
          ? status.registered
            ? "● Active on this page"
            : "⚠ Could not start: " + (status.error || "registration failed")
          : "○ Disabled",
        status.enabled ? (status.registered ? "on" : "warn") : "off"
      );
    });
  });
});
