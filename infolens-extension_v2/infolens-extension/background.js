const USE_SAMPLE_DATA = true;

const FALLBACK_TO_DEMO_ON_FAILURE = false;

const API_URL = "http://localhost:8000/analyze";
const MENU_ID = "infolens-analyze";
const MAX_CHARS = 5000;
const DEMO_DELAY_MS = 1400;      
const REQUEST_TIMEOUT_MS = 20000;

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
    
    request.kind = "image";
    request.imageUrl = safeHttpUrl(info.srcUrl);
  } else {
    request.kind = "empty";
  }
  return runAnalysis(tab.id, request);
}

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

function send(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {});
}

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

async function loadSample() {
  await sleep(DEMO_DELAY_MS);
  const res = await fetch(chrome.runtime.getURL("sample_response.json"));
  return res.json();
}

async function callBackend(request) {
  if (request.kind === "image") {
    
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
