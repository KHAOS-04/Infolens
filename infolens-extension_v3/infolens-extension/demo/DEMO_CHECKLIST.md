# Infolens demo checklist

Use this before the technical defense. Tick each line.

## One day before
- [ ] Replace the placeholder claims in `demo-page.html` with items from the real test set, and update the same claims in `../demo_responses.json`.
- [ ] Decide the mode for the day (see "Which mode" below) and write it down.
- [ ] Record the backup video (see `RECORDING_GUIDE.md`).
- [ ] Charge the laptop and test the projector and sound.

## Before you start
- [ ] Reload the extension: `chrome://extensions`, click the refresh icon on the Infolens card.
- [ ] Open the demo page from this folder. Chrome does not run extensions on files opened from disk, so serve it:
      `python -m http.server 8080` (run inside the `demo` folder), then open `http://localhost:8080/demo-page.html`.
- [ ] Check which mode is active in `background.js`:
  - `USE_SAMPLE_DATA = true` means demonstration mode. The card says "Demonstration data".
  - `USE_SAMPLE_DATA = false` means the real back-end. It needs the back-end running on port 8000.
- [ ] Real mode only: start the back-end, confirm it answers, and confirm the search quota (the free tier is 100 queries a day, so do not spend it on rehearsals).
- [ ] Real mode only: run each of the 5 claims once so the back-end's cache is warm. Repeated runs then do not use up the daily quota and are faster.
- [ ] Close other tabs, hide bookmarks, set the browser zoom so the card is readable from the back of the room.

## Order to present
1. Claim 1 (guava leaves and dengue): the main example, it matches the reference design.
2. Claim 3 (neutral fact): shows a "Supported" result.
3. Claim 2 (news-style): shows a "not yet widely confirmed" result.
4. Claim 5 (Taglish) and Claim 4 (Filipino): shows language support.
5. The image: right-click the image to show the image path.
6. If time allows, show one failure message (for example, stop the back-end and run a claim).

## If the API fails during the demo
- Stay calm and say what is happening, for example: "The search service is not responding, so I will switch to our labeled demonstration mode."
- Option A: set `USE_SAMPLE_DATA = true`, reload the extension, reload the page, continue. The card says "Demonstration data". Say so out loud.
- Option B: play the backup recording and say it is a recording.
- Do not present demonstration data or the recording as a live result.

## After the demo
- [ ] Set `USE_SAMPLE_DATA` back to the value the team agreed on.
- [ ] Note any problems for the next sprint.
