# Infolens dev tools

These help you test the extension without the real back-end or the API key. They are **not** part of the extension and are not needed for the defense.

## Mock back-end (`mock_backend.py`)

Python 3.8 or newer, no packages to install.

```
python mock_backend.py
```

It listens on http://localhost:8000/analyze, the same address the extension uses in real mode. Stop the real back-end first if it runs on port 8000. To use another port: `python mock_backend.py --port 8001` (then change `API_URL` in background.js and add that port to `host_permissions` in manifest.json).

Every answer is labeled as mock data. It does not check anything.

To use it: in the extension's background.js set `USE_SAMPLE_DATA = false`, refresh the extension on chrome://extensions, then select text on a normal web page.

### Trigger each situation

Start the selected text with a keyword in square brackets, for example `[slow6] Boiled guava leaves can cure dengue.` (at least 10 characters in total).

| Keyword | What the extension should show |
|---|---|
| (none) or `[ok]` | the normal card after about 0.4 seconds |
| `[slow2]` `[slow6]` `[slow12]` | the normal card after 2, 6, or 12 seconds. At 12 seconds the quiet "Still verifying" line shows first |
| `[slow25]` | "This is taking too long" after 20 seconds, with Try again |
| `[quota]` | "Search limit reached", no Try again (the monthly allowance is used up) |
| `[ratelimit]` | "Infolens is busy", with Try again (too many searches per minute) |
| `[rate429]` | "Infolens is busy", with Try again (a plain 429 with no error code) |
| `[noresults]` | "No sources found" |
| `[empty-sources]` | the normal card, sources section says no sources were found |
| `[error500]` | "Something went wrong", with Try again |
| `[badjson]` | "Something went wrong", with Try again |
| `[failonce]` | "Something went wrong" the first time, and Try again then works |
| (stop the mock) | "Could not reach Infolens", with Try again |
| a selection under 10 characters | "Select a little more text" |

For images, the keyword goes after a hash at the end of the image address, for example `https://example.org/a.png#[quota]`. The mock only sees it if the image address really ends that way, so the easiest way to test is a small page whose image address ends like that. `[noimage]` makes the mock refuse image requests, which should show "Something went wrong".

`http://localhost:8000/last-request` shows the last request body the mock received, which is useful to confirm what the extension sends (text, `image_url`, or `image_base64`).

## Record a demo-mode video (`record_demo.js`, optional)

Records a video of the extension running in **labeled demonstration mode** (the card says "Demonstration data"). It is a convenient offline fallback. It is not a recording of the real system, so do not present it as one. For a recording of the real system, follow `demo/RECORDING_GUIDE.md`.

```
npm install playwright
npx playwright install chromium
node record_demo.js ../infolens-extension
```

The video is saved in `recordings/` (two files appear: the larger one is the demo, the tiny one is an empty start page). Keep `USE_SAMPLE_DATA = true` in background.js, and make sure nothing else uses port 8000 while it runs.
