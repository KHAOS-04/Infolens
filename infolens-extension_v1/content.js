// Infolens extension, content script: draws the popup overlay inside a Shadow DOM
// so the web page's own CSS cannot break it. Shows loading, results, or an error.
(() => {
  if (window.__infolensLoaded) return;
  window.__infolensLoaded = true;

  const HOST_ID = "infolens-host";

  const STYLE = `
    :host { all: initial; }
    .panel {
      position: fixed; top: 16px; right: 16px; width: 360px; max-height: calc(100vh - 32px);
      overflow-y: auto; box-sizing: border-box; z-index: 2147483647;
      background: #ffffff; color: #1b2428; border: 1px solid #d9e0e3; border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.22);
      font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .header { display: flex; align-items: center; justify-content: space-between;
      background: #0f4c5c; color: #fff; padding: 10px 14px; border-radius: 12px 12px 0 0; }
    .title { font-weight: 700; font-size: 15px; letter-spacing: .02em; }
    .close { background: transparent; border: 0; color: #fff; font-size: 22px; line-height: 1;
      cursor: pointer; padding: 0 4px; }
    .close:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .body { padding: 14px; }
    .loading { display: flex; align-items: center; gap: 10px; color: #3d4b52; }
    .spinner { width: 18px; height: 18px; border: 3px solid #d9e0e3; border-top-color: #0f4c5c;
      border-radius: 50%; animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #5b676d;
      margin: 14px 0 4px; }
    .label:first-child { margin-top: 0; }
    .analysis { margin: 0; }
    .chips { display: flex; gap: 8px; }
    .chip { flex: 1; background: #f4f7f8; border: 1px solid #d9e0e3; border-radius: 8px; padding: 6px 8px; }
    .chip .k { display: block; font-size: 11px; color: #5b676d; }
    .chip .v { font-weight: 600; }
    .status { display: inline-block; font-weight: 700; padding: 5px 10px; border-radius: 999px;
      border: 1.5px solid currentColor; }
    .s-supported { color: #1f6b3d; background: #eaf6ee; }
    .s-partial { color: #1d5f8a; background: #e8f3fa; }
    .s-limited { color: #8a5200; background: #fff4e0; }
    .s-recent { color: #4a4f8a; background: #eeeefb; }
    .s-notsupported { color: #9a2a22; background: #fcecea; }
    .notice { margin-top: 12px; background: #fff7ea; border: 1px solid #e0b060; border-radius: 8px;
      padding: 8px 10px; font-size: 13px; }
    .sources { list-style: none; margin: 0; padding: 0; }
    .sources li { padding: 7px 0; border-top: 1px solid #e6ebed; }
    .sources li:first-child { border-top: 0; }
    .sources a { color: #0f4c5c; font-weight: 600; text-decoration: none; }
    .sources a:hover { text-decoration: underline; }
    .url { display: block; font-size: 12px; color: #5b676d; word-break: break-all; }
    .error { color: #9a2a22; }
    .foot { font-size: 11px; color: #5b676d; margin-top: 14px; }
  `;

  // Small helper to build elements safely (never inserts server text as HTML).
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function getRoot() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      document.documentElement.appendChild(host);
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLE;
      shadow.appendChild(style);
    }
    return host.shadowRoot;
  }

  function closeOverlay() {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
  }

  // Builds the panel frame (header + empty body) and returns the body element.
  function openPanel() {
    closeOverlay();
    const root = getRoot();
    const panel = el("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Infolens credibility indicators");

    const header = el("div", "header");
    header.appendChild(el("span", "title", "Infolens"));
    const close = el("button", "close", "×");
    close.setAttribute("aria-label", "Close Infolens");
    close.addEventListener("click", closeOverlay);
    header.appendChild(close);

    const body = el("div", "body");
    body.setAttribute("aria-live", "polite");
    panel.appendChild(header);
    panel.appendChild(body);
    root.appendChild(panel);
    return body;
  }

  function showLoading() {
    const body = openPanel();
    const row = el("div", "loading");
    row.appendChild(el("div", "spinner"));
    row.appendChild(el("span", null, "Verifying content..."));
    body.appendChild(row);
  }

  function showError() {
    const body = openPanel();
    body.appendChild(
      el("p", "error", "We could not reach Infolens. Please check your internet connection and try again.")
    );
  }

  function statusClass(status) {
    switch (status) {
      case "Supported": return "s-supported";
      case "Partially Supported": return "s-partial";
      case "Limited Evidence": return "s-limited";
      case "Recent or Not Yet Widely Confirmed": return "s-recent";
      case "Not Supported": return "s-notsupported";
      default: return "s-limited";
    }
  }

  // Only allow normal web links.
  function safeUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  // Shows the five elements in order: analysis paragraph, sources, content type,
  // content tone, information status. No numeric scores are ever shown.
  function showResult(data) {
    const body = openPanel();

    body.appendChild(el("div", "label", "Analysis"));
    body.appendChild(el("p", "analysis", data.analysis_paragraph || ""));

    body.appendChild(el("div", "label", "Supporting sources"));
    const list = el("ul", "sources");
    (data.sources || []).forEach((s) => {
      const li = el("li");
      const href = safeUrl(s.url);
      if (href) {
        const a = el("a", null, s.title || s.url);
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.appendChild(a);
      } else {
        li.appendChild(el("span", null, s.title || ""));
      }
      li.appendChild(el("span", "url", s.url || ""));
      list.appendChild(li);
    });
    if (!list.children.length) list.appendChild(el("li", null, "No sources were found."));
    body.appendChild(list);

    body.appendChild(el("div", "label", "Content"));
    const chips = el("div", "chips");
    const type = el("div", "chip");
    type.appendChild(el("span", "k", "Content type"));
    type.appendChild(el("span", "v", data.content_type || ""));
    const tone = el("div", "chip");
    tone.appendChild(el("span", "k", "Content tone"));
    tone.appendChild(el("span", "v", data.content_tone || ""));
    chips.appendChild(type);
    chips.appendChild(tone);
    body.appendChild(chips);

    body.appendChild(el("div", "label", "Information status"));
    body.appendChild(el("span", "status " + statusClass(data.information_status), data.information_status || ""));

    if (data.notice) body.appendChild(el("div", "notice", data.notice));

    body.appendChild(el("div", "foot", "Infolens assists your judgment. It does not give a final verdict."));
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "infolens-loading") showLoading();
    else if (message.type === "infolens-result") showResult(message.data || {});
    else if (message.type === "infolens-error") showError();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
  });
})();
