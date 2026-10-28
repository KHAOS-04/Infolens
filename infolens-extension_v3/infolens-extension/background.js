// Infolens extension, background service worker (Manifest V3).
// Flow: right-click selected text (or an image) -> "Analyze Information"
//       -> overlay shows "Verifying content" -> "Content Analyzed" -> analysis card.
//       If something goes wrong, the overlay shows a short, friendly message instead.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// true  = DEMONSTRATION MODE. No network is used. The result comes from
//         demo_responses.json (when the selection matches a demo claim) or
//         sample_response.json, and the overlay labels it as demonstration data.
// false = real mode. Calls the back-end at API_URL (start it on port 8000).
const USE_SAMPLE_DATA = true;

// Real mode only. If the back-end cannot be used, show demonstration data instead
// of an error. Only for the reasons in FALLBACK_REASONS (never for the daily
// limit). The overlay always labels that result as demonstration data.
const FALLBACK_TO_DEMO_ON_FAILURE = false;
const FALLBACK_REASONS = ["network", "server", "timeout"];

// true = write timing lines to this service worker's console (see README).
const DEBUG_TIMING = false;

const API_URL = "http://localhost:8000/analyze";
const MENU_ID = "infolens-analyze";
const MAX_CHARS = 5000;                      // longest selection that is sent
const MIN_CHARS = 10;                        // shortest selection that is analyzed
const MAX_DATA_IMAGE_BYTES = 5 * 1024 * 1024; // largest embedded (data:) image that is sent
const DEMO_DELAY_MS = 1400;                  // demo mode: how long "Verifying content" is shown
// Real mode: give up on the back-end after this long. Keep it below WATCHDOG_MS in
// content.js, so a timeout message always arrives before the overlay's own safety net.
const REQUEST_TIMEOUT_MS = 20000;

// ===========================================================================
// API CONTRACT. This is the ONLY place that knows what the back-end expects and
// returns. When the contract changes, edit buildRequestBody, ERROR_CODE_REASONS
// and classifyReply below, and nothing else.
// ===========================================================================

// What we send. image_url is only included when it is set, so text requests keep
// exactly the original shape: { text, image_base64, language_hint }.
function buildRequestBody(request) {
  const body = {
    text: request.text || "",
    image_base64: request.imageBase64 || null,
    language_hint: "auto"
  };
  if (request.imageUrl) body.image_url = request.imageUrl;
  return body;
}

// Error codes the back-end may put in a JSON body, mapped to our reasons.
const ERROR_CODE_REASONS = { quota_exceeded: "quota" };

// Looks at the HTTP status and the parsed JSON body (null if it was not JSON).
// Returns the data for the card, or throws failure(reason).
//   quota      : HTTP 429, or error_code "quota_exceeded"
//   no-results : error_code "no_results" and no analysis to show
//   server     : any other non-2xx status, unreadable JSON, or an incomplete body
// An empty `sources` list is NOT an error: the card shows it as "no sources".
function classifyReply(status, body) {
  const obj = body && typeof body === "object" && !Array.isArray(body) ? body : null;
  const code = obj && typeof obj.error_code === "string" ? obj.error_code : "";
  const hasAnalysis = !!(obj && typeof obj.analysis_paragraph === "string" && obj.analysis_paragraph.trim());

  if (status === 429) throw failure("quota", "status 429");
  if (ERROR_CODE_REASONS[code]) throw failure(ERROR_CODE_REASONS[code], "error_code " + code);
  if (code === "no_results" && !hasAnalysis) throw failure("no-results", "error_code no_results");
  if (status < 200 || status >= 300) throw failure("server", "status " + status);
  if (!hasAnalysis) throw failure("server", "incomplete reply");
  if (obj.sources != null && !Array.isArray(obj.sources)) throw failure("server", "incomplete reply");
  return obj;
}

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
  return runAnalysis(tab.id, buildRequest(info));
}

// Turns what the user clicked into a request. A request that cannot be analyzed
// carries a `problem` (a reason) and is reported to the overlay straight away.
function buildRequest(info) {
  const id = crypto.randomUUID();
  const text = (info.selectionText || "").trim();

  if (text) {
    if (text.length < MIN_CHARS) return { id, kind: "text", text, problem: "too-short" };
    return { id, kind: "text", text: text.slice(0, MAX_CHARS) };
  }
  if (info.mediaType === "image") {
    // Only the image address is passed along. The image is never downloaded here.
    return Object.assign({ id, kind: "image", text: "" }, describeImage(info.srcUrl));
  }
  return { id, kind: "empty", text: "", problem: "empty" };
}

// Three kinds of image address:
//   data:image/...;base64,...  -> sent as base64 (no network needed here)
//   http(s)://...              -> sent as an address; the back-end fetches it
//   anything else (blob:, ...) -> cannot be reached from outside the page
function describeImage(src) {
  if (typeof src !== "string" || !src) return { imageProblem: "image-direct" };
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(src)) {
    const b64 = src.slice(src.indexOf(",") + 1);
    if (Math.floor((b64.length * 3) / 4) > MAX_DATA_IMAGE_BYTES) return { imageProblem: "image-large" };
    return { imageBase64: b64 };
  }
  const url = safeHttpUrl(src);
  return url ? { imageUrl: url } : { imageProblem: "image-direct" };
}

// ---------------------------------------------------------------------------
// One analysis, start to finish. Kept self-contained because service workers
// go to sleep; the overlay ignores any message whose requestId is not current.
// ---------------------------------------------------------------------------

// The last request of each tab, in memory only (no extra permission needed).
// Used by "Try again". It is lost if the browser stops this worker, and then
// the overlay asks the person to select the text again.
const lastRequests = new Map();
chrome.tabs.onRemoved.addListener((tabId) => lastRequests.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "infolens-retry") return;
  if (!sender || sender.id !== chrome.runtime.id || !sender.tab || !sender.tab.id) return;
  retryLast(sender.tab.id);
});

function retryLast(tabId) {
  const last = lastRequests.get(tabId);
  if (!last) {
    return send(tabId, {
      type: "infolens-error", requestId: crypto.randomUUID(), reason: "retry-lost", immediate: true
    });
  }
  return runAnalysis(tabId, Object.assign({}, last, { id: crypto.randomUUID() }));
}

async function runAnalysis(tabId, request) {
  if (!(await ensureOverlay(tabId))) return;

  // Things we already know cannot work (nothing selected, too little text, an
  // image address nobody can fetch). Demo mode still answers image requests.
  const problem = request.problem || (!USE_SAMPLE_DATA && request.imageProblem) || null;
  if (problem) {
    await send(tabId, { type: "infolens-error", requestId: request.id, reason: problem, immediate: true });
    return;
  }

  lastRequests.set(tabId, request);
  const started = Date.now();
  timing("request started", request.id, started);
  await send(tabId, { type: "infolens-loading", requestId: request.id });
  try {
    const { data, demo } = await getAnalysis(request);
    timing("response received (" + (demo ? "demo" : "real") + ")", request.id, started);
    await send(tabId, {
      type: "infolens-result", requestId: request.id, kind: request.kind, demo, data
    });
  } catch (err) {
    const reason = (err && err.reason) || "server";
    timing("failed (" + reason + ")", request.id, started);
    console.warn("Infolens request failed:", reason, err);
    await send(tabId, { type: "infolens-error", requestId: request.id, reason });
  }
}

function timing(label, requestId, started) {
  if (!DEBUG_TIMING) return;
  console.log("[Infolens timing] " + label + " | request " + requestId.slice(0, 8) +
    " | " + (Date.now() - started) + " ms since start");
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
    return { data: await loadSample(request), demo: true };
  }
  try {
    return { data: await callBackend(request), demo: false };
  } catch (err) {
    if (FALLBACK_TO_DEMO_ON_FAILURE && err && FALLBACK_REASONS.includes(err.reason)) {
      console.warn("Infolens back-end unavailable, showing demonstration data:", err.reason);
      return { data: await loadSample(request), demo: true };
    }
    throw err;
  }
}

// ---- Demonstration data (no network) ----

function normalizeText(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// If the selection is one of the demo claims (or part of one), return that
// claim's sample result from demo_responses.json. Otherwise null.
async function findDemoClaim(text) {
  try {
    const res = await fetch(chrome.runtime.getURL("demo_responses.json"));
    const list = (await res.json()).claims || [];
    const selected = normalizeText(text);
    if (selected.length < MIN_CHARS) return null;
    for (const item of list) {
      const claim = normalizeText(item.claim);
      if (claim && (selected.includes(claim) || claim.includes(selected))) return item.response;
    }
  } catch (err) {
    console.warn("Infolens could not read demo_responses.json:", err);
  }
  return null;
}

// The short wait is intentional so the "Verifying content" state can be seen.
async function loadSample(request) {
  await sleep(DEMO_DELAY_MS);
  if (request.kind === "text") {
    const hit = await findDemoClaim(request.text);
    if (hit) return hit;
  }
  const res = await fetch(chrome.runtime.getURL("sample_response.json"));
  return res.json();
}

// ---- Real back-end ----

async function callBackend(request) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(request)),
        signal: controller.signal
      });
    } catch (err) {
      // Connection refused, offline, or our own time limit.
      throw failure(timedOut ? "timeout" : "network", String(err));
    }
    let body = null;
    try {
      body = JSON.parse(await res.text());
    } catch (err) {
      if (timedOut) throw failure("timeout", "no complete reply in time");
      body = null; // not JSON; classifyReply decides what that means
    }
    return classifyReply(res.status, body);
  } finally {
    clearTimeout(timer);
  }
}
