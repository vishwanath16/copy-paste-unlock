document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggle");
  const statusEl = document.getElementById("status");

  function render(enabled) {
    toggle.checked = enabled;
    statusEl.textContent = enabled ? "● Active on this page" : "○ Disabled";
    statusEl.className = "status " + (enabled ? "on" : "off");
  }

  chrome.storage.local.get({ enabled: false }, (result) => {
    render(result.enabled);
  });

  toggle.addEventListener("change", () => {
    const enabled = toggle.checked;
    toggle.disabled = true;
    // The background worker owns the stored flag and the script registration.
    // Reload only after it confirms, otherwise the tab can reload before the
    // registration change has taken effect.
    chrome.runtime.sendMessage({ type: "setEnabled", enabled }, () => {
      toggle.disabled = false;
      render(enabled);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id !== undefined) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    });
  });
});
