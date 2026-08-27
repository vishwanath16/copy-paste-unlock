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
    chrome.storage.local.set({ enabled }, () => {
      render(enabled);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id !== undefined) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    });
  });
});
