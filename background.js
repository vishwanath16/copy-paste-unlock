// Registers/unregisters the MAIN-world patch script when the toggle changes.
//
// A dynamically registered content script with world "MAIN" runs at
// document_start *before* any page script. The old approach (injecting a
// <script src="chrome-extension://..."> from an isolated content script) was
// asynchronous, so page scripts frequently won the race, and it was also
// blocked outright by strict Content-Security-Policy on many sites.

const SCRIPT_ID = "copy-paste-unlock-main";

const SCRIPT = {
  id: SCRIPT_ID,
  matches: ["http://*/*", "https://*/*"],
  js: ["content.js"],
  runAt: "document_start",
  allFrames: true,
  world: "MAIN",
  persistAcrossSessions: true,
};

async function isRegistered() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    return scripts.length > 0;
  } catch (e) {
    return false;
  }
}

async function sync(enabled) {
  const registered = await isRegistered();
  try {
    if (enabled && !registered) {
      await chrome.scripting.registerContentScripts([SCRIPT]);
    } else if (enabled && registered) {
      await chrome.scripting.updateContentScripts([SCRIPT]);
    } else if (!enabled && registered) {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    }
  } catch (e) {
    console.error("Copy-Paste Unlock: could not update registration", e);
  }
}

async function syncFromStorage() {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  await sync(enabled);
}

chrome.runtime.onInstalled.addListener(syncFromStorage);
chrome.runtime.onStartup.addListener(syncFromStorage);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "setEnabled") return;
  const enabled = !!msg.enabled;
  (async () => {
    await chrome.storage.local.set({ enabled });
    await sync(enabled);
    sendResponse({ enabled });
  })();
  return true; // keep the channel open for the async response
});
