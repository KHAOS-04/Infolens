
(() => {
  try {
    if (typeof window.__infolensCleanup === "function") window.__infolensCleanup();
  } catch (e) {

  }

  const HOST_ID = "infolens-host";
  const MIN_VERIFY_MS = 700;   // "Verifying content" is always visible at least this long
  const DONE_HOLD_MS = 1100;   // "Content Analyzed" stays this long before the card
  const WATCHDOG_MS = 30000;   // never sit on "Verifying content" longer than this
  const LEAVE_MS = 200;

  const STYLE = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }

    .panel {
      --u: 0.76px;
      --maxh: calc(100vh - 42px);
      --ease: cubic-bezier(.2, .8, .2, 1);
      --fg: #f6f6f8;
      --fg-soft: #dcdae0;
      --fg-dim: rgba(255, 255, 255, .62);
      --solid: #323035;
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      width: calc(472 * var(--u)); max-width: calc(100vw - 24px);
      color: var(--fg);
      font-family: "Work Sans", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: calc(21 * var(--u)); line-height: 1.38;
      -webkit-font-smoothing: antialiased;
      background: rgba(50, 48, 53, .94);
      -webkit-backdrop-filter: blur(14px) saturate(140%);
      backdrop-filter: blur(14px) saturate(140%);
      border: 1px solid rgba(255, 255, 255, .72);
      border-radius: calc(36 * var(--u));
      box-shadow: 0 18px 48px rgba(0, 0, 0, .38), 0 3px 10px rgba(0, 0, 0, .22),
                  inset 0 1px 0 rgba(255, 255, 255, .07);
      overflow: hidden;
      animation: enter .4s var(--ease) both;
    }
    .panel.leaving { animation: leave ${LEAVE_MS}ms ease forwards; }
    @media (max-width: 520px) {
      .panel { --u: 0.62px; top: 12px; right: 12px; }
    }
    @keyframes enter { from { opacity: 0; transform: translateY(-8px) scale(.985); } to { opacity: 1; transform: none; } }
    @keyframes leave { to { opacity: 0; transform: translateY(-6px) scale(.985); } }

    .sr-only {
      position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    /* The viewport grows and shrinks between states; views sit on top of each other. */
    .viewport { position: relative; overflow: hidden; transition: height .5s cubic-bezier(.32, .72, 0, 1); }
    .viewport.no-anim { transition: none; }
    .view {
      position: absolute; top: 0; left: 0; width: 100%;
      opacity: 0; visibility: hidden; pointer-events: none;
      transform: translateY(6px) scale(.985); transform-origin: 50% 0;
      transition: opacity .26s ease, transform .42s var(--ease), visibility 0s linear .42s;
    }
    .view.is-active {
      opacity: 1; visibility: visible; pointer-events: auto; transform: none;
      transition: opacity .3s ease .12s, transform .45s var(--ease) .12s, visibility 0s;
    }

    /* ---- Status states (same text position in both, so the swap reads as one panel) ---- */
    .status { text-align: center; padding: calc(30 * var(--u)) calc(20 * var(--u)) 0; }
    .status-text {
      margin: 0; font-size: calc(43 * var(--u)); line-height: calc(56 * var(--u));
      font-weight: 400; color: #fff; white-space: nowrap;
    }
    .v-verify { height: calc(150 * var(--u)); }
    .v-done { height: calc(165 * var(--u)); }

    .dots { display: flex; justify-content: center; gap: calc(13 * var(--u));
      margin-top: calc(22 * var(--u)); height: calc(16 * var(--u)); }
    .dot { width: calc(16 * var(--u)); height: calc(16 * var(--u)); border-radius: 50%;
      background: #fff; opacity: .5; animation: wave 1.3s ease-in-out infinite; }
    .dot:nth-child(2) { animation-delay: .16s; }
    .dot:nth-child(3) { animation-delay: .32s; }
    .dot:nth-child(4) { animation-delay: .48s; }
    .v-verify:not(.is-active) .dot { animation-play-state: paused; }
    @keyframes wave {
      0%, 58%, 100% { transform: translateY(0) scale(1); opacity: .5; }
      28% { transform: translateY(calc(-4 * var(--u))) scale(1.12); opacity: 1; }
    }

    .check { display: block; width: calc(46 * var(--u)); height: calc(46 * var(--u));
      margin: calc(10 * var(--u)) auto 0; transform: scale(.72); opacity: 0;
      transition: transform .5s var(--ease), opacity .25s ease; }
    .v-done.is-active .check { transform: none; opacity: 1; transition-delay: .2s; }
    .tick { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset .4s ease; }
    .v-done.is-active .tick { stroke-dashoffset: 0; transition-delay: .42s; }

    /* ---- Analysis card ---- */
    .v-analysis {
      max-height: var(--maxh); overflow-y: auto; overscroll-behavior: contain;
      padding: calc(34 * var(--u)) calc(28 * var(--u)) calc(38 * var(--u)) calc(24 * var(--u));
      scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .3) transparent;
    }
    .head { display: flex; align-items: center; gap: calc(10 * var(--u)); margin: 0; }
    .ico { flex: none; width: calc(43 * var(--u)); height: calc(42 * var(--u));
      display: flex; align-items: center; justify-content: center; }
    .ico svg { width: calc(42 * var(--u)); height: calc(42 * var(--u)); display: block; overflow: visible; }
    .ico .ln { fill: none; stroke: #fff; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    h1.head-title, .head-title {
      margin: 0; font-size: calc(39 * var(--u)); line-height: 1.1; font-weight: 800; letter-spacing: -.005em; color: #fff;
    }
    .head-label { margin: 0; font-size: calc(22.5 * var(--u)); line-height: 1.2; font-weight: 700;
      letter-spacing: .004em; color: #fff; }
    .v-analysis.is-active .sec {
      animation: sec-in .55s var(--ease) both;
      animation-delay: calc(.2s + var(--i, 0) * .06s);
    }
    @keyframes sec-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    .sec + .sec { margin-top: calc(30 * var(--u)); }
    .sec.s-analysis + .sec { margin-top: calc(26 * var(--u)); }

    .analysis { margin: calc(17 * var(--u)) 0 0 calc(16 * var(--u)); font-size: calc(22 * var(--u));
      line-height: calc(29 * var(--u)); color: var(--fg); overflow-wrap: anywhere; white-space: pre-line; }

    .sources { margin: calc(6 * var(--u)) 0 0; padding: 0 0 0 calc(77 * var(--u));
      font-size: calc(18.5 * var(--u)); line-height: calc(26 * var(--u)); }
    .sources li { margin: 0; padding: 0; overflow-wrap: anywhere; }
    .sources li::marker { color: #fff; }
    .sources a { color: #fff; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: .16em; }
    .sources a:hover { text-decoration-thickness: 2px; }
    .sources a:focus-visible, .close:focus-visible {
      outline: 2px solid #fff; outline-offset: 2px; border-radius: 3px; }
    .sources .none { color: var(--fg-soft); list-style: none; margin-left: calc(-15 * var(--u)); }

    .row { display: flex; align-items: center; gap: calc(10 * var(--u)); }
    .row .txt { min-width: 0; overflow-wrap: anywhere; }
    .val { margin-left: calc(8 * var(--u)); font-size: calc(25 * var(--u)); font-weight: 400; color: #fff; }
    .info .ico { width: calc(38 * var(--u)); }
    .info .ico svg { width: calc(38 * var(--u)); height: calc(38 * var(--u)); }
    .status-value { margin: calc(8 * var(--u)) 0 0 calc(48 * var(--u)); font-size: calc(19 * var(--u));
      line-height: calc(26 * var(--u)); color: var(--fg); overflow-wrap: anywhere; }

    .foot { margin-top: calc(30 * var(--u)); font-size: calc(14.5 * var(--u)); line-height: 1.45; color: var(--fg-dim); }
    .foot p { margin: 0; }
    .foot p + p { margin-top: calc(6 * var(--u)); }
    .foot .demo { color: #efc87a; font-weight: 600; }

    /* ---- Error ---- */
    .v-error { padding: calc(32 * var(--u)) calc(60 * var(--u)) calc(34 * var(--u)) calc(30 * var(--u)); }
    .err-title { margin: 0; font-size: calc(30 * var(--u)); line-height: 1.2; font-weight: 700; color: #fff; }
    .err-msg { margin: calc(10 * var(--u)) 0 0; font-size: calc(21 * var(--u)); line-height: calc(29 * var(--u)); color: var(--fg); }

    /* ---- Close (only on the card and on errors, the reference has no other controls) ---- */
    .close {
      position: absolute; top: calc(16 * var(--u)); right: calc(18 * var(--u)); z-index: 2;
      width: calc(40 * var(--u)); height: calc(40 * var(--u)); min-width: 26px; min-height: 26px;
      padding: 0; border: 0; border-radius: 50%; cursor: pointer; color: #fff;
      background: rgba(255, 255, 255, .1); display: flex; align-items: center; justify-content: center;
      opacity: 0; visibility: hidden; transition: opacity .25s ease, background .2s ease, visibility 0s linear .25s;
    }
    .close svg { width: 46%; height: 46%; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; fill: none; }
    .close:hover { background: rgba(255, 255, 255, .2); }
    .panel[data-view="analysis"] .close, .panel[data-view="error"] .close {
      opacity: .85; visibility: visible; transition-delay: .4s, 0s, 0s; }

    @media (prefers-reduced-motion: reduce) {
      .panel, .panel.leaving { animation: none; }
      .viewport, .view, .view.is-active, .check, .tick, .close { transition: none !important; }
      .view, .view.is-active { transform: none; }
      .v-analysis.is-active .sec { animation: none; }
      .check { transform: none; opacity: 1; }
      .tick { stroke-dashoffset: 0; }
      .dot { animation: none; opacity: .85; }
    }
  `;

  // ---------------------------------------------------------------------------
  // Small DOM helpers. Text is only ever set with textContent, never as HTML.
  // ---------------------------------------------------------------------------
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(viewBox, parts) {
    const root = document.createElementNS(SVG_NS, "svg");
    root.setAttribute("viewBox", viewBox);
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("focusable", "false");
    parts.forEach(([tag, attrs]) => {
      const n = document.createElementNS(SVG_NS, tag);
      Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
      root.appendChild(n);
    });
    return root;
  }

  const line = (d) => ["path", { d, class: "ln" }];

  // Minimal line icons, drawn inline (no external icon library).
  const ICONS = {
    bulb: () => svg("0 0 24 24", [
      line("M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6V16c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z"),
      line("M9.8 11l2.2 1.7 2.2-1.7"), line("M12 12.7V16"), line("M9.6 19h4.8"), line("M10.4 21.5h3.2")
    ]),
    layers: () => svg("0 0 24 24", [
      line("M3 7.2 12 3.5l9 3.7-9 3.8z"), line("M3 11.4l9 3.8 9-3.8"), line("M3 15.6l9 3.8 9-3.8")
    ]),
    puzzle: () => svg("0 0 24 24", [
      line("M5 7h4a2 2 0 0 1 4 0h4v3a2 2 0 0 1 0 4v5H5v-4a2 2 0 0 0 0-4z")
    ]),
    megaphone: () => svg("0 0 24 24", [
      line("M3.5 10v4h3l7 4.5v-13L6.5 10h-3z"), line("M16.6 9.4a3.6 3.6 0 0 1 0 5.2"), line("M19.2 6.8a7.2 7.2 0 0 1 0 10.4")
    ]),
    info: () => svg("0 0 24 24", [
      ["circle", { cx: "12", cy: "12", r: "11", fill: "#fff" }],
      ["circle", { cx: "12", cy: "7.6", r: "1.35", fill: "#323035" }],
      ["rect", { x: "10.8", y: "10.4", width: "2.4", height: "7.4", rx: "1.1", fill: "#323035" }]
    ]),
    check: () => {
      const s = svg("0 0 24 24", [
        ["circle", { cx: "12", cy: "12", r: "12", fill: "#00c800" }],
        ["path", { d: "M6.4 12.6l3.7 3.7 7.5-8", class: "tick", pathLength: "1", fill: "none",
          stroke: "#fff", "stroke-width": "3.2", "stroke-linecap": "round", "stroke-linejoin": "round" }]
      ]);
      s.setAttribute("class", "check");
      return s;
    },
    close: () => svg("0 0 24 24", [["path", { d: "M6 6l12 12M18 6L6 18" }]])
  };

  // Only plain web links are allowed.
  function safeUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  function str(value, max) {
    return typeof value === "string" ? value.slice(0, max) : "";
  }

  // Accept only the fields we expect, as bounded strings.
  function normalize(data) {
    const d = data && typeof data === "object" ? data : {};
    const sources = Array.isArray(d.sources) ? d.sources.slice(0, 12) : [];
    return {
      analysis: str(d.analysis_paragraph, 4000).trim(),
      type: str(d.content_type, 120).trim(),
      tone: str(d.content_tone, 120).trim(),
      status: str(d.information_status, 160).trim(),
      notice: str(d.notice, 400).trim(),
      sources: sources.map((s) => ({
        title: str(s && s.title, 300).trim(),
        url: str(s && s.url, 2000).trim()
      }))
    };
  }

  const ERRORS = {
    empty: ["Nothing selected", "Select some text, or right-click an image, then choose Analyze Information."],
    "image-unsupported": ["Image analysis is not available yet", "This version can analyze selected text only."],
    timeout: ["This is taking too long", "Verification did not finish. Please try again."],
    network: ["Could not reach Infolens", "We could not reach Infolens. Please check your internet connection and try again."]
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let state = "idle";        // idle | verifying | resolving | analyzed | result | error
  let currentId = null;
  let verifyStartedAt = 0;
  let ui = null;
  let resizeObserver = null;
  let leaveTimer = null;
  const timers = new Set();

  function later(fn, ms) {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  }

  function clearTimers() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  }

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------
  function ensureUi() {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    if (ui && ui.host.isConnected) {
      ui.panel.classList.remove("leaving");
      return ui;
    }
    removeHost();

    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);

    const panel = el("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Infolens credibility indicators");
    panel.dataset.view = "verify";

    const live = el("div", "sr-only");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");

    const close = el("button", "close");
    close.type = "button";
    close.setAttribute("aria-label", "Close Infolens");
    close.appendChild(ICONS.close());
    close.addEventListener("click", closeOverlay);

    const viewport = el("div", "viewport no-anim");

    const verify = el("section", "view v-verify");
    verify.appendChild(statusBlock("Verifying content", (box) => {
      const dots = el("div", "dots");
      dots.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 4; i++) dots.appendChild(el("span", "dot"));
      box.appendChild(dots);
    }));

    const done = el("section", "view v-done");
    done.appendChild(statusBlock("Content Analyzed", (box) => box.appendChild(ICONS.check())));

    const analysis = el("section", "view v-analysis");
    const errorView = el("section", "view v-error");

    [verify, done, analysis, errorView].forEach((v) => viewport.appendChild(v));
    panel.appendChild(live);
    panel.appendChild(close);
    panel.appendChild(viewport);
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);

    ui = { host, panel, viewport, live, views: { verify, done, analysis, error: errorView }, active: null };

    // Keep the panel height right when text wraps differently (resize, zoom).
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => syncHeight());
      Object.values(ui.views).forEach((v) => resizeObserver.observe(v));
    }
    window.addEventListener("resize", syncHeight);
    return ui;
  }

  function statusBlock(text, addExtra) {
    const box = el("div", "status");
    box.appendChild(el("p", "status-text", text));
    addExtra(box);
    return box;
  }

  function syncHeight() {
    if (!ui || !ui.active) return;
    const view = ui.views[ui.active];
    const maxH = Math.max(160, window.innerHeight - 42);
    ui.viewport.style.height = Math.min(view.offsetHeight, maxH) + "px";
  }

  // Switch the visible view. The height change and the cross-fade run together.
  function show(name, announce) {
    if (!ui) return;
    Object.keys(ui.views).forEach((key) => ui.views[key].classList.toggle("is-active", key === name));
    ui.active = name;
    ui.panel.dataset.view = name;
    syncHeight();
    if (announce) ui.live.textContent = announce;
    // After the first layout, allow the height to animate.
    requestAnimationFrame(() => { if (ui) ui.viewport.classList.remove("no-anim"); });
  }

  function removeHost() {
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    window.removeEventListener("resize", syncHeight);
    const old = document.getElementById(HOST_ID);
    if (old) old.remove();
    ui = null;
  }

  function closeOverlay() {
    clearTimers();
    state = "idle";
    currentId = null;
    if (!ui) { removeHost(); return; }
    ui.panel.classList.add("leaving");
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => { leaveTimer = null; removeHost(); }, LEAVE_MS);
  }

  // ---------------------------------------------------------------------------
  // Analysis card
  // ---------------------------------------------------------------------------
  function headRow(icon, text, asTitle) {
    const row = el("div", "head");
    const box = el("span", "ico");
    box.appendChild(icon);
    row.appendChild(box);
    const label = el(asTitle ? "h2" : "h3", asTitle ? "head-title" : "head-label", text);
    row.appendChild(label);
    return row;
  }

  function sectionBox(index, extra) {
    const s = el("div", "sec " + (extra || ""));
    s.style.setProperty("--i", String(index));
    return s;
  }

  // Five elements, in the order of the reference: ANALYSIS, SUPPORTING SOURCES,
  // CONTENT TYPE, CONTENT TONE, INFORMATION STATUS. No numeric scores are shown.
  function renderAnalysis(model, isDemo) {
    const view = ui.views.analysis;
    view.replaceChildren();
    view.scrollTop = 0;

    const s1 = sectionBox(0, "s-analysis");
    s1.appendChild(headRow(ICONS.bulb(), "ANALYSIS", true));
    s1.appendChild(el("p", "analysis", model.analysis || "No analysis text was returned."));
    view.appendChild(s1);

    const s2 = sectionBox(1);
    s2.appendChild(headRow(ICONS.layers(), "SUPPORTING SOURCES"));
    const list = el("ul", "sources");
    model.sources.forEach((s) => {
      const href = safeUrl(s.url);
      if (!href && !s.title) return;
      const li = el("li");
      if (href) {
        const a = el("a", null, s.title || href);
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.title = href;
        li.appendChild(a);
      } else {
        li.appendChild(el("span", null, s.title));
      }
      list.appendChild(li);
    });
    if (!list.children.length) list.appendChild(el("li", "none", "No sources were found."));
    s2.appendChild(list);
    view.appendChild(s2);

    const pair = (index, icon, label, value) => {
      const s = sectionBox(index);
      const row = el("div", "row");
      const box = el("span", "ico");
      box.appendChild(icon);
      row.appendChild(box);
      const txt = el("div", "txt");
      txt.appendChild(el("span", "head-label", label));
      txt.appendChild(el("span", "val", value || "Not available"));
      row.appendChild(txt);
      s.appendChild(row);
      return s;
    };
    view.appendChild(pair(2, ICONS.puzzle(), "CONTENT TYPE:", model.type));
    view.appendChild(pair(3, ICONS.megaphone(), "CONTENT TONE:", model.tone));

    const s5 = sectionBox(4);
    const infoRow = el("div", "row info");
    const infoIcon = el("span", "ico");
    infoIcon.appendChild(ICONS.info());
    infoRow.appendChild(infoIcon);
    infoRow.appendChild(el("h3", "head-label", "INFORMATION STATUS:"));
    s5.appendChild(infoRow);
    s5.appendChild(el("p", "status-value", model.status || "Not available"));
    view.appendChild(s5);

    // Small notes at the bottom. Demonstration data is always labeled as such.
    const foot = sectionBox(5, "foot");
    if (isDemo) {
      foot.appendChild(el("p", "demo",
        "Demonstration data. This sample result is not based on your selection and is not a real credibility assessment."));
    }
    if (model.notice) foot.appendChild(el("p", null, model.notice));
    foot.appendChild(el("p", null, "Infolens assists your judgment. It does not give a final verdict."));
    view.appendChild(foot);
  }

  function renderError(reason) {
    const pair = ERRORS[reason] || ERRORS.network;
    const view = ui.views.error;
    view.replaceChildren();
    view.appendChild(el("h2", "err-title", pair[0]));
    view.appendChild(el("p", "err-msg", pair[1]));
  }

  function showError(reason) {
    ensureUi();
    renderError(reason);
    state = "error";
    show("error", (ERRORS[reason] || ERRORS.network).join(". "));
  }

  // ---------------------------------------------------------------------------
  // Flow control (the state machine)
  // ---------------------------------------------------------------------------
  function startVerifying(requestId) {
    clearTimers();
    currentId = requestId;
    ensureUi();
    ui.views.analysis.replaceChildren();
    state = "verifying";
    verifyStartedAt = Date.now();
    show("verify", "Verifying content");
    later(() => {
      if (currentId === requestId && state === "verifying") showError("timeout");
    }, WATCHDOG_MS);
  }

  function handleResult(message) {
    if (message.requestId !== currentId || state !== "verifying") return; // stale or duplicate
    const id = currentId;
    clearTimers(); // cancels the watchdog
    state = "resolving";

    let model;
    try {
      model = normalize(message.data);
      renderAnalysis(model, message.demo === true);
    } catch (err) {
      console.warn("Infolens could not draw the result:", err);
      showError("network");
      return;
    }

    const wait = Math.max(0, MIN_VERIFY_MS - (Date.now() - verifyStartedAt));
    later(() => {
      if (currentId !== id) return;
      state = "analyzed";
      show("done", "Content analyzed");
      later(() => {
        if (currentId !== id) return;
        state = "result";
        show("analysis", "Analysis ready");
      }, DONE_HOLD_MS);
    }, wait);
  }

  function handleError(message) {
    const reason = typeof message.reason === "string" ? message.reason : "network";
    if (message.immediate === true) {
      clearTimers();
      currentId = message.requestId;
      showError(reason);
      return;
    }
    if (message.requestId !== currentId) return; // stale
    if (state !== "verifying" && state !== "resolving") return;
    clearTimers();
    showError(reason);
  }

  function onMessage(message, sender, sendResponse) {
    if (!message || typeof message.type !== "string") return;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return;
    switch (message.type) {
      case "infolens-ping":
        sendResponse({ ok: true });
        return;
      case "infolens-loading":
        if (typeof message.requestId === "string") startVerifying(message.requestId);
        return;
      case "infolens-result":
        if (typeof message.requestId === "string") handleResult(message);
        return;
      case "infolens-error":
        if (typeof message.requestId === "string") handleError(message);
        return;
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape" && ui) closeOverlay();
  }

  chrome.runtime.onMessage.addListener(onMessage);
  document.addEventListener("keydown", onKeydown);

  window.__infolensCleanup = () => {
    clearTimers();
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (e) { /* ignore */ }
    document.removeEventListener("keydown", onKeydown);
    removeHost();
    state = "idle";
    currentId = null;
    delete window.__infolensCleanup;
  };
})();
