// Registers/unregisters the MAIN-world patch script when the toggle changes.
//
// A dynamically registered content script with world "MAIN" runs at
// document_start *before* any page script. The old approach (injecting a
// <script src="chrome-extension://..."> from an isolated content script) was
// asynchronous, so page scripts frequently won the race, and it was also
// blocked outright by strict Content-Security-Policy on many sites.

const SCRIPT_ID = "copy-paste-unlock-main";

function scriptConfig(withOriginFallback) {
  const config = {
    id: SCRIPT_ID,
    matches: ["http://*/*", "https://*/*"],
    js: ["content.js"],
    runAt: "document_start",
    allFrames: true,
    world: "MAIN",
    persistAcrossSessions: true,
  };
  // Covers about:blank / srcdoc iframes, which some sites render forms into.
  // Not supported on older Chrome, hence the retry without it.
  if (withOriginFallback) config.matchOriginAsFallback = true;
  return config;
}

let lastError = null;

async function isRegistered() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    return scripts.length > 0;
  } catch (e) {
    return false;
  }
}

async function apply(fn) {
  try {
    await fn(scriptConfig(true));
    return true;
  } catch (e) {
    try {
      await fn(scriptConfig(false));
      return true;
    } catch (e2) {
      lastError = e2 && e2.message ? e2.message : String(e2);
      console.error("Copy-Paste Unlock: could not update registration", e2);
      return false;
    }
  }
}

async function sync(enabled) {
  const registered = await isRegistered();
  if (enabled && !registered) {
    await apply((c) => chrome.scripting.registerContentScripts([c]));
  } else if (enabled && registered) {
    await apply((c) => chrome.scripting.updateContentScripts([c]));
  } else if (!enabled && registered) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    } catch (e) {
      lastError = e && e.message ? e.message : String(e);
      console.error("Copy-Paste Unlock: could not unregister", e);
    }
  }
  if (enabled && (await isRegistered())) lastError = null;
}

async function syncFromStorage() {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  await sync(enabled);
}

chrome.runtime.onInstalled.addListener(syncFromStorage);
chrome.runtime.onStartup.addListener(syncFromStorage);
// Also reconcile whenever the service worker starts, in case an event that
// should have registered the script was missed.
syncFromStorage();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "setEnabled") {
    const enabled = !!msg.enabled;
    (async () => {
      await chrome.storage.local.set({ enabled });
      await sync(enabled);
      sendResponse({ enabled, registered: await isRegistered(), error: lastError });
    })();
    return true; // keep the channel open for the async response
  }

  if (msg.type === "getStatus") {
    (async () => {
      const { enabled } = await chrome.storage.local.get({ enabled: false });
      sendResponse({ enabled, registered: await isRegistered(), error: lastError });
    })();
    return true;
  }
});
