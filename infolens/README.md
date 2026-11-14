# Infolens

A Chrome extension that shows credibility indicators (content type, content tone, and information status) for selected text or images. Infolens assists your judgment. It does not give a final verdict.

## Folders

| Folder | What it holds |
|---|---|
| `extension/` | The Chrome extension (Manifest V3). Loaded unpacked in Chrome. |
| `backend/` | The FastAPI service the extension calls at `http://localhost:8000/analyze`. |
| `dev-tools/` | The mock back-end and demo recording helpers used for testing. |
| `scripts/` | Helper scripts, including the secrets check. |

## Setup (back-end)

Requires Python 3.10 or newer.

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
# Open .env and paste your own Tavily API key.
```

Run the Phase 0 checks:

```bash
pytest
```

## API key safety

- The Tavily API key lives only in `backend/.env`, which is git-ignored.
- The key is read in one place: `backend/app/config.py`.
- The key is never placed in the extension, in code, or in logs.
- Before every commit, run `bash scripts/check_secrets.sh`.
- If a key is ever committed, revoke it in the Tavily dashboard and create a new one. Git history keeps old values.

## Demo mode

The extension ships in demo mode (`USE_SAMPLE_DATA = true` in `extension/background.js`). Demo results are always labeled "Demonstration data" and do not come from the back-end.

## Status

Back-end is being built phase by phase. This file will be completed in the final phase.
