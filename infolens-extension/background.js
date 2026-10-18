// Infolens extension, background service worker (Manifest V3).
// Flow: right-click selected text (or an image) -> "Analyze Information"
//       -> overlay shows "Verifying content" -> "Content Analyzed" -> analysis card.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// true  = DEMONSTRATION MODE. No network is used. The result comes from
//         sample_response.json and the overlay labels it as demonstration data.
// false = real mode. Calls the back-end at API_URL (start it on port 8000).
const USE_SAMPLE_DATA = true;

// Real mode only. If the back-end request fails, show the sample data instead of
// an error. The overlay always labels that result as demonstration data.
const FALLBACK_TO_DEMO_ON_FAILURE = false;

const API_URL = "http://localhost:8000/analyze";
const MENU_ID = "infolens-analyze";
const MAX_CHARS = 5000;
const DEMO_DELAY_MS = 1400;      // demo mode: how long "Verifying content" is shown
const REQUEST_TIMEOUT_MS = 20000; // real mode: give up on the back-end after this long

// ---------------------------------------------------------------------------
// Right-click menu
// ---------------------------------------------------------------------------

// removeAll() first, so restarting the worker or reloading the extension can
// never produce a duplicate "Analyze Information" entry.
//
// Note: Chrome's native context menu cannot show a custom PNG per item, so the
// supplied icons are not attached here (see README, "Known limitations").
function registerMenu() {
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create(
      { id: MENU_ID, title: "Analyze Information", contexts: ["selection", "image"] },
      () => void chrome.runtime.lastError
    );
  });
}

chrome.runtime.onInstalled.addListener(registerMenu);
chrome.runtime.onStartup.addListener(registerMenu);
chrome.contextMenus.onClicked.addListener(handleMenuClick);

function handleMenuClick(info, tab) {
  if (!info || info.menuItemId !== MENU_ID || !tab || !tab.id) return;

  const text = (info.selectionText || "").trim();
  const request = { id: crypto.randomUUID(), kind: "text", text: "", imageUrl: null };

  if (text) {
    request.text = text.slice(0, MAX_CHARS);
  } else if (info.mediaType === "image") {
    // Only the image address is passed along. The image is never downloaded here.
    request.kind = "image";
    request.imageUrl = safeHttpUrl(info.srcUrl);
  } else {
    request.kind = "empty";
  }
  return runAnalysis(tab.id, request);
}

// ---------------------------------------------------------------------------
// One analysis, start to finish. Kept self-contained because service workers
// go to sleep; the overlay ignores any message whose requestId is not current.
// ---------------------------------------------------------------------------

async function runAnalysis(tabId, request) {
  if (!(await ensureOverlay(tabId))) return;

  if (request.kind === "empty") {
    await send(tabId, {
      type: "infolens-error", requestId: request.id, reason: "empty", immediate: true
    });
    return;
  }

  await send(tabId, { type: "infolens-loading", requestId: request.id });
  try {
    const { data, demo } = await getAnalysis(request);
    await send(tabId, {
      type: "infolens-result", requestId: request.id, kind: request.kind, demo, data
    });
  } catch (err) {
    console.warn("Infolens request failed:", err);
    await send(tabId, {
      type: "infolens-error", requestId: request.id, reason: (err && err.reason) || "network"
    });
  }
}

// Make sure the overlay script is running in the tab (it is injected on demand,
// so the extension needs no broad host permissions).
async function ensureOverlay(tabId) {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: "infolens-ping" }, { frameId: 0 });
    if (pong && pong.ok) return true;
  } catch (err) {
    // No listener yet: fall through and inject.
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return true;
  } catch (err) {
    console.warn("Infolens cannot run on this page:", err);
    return false;
  }
}

// Send a message to the overlay (top frame); ignore errors if the tab was closed.
function send(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {});
}

// Only plain web addresses are accepted.
function safeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failure(reason, message) {
  const err = new Error(message || reason);
  err.reason = reason;
  return err;
}

// ---------------------------------------------------------------------------
// Where the result comes from
// ---------------------------------------------------------------------------

// Returns { data, demo }. `demo` is true whenever the data is sample data.
async function getAnalysis(request) {
  if (USE_SAMPLE_DATA) {
    return { data: await loadSample(), demo: true };
  }

  try {
    return { data: await callBackend(request), demo: false };
  } catch (err) {
    if (FALLBACK_TO_DEMO_ON_FAILURE && !(err && err.reason === "image-unsupported")) {
      console.warn("Infolens back-end unavailable, showing demonstration data:", err);
      return { data: await loadSample(), demo: true };
    }
    throw err;
  }
}

// Sample data from sample_response.json (no network). The short wait is
// intentional so the "Verifying content" state can be seen.
async function loadSample() {
  await sleep(DEMO_DELAY_MS);
  const res = await fetch(chrome.runtime.getURL("sample_response.json"));
  return res.json();
}

// Real back-end call, following the data contract in sample_response.json.
async function callBackend(request) {
  if (request.kind === "image") {
    // The contract expects the image as base64. Fetching page images from here
    // would bypass the page's own access rules, so images are not sent yet.
    throw failure("image-unsupported", "Image analysis is not connected yet.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: request.text, image_base64: null, language_hint: "auto" }),
      signal: controller.signal
    });
    if (!res.ok) throw failure("network", "Back-end returned " + res.status);
    const data = await res.json();
    if (!data || typeof data !== "object") throw failure("network", "Unexpected back-end response");
    return data;
  } finally {
    clearTimeout(timer);
  }
}
