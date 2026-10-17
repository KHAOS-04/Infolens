# Infolens extension (prototype v0.1)

## Load it in Chrome
1. Unzip this folder.
2. Open chrome://extensions and turn on Developer mode (top right).
3. Click Load unpacked and choose the unzipped infolens-extension folder (the one containing manifest.json).
4. Open any normal web page (not a chrome:// page), select some text, right-click, and choose Analyze Information.

## After you change any file
Go to chrome://extensions and click the refresh icon on the Infolens card. Then reload the web page you are testing on.

## Connect to the real back-end (Monday or whenever Reynaldo's /analyze works)
1. Open background.js and change `USE_SAMPLE_DATA = true` to `USE_SAMPLE_DATA = false`.
2. Start the back-end: uvicorn app.main:app --reload (it must run on port 8000).
3. Refresh the extension and try again.

## Files
- manifest.json: permissions and settings
- background.js: right-click menu and the request to the back-end
- content.js: the popup overlay (loading, results, error)
- sample_response.json: fake results used while the back-end is not ready. Replace it with the real contract from Reynaldo's /docs if the fields change.

## Debugging
- Overlay does not appear: open chrome://extensions, click "service worker" on the Infolens card, and read the Console.
- Nothing happens on a page: Chrome blocks extensions on chrome:// pages and the Web Store. Use a normal site.
- Real mode shows the connection message: the back-end is off, on another port, or returned an error.
