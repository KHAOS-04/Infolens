# Recording guide for the backup video

Goal: a 60 to 90 second screen recording of the **real system** working. You play it only if the live demo cannot run. Present it as a recording, never as a live run.

## Before recording
- Start the back-end and confirm the search quota. Run each claim once first so the cache is warm.
- `USE_SAMPLE_DATA = false` in `background.js`, then reload the extension.
- Serve the demo page: `python -m http.server 8080` inside the `demo` folder, then open `http://localhost:8080/demo-page.html`.
- Use a clean browser window: hide the bookmarks bar, close other tabs, sign out of personal profiles.
- Set the screen to 1920 by 1080 and the browser zoom to 125 percent so the card is easy to read.
- Turn on Do Not Disturb so notifications do not appear.

## Shot list (about 75 seconds)
1. (5 s) Show `chrome://extensions` with Infolens enabled, then switch to the demo page.
2. (15 s) Claim 1: select it, right-click, choose Analyze Information. Let the three phases play. Pause 4 seconds on the card.
3. (10 s) Close the card. Claim 3: run it and pause on the result.
4. (10 s) Claim 5 (Taglish): run it and pause on the result.
5. (10 s) Image: right-click the image, choose Analyze Information, pause on the result.
6. (10 s) Click a source link to show that it opens a real page, then come back.
7. (10 s) One failure message: stop the back-end, run a claim, show the message, then start the back-end and press Try again if the message has that button.
8. (5 s) End on the card with the "Infolens assists your judgment" line visible.

Speak slowly, or add captions afterward. Do not read personal information aloud.

## Free tools on Windows
- **Xbox Game Bar**: press Windows key + G, then the record button. It records the Chrome window and saves to the Videos folder. Good enough for this.
- **OBS Studio**: free and more flexible (scenes, microphone, 1080p). Use "Display Capture" or "Window Capture".
- **Clipchamp** (built into Windows 11) or the **Photos** app: trim the start and end, add captions.

## After recording
- Watch it once fully. Check that no private tabs, names, or notifications appear.
- Save two copies: one on the laptop and one on a USB drive or cloud drive.
- Name it so it is clearly a recording, for example `infolens-backup-recording.mp4`.
