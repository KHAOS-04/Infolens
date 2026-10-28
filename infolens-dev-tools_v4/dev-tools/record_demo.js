// Records a video of the Infolens extension running in LABELED DEMONSTRATION MODE.
// It is not a recording of the real system. See README.md in this folder.
//
// Usage:  node record_demo.js <path to the infolens-extension folder>
// Needs:  npm install playwright   and   npx playwright install chromium
// Env:    HEADLESS=1 to run without a visible window.

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const extDir = path.resolve(process.argv[2] || "../infolens-extension");
const demoDir = path.join(extDir, "demo");
const outDir = path.resolve("recordings");
const PORT = 8000; // the extension is allowed to run on this port without a click
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serveDemoPage() {
  const server = http.createServer((req, res) => {
    const file = path.join(demoDir, "demo-page.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

(async () => {
  if (!fs.existsSync(path.join(extDir, "manifest.json"))) {
    console.error("manifest.json not found in " + extDir);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serveDemoPage();
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "infolens-rec-")), {
    channel: "chromium",
    headless: process.env.HEADLESS === "1",
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`]
  });

  let worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  await page.bringToFront();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: "http://localhost:8000/*" }))[0].id);

  const phase = () => page.evaluate(() => {
    const h = document.getElementById("infolens-host");
    return h ? h.shadowRoot.querySelector(".panel").dataset.view : "none";
  });
  const waitFor = async (name, ms = 15000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if ((await phase()) === name) return; await sleep(80); }
  };

  await sleep(1500);
  for (const id of ["claim-1", "claim-3", "claim-5"]) {
    const text = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const range = document.createRange(); range.selectNodeContents(el);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      return sel.toString();
    }, id);
    await sleep(900);
    // Calls the same function the right-click menu item calls.
    worker.evaluate(([tabId, text]) => handleMenuClick({ menuItemId: MENU_ID, selectionText: text }, { id: tabId }), [tabId, text]).catch(() => {});
    await waitFor("analysis");
    await sleep(3500);
    await page.keyboard.press("Escape");
    await sleep(700);
  }
  const src = await page.evaluate(() => document.getElementById("demo-image").src);
  worker.evaluate(([tabId, src]) => handleMenuClick({ menuItemId: MENU_ID, mediaType: "image", srcUrl: src }, { id: tabId }), [tabId, src]).catch(() => {});
  await waitFor("analysis");
  await sleep(3500);

  const video = page.video();
  await context.close();
  server.close();
  console.log("Saved demonstration-mode video: " + (video ? await video.path() : outDir));
})().catch((e) => { console.error(e); process.exit(1); });
