# Infolens extension (prototype v0.4, Tavily-ready)

## Load it in Chrome
1. Unzip this folder.
2. Open chrome://extensions and turn on Developer mode (top right).
3. Click Load unpacked and choose the unzipped infolens-extension folder (the one containing manifest.json).
4. Open any normal web page (not a chrome:// page), select a sentence (or right-click an image), right-click, and choose Analyze Information.

## Demonstration mode (the default, no back-end needed)
`USE_SAMPLE_DATA = true` in background.js. Nothing goes over the network. The result comes from demo_responses.json when the selection matches one of the demo claims on demo/demo-page.html, and from sample_response.json otherwise. The card says "Demonstration data" at the bottom, so it is never mistaken for a real assessment.

What you will see, in one continuous panel:
1. **Verifying content** with four dots in a gentle wave (about 1.4 seconds in demo mode).
2. **Content Analyzed** with a green check (held for about 1.1 seconds).
3. **Analysis card** with the five elements in order: ANALYSIS, SUPPORTING SOURCES (each title is a link), CONTENT TYPE, CONTENT TONE, INFORMATION STATUS.

The demo set has 7 entries: the 5 claims on the demo page, plus an Estancia dengue news post (text, and the news picture). The Estancia text matches the sentence "Estancia recorded 460 dengue cases, including eight deaths, from Jan. 4 to Oct. 10, 2026". The picture matches by its address: an image whose address contains `fbcdn.net` (Facebook) or `dailyguardian.com.ph` shows the Estancia result. In demonstration mode that means any Facebook-hosted picture shows it, so delete `"fbcdn.net"` from `image_match` in demo_responses.json if that causes confusion. The sources are real articles and pages, checked on 28 Oct 2026. Verify the figures once more before the defense.

Close the card with the x button or the Escape key. Starting another analysis while one is showing restarts the sequence; results from an earlier run are ignored.

## When something goes wrong
The popup overlay shows a short message instead of a result:

| Message | When | Try again button |
|---|---|---|
| Search limit reached | the search allowance (Tavily credits for the month) is used up | no |
| Infolens is busy | too many searches in a short time (Tavily's per-minute limit) | yes |
| No sources found | nothing to show for this text | no |
| Could not reach Infolens | the service is off or unreachable | yes |
| Something went wrong | the service returned a problem | yes |
| This is taking too long | no answer within 20 seconds | yes |
| Select a little more text | fewer than 10 characters selected | no |
| Nothing selected | no selection and no image | no |
| This image cannot be analyzed directly | a blob: image or an unusable address | no |
| This image is too large | an embedded image over 5 MB | no |
| Please select again | Try again was pressed but the last selection was lost | no |

If the answer arrives but has no sources, the normal card is shown and the sources section says "No supporting sources were found for this content."

"Try again" repeats the last request without reselecting. The extension keeps that request in memory only. If Chrome has stopped the extension's background worker in the meantime, the message "Please select again" appears instead.

If verification takes longer than about 8 seconds, a quiet line ("Still verifying. This is taking longer than usual.") fades in under the dots and the panel grows a little.

## Connect to the real back-end
1. Open background.js and change `USE_SAMPLE_DATA = true` to `USE_SAMPLE_DATA = false`.
2. Start the back-end: uvicorn app.main:app --reload (it must run on port 8000).
3. Refresh the extension and try again.

Everything the extension assumes about the back-end (what it sends, which error signals it understands) sits in one marked section at the top of background.js: `buildRequestBody`, `ERROR_CODE_REASONS` and `classifyReply`. When the API contract changes, edit only that section.

### Search service: Tavily
The extension never talks to the search service. Only the back-end does, so moving from Google Custom Search to Tavily changes nothing in the extension except how two situations are told apart. The back-end should answer like this:

| Situation | HTTP status | JSON body | The person sees |
|---|---|---|---|
| Normal result | 200 | `analysis_paragraph`, `sources` (title and url), `content_type`, `content_tone`, `information_status` | the analysis card |
| Nothing found | 200 | `error_code: "no_results"`, no analysis | No sources found |
| Monthly allowance used up | 429 | `error_code: "quota_exceeded"` | Search limit reached |
| Too many searches per minute | 429 | `error_code: "rate_limited"` (a plain 429 works too) | Infolens is busy, with Try again |
| Anything else that fails | 500 or similar | anything | Something went wrong, with Try again |

Notes for the back-end (Tavily facts checked on 28 Oct 2026):
- The free plan has 1,000 credits a month. A basic search costs 1 credit and an advanced search costs 2, so use basic depth and one search per analysis.
- Tavily's REST page documents 429 only for sending requests too quickly (20 per minute). It does not say how an exhausted monthly plan is reported, so test that case and map it to `quota_exceeded`. Do not pass a 429 through as `quota_exceeded` unless the credits are really gone.
- Each result has a title, url, content, and score. Use title and url for the `sources` list, content for the similarity step, and score only to order results. Keep the 40/30/30 weighting for the credibility indicators.
- `include_domains` can limit a search to trusted domains if needed.
- Send a short, claim-sized search query, not the full 5,000 characters. Cache results so repeated demo runs cost no credits.

Current request: `{ text, image_base64, language_hint }`, plus `image_url` when an image address is sent.

If the back-end is off, the overlay shows "Could not reach Infolens". To show demonstration data instead in that case, set `FALLBACK_TO_DEMO_ON_FAILURE = true`. That applies to network, server, and slow cases only (never to the search limit or the busy message), and the result is still labeled as demonstration data.

## Images
- A normal web image (http or https): the extension sends only its address as `image_url`, and the back-end fetches it. The extension does not download or read the image, so it needs no extra permissions. This does not work for images behind a login.
- An embedded image (data: address): sent as `image_base64`, up to 5 MB.
- A blob: image: cannot be reached from outside the page, so a message explains this.
- In demonstration mode, an image always gets the labeled sample result.

## Measure the real wait time
1. In background.js set `DEBUG_TIMING = true` and `USE_SAMPLE_DATA = false`. Start the back-end. Refresh the extension.
2. Open chrome://extensions, click "service worker" on the Infolens card to open its Console, then run each claim on the demo page.
3. Each run prints lines starting with "[Infolens timing]". The last one ("response received" or "failed") shows the milliseconds since the request started. Copy the numbers into a table like this:

| Claim | Text length | Result | Milliseconds |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

Set `DEBUG_TIMING` back to `false` afterward.

## After you change any file
Go to chrome://extensions and click the refresh icon on the Infolens card. Then reload the web page you are testing on.

## Files
- manifest.json: permissions, settings, icons
- background.js: right-click menu, request handling, error classification, demo or back-end result
- content.js: the popup overlay (the three phases, the analysis card, error messages)
- sample_response.json: the default demonstration result
- demo_responses.json: demonstration results for the demo claims (text matches by claim, images by `image_match`)
- demo/: demo-page.html, DEMO_CHECKLIST.md, RECORDING_GUIDE.md
- icons/: the supplied AnalyzeInfo_black_icon.png and AnalyzeInfo_white_icon.png, plus square 16/32/48/128 versions (black-*.png, white-*.png). The manifest uses the black set.

The mock back-end for testing is in a separate download (infolens-dev-tools.zip). It is not part of the extension.

## Known limitations
- **Context-menu icon.** Chrome's native context menu cannot attach a custom PNG to an individual item, and an extension cannot detect the browser theme from its background script. The entry therefore shows as text ("Analyze Information"). The manifest uses the black icon, so it may be hard to see on a dark menu. To try the white one, point the "icons" entries in manifest.json at icons/white-*.png. Theme-aware switching is not implemented.
- **Pages where Chrome blocks extensions** (chrome:// pages, the Web Store, and files opened from disk) cannot show the overlay. Serve the demo page with a small local server (see demo/DEMO_CHECKLIST.md).
- **Back-end must support images.** Image requests need the back-end to accept `image_url` and `image_base64`. Until it does, real mode shows "Something went wrong" for images.
- **Fonts.** The overlay uses fonts already on your computer (no remote fonts), so letter shapes differ a little from the reference artwork.
- **Window size.** The overlay is placed at the top right. Very small windows scale it down instead of reflowing it.

## Debugging
- Overlay does not appear: open chrome://extensions, click "service worker" on the Infolens card, and read the Console.
- Nothing happens on a page: Chrome blocks extensions on chrome:// pages and the Web Store. Use a normal site.
- Real mode shows "Could not reach Infolens": the back-end is off or on another port.
