# Infolens extension (prototype v0.2)

## Load it in Chrome
1. Unzip this folder.
2. Open chrome://extensions and turn on Developer mode (top right).
3. Click Load unpacked and choose the unzipped infolens-extension folder (the one containing manifest.json).
4. Open any normal web page (not a chrome:// page), select some text (or right-click an image), right-click, and choose Analyze Information.

## Demonstration mode (the default, no back-end needed)
`USE_SAMPLE_DATA = true` in background.js. Nothing goes over the network. The result comes from sample_response.json, and the card says "Demonstration data" at the bottom so it is never mistaken for a real assessment. The sample result does not depend on what you selected.

What you will see, in one continuous panel:
1. **Verifying content** with four dots in a gentle wave (about 1.4 seconds in demo mode).
2. **Content Analyzed** with a green check (held for about 1.1 seconds).
3. **Analysis card** with the five elements in order: ANALYSIS, SUPPORTING SOURCES (each title is a link), CONTENT TYPE, CONTENT TONE, INFORMATION STATUS.

Close the card with the x button or the Escape key. Starting another analysis while one is showing simply restarts the sequence; results from an earlier run are ignored.

## After you change any file
Go to chrome://extensions and click the refresh icon on the Infolens card. Then reload the web page you are testing on.

## Connect to the real back-end (whenever Reynaldo's /analyze works)
1. Open background.js and change `USE_SAMPLE_DATA = true` to `USE_SAMPLE_DATA = false`.
2. Start the back-end: uvicorn app.main:app --reload (it must run on port 8000).
3. Refresh the extension and try again.

If the back-end is off, the card shows "Could not reach Infolens". If you would rather show demonstration data in that case, set `FALLBACK_TO_DEMO_ON_FAILURE = true`. The result is still labeled as demonstration data.

## Files
- manifest.json: permissions, settings, icons
- background.js: right-click menu, request handling, demo or back-end result
- content.js: the overlay (the three phases, the analysis card, errors)
- sample_response.json: sample results used in demonstration mode. Replace it with the real contract from Reynaldo's /docs if the fields change.
- icons/: the supplied AnalyzeInfo_black_icon.png and AnalyzeInfo_white_icon.png, plus square 16/32/48/128 versions (black-*.png, white-*.png). The manifest uses the black set.

## Known limitations
- **Context-menu icon.** Chrome's native context menu cannot attach a custom PNG to an individual item, and an extension cannot detect the browser theme from its background script. The entry therefore shows as text ("Analyze Information"). Chrome itself may draw the extension's manifest icon beside it; this is browser-controlled and was not checked. The manifest uses the black icon, so it may be hard to see on a dark menu. To try the white one, point the "icons" entries in manifest.json at icons/white-*.png. Theme-aware switching is not implemented.
- **Images.** Right-clicking an image starts the sequence, but the image is not downloaded or inspected. In demonstration mode you get the labeled sample result. In real mode the card says image analysis is not available yet.
- **Fonts.** The overlay uses fonts already on your computer (no remote fonts), so letter shapes differ a little from the reference artwork.
- **Pages where Chrome blocks extensions** (chrome:// pages, the Web Store) cannot show the overlay.
- **Window size.** The overlay is placed at the top right. Very small windows scale it down instead of reflowing it.

## Debugging
- Overlay does not appear: open chrome://extensions, click "service worker" on the Infolens card, and read the Console.
- Nothing happens on a page: Chrome blocks extensions on chrome:// pages and the Web Store. Use a normal site.
- Real mode shows the connection message: the back-end is off, on another port, or returned an error.
