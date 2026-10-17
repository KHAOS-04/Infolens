// Infolens extension, background service worker (Manifest V3).
// Flow: right-click selected text -> "Analyze Information" -> overlay shows loading -> overlay shows results.

// Set to false when Reynaldo's back-end is running at API_URL.
const USE_SAMPLE_DATA = true;
const API_URL = "http://localhost:8000/analyze";
const MENU_ID = "infolens-analyze";
const MAX_CHARS = 5000;

// Create the right-click menu item (only shows when text is selected).
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Analyze Information",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || !tab.id) return;
  handleSelection(tab.id, info.selectionText || "");
});

// Send a message to the overlay; ignore errors if the tab was closed.
function send(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

// Whole flow for one click. Kept self-contained because service workers go to sleep.
async function handleSelection(tabId, selectedText) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (err) {
    console.warn("Infolens cannot run on this page:", err);
    return;
  }
  await send(tabId, { type: "infolens-loading" });
  try {
    const data = await getAnalysis(selectedText.trim().slice(0, MAX_CHARS));
    await send(tabId, { type: "infolens-result", data });
  } catch (err) {
    console.warn("Infolens request failed:", err);
    await send(tabId, { type: "infolens-error" });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns the response object described in the data contract.
async function getAnalysis(text) {
  if (USE_SAMPLE_DATA) {
    await sleep(900); // so the loading state is visible
    const res = await fetch(chrome.runtime.getURL("sample_response.json"));
    return res.json();
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, image_base64: null, language_hint: "auto" })
  });
  if (!res.ok) throw new Error("Back-end returned " + res.status);
  return res.json();
}
