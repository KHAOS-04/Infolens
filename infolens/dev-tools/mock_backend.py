#!/usr/bin/env python3
"""Mock Infolens back-end for testing the extension. Standard library only.

This is a development tool. It is NOT the real back-end and it does not check
anything. Every answer it gives is labeled as mock data.

Run:    python mock_backend.py            (listens on http://localhost:8000)
        python mock_backend.py --port 8001

Pick a scenario by starting the selected text with a keyword in square brackets,
for example:  [slow6] Boiled guava leaves can cure dengue.
For an image request, put the keyword at the end of the image address after a
hash, for example:  https://example.org/pic.png#[quota]

Keywords:
  [ok]            normal answer after about 0.4 seconds (also the default)
  [slow2] [slow6] [slow12] [slow25]   normal answer after that many seconds
  [quota]         HTTP 429 with error_code "quota_exceeded" (monthly allowance used up)
  [ratelimit]     HTTP 429 with error_code "rate_limited" (too many searches per minute)
  [rate429]       HTTP 429 with no error_code (what a back-end passing Tavily's 429 through sends)
  [noresults]     error_code "no_results" and no analysis
  [empty-sources] normal answer with an empty sources list
  [error500]      HTTP 500
  [badjson]       HTTP 200 with a body that is not valid JSON
  [failonce]      HTTP 500 the first time this exact text is sent, then normal
  [noimage]       HTTP 422 when the request carries image_url or image_base64

Also: GET /last-request shows the last request body this server received.
"""
import argparse
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"last": None, "seen": {}}
LOCK = threading.Lock()
KEYWORD = re.compile(r"\[([a-z0-9-]+)\]", re.I)


def mock_result(note):
    return {
        "analysis_paragraph": "MOCK DATA from dev-tools/mock_backend.py. This is not a real credibility "
                              "assessment. " + note,
        "sources": [
            {"title": "Mock source one (example.org)", "url": "https://example.org/mock-1"},
            {"title": "Mock source two with a longer title to check wrapping (example.org)",
             "url": "https://example.org/mock-2"},
        ],
        "content_type": "Mock Type",
        "content_tone": "Mock Tone",
        "information_status": "Mock Status",
        "notice": None,
    }


def pick_scenario(body):
    """The keyword comes from the start of the text, or the end of the image address."""
    text = (body.get("text") or "").strip()
    m = re.match(r"\[([a-z0-9-]+)\]", text, re.I)
    if m:
        return m.group(1).lower()
    url = body.get("image_url") or ""
    m = re.search(r"#\[([a-z0-9-]+)\]$", url, re.I)
    return m.group(1).lower() if m else "ok"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[mock] " + (fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")

    def _reply(self, status, payload, raw=None):
        data = raw if raw is not None else json.dumps(payload).encode("utf-8")
        try:
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            print("[mock] client went away before the reply was sent")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/last-request":
            with LOCK:
                self._reply(200, STATE["last"])
        else:
            self._reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path.split("?")[0] != "/analyze":
            self._reply(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except ValueError:
            self._reply(400, {"error": "request was not JSON"})
            return
        with LOCK:
            STATE["last"] = body

        scenario = pick_scenario(body)
        has_image = bool(body.get("image_url") or body.get("image_base64"))
        text = body.get("text") or ""
        print("[mock] scenario=%s image=%s text=%r" % (scenario, has_image, text[:60]))

        delay = {"ok": 0.4, "slow2": 2, "slow6": 6, "slow12": 12, "slow25": 25}.get(scenario)
        if delay is None:
            delay = 0.2
        time.sleep(delay)

        note = "Request text: " + (text[:80] if text else "(image request)")
        if scenario == "quota":
            self._reply(429, {"error_code": "quota_exceeded"})
        elif scenario == "ratelimit":
            self._reply(429, {"error_code": "rate_limited"})
        elif scenario == "rate429":
            self._reply(429, {"detail": "Too many requests"})
        elif scenario == "noresults":
            self._reply(200, {"error_code": "no_results", "analysis_paragraph": None, "sources": []})
        elif scenario == "error500":
            self._reply(500, {"error": "mock server error"})
        elif scenario == "badjson":
            self._reply(200, None, raw=b"{this is not valid json")
        elif scenario == "noimage" and has_image:
            self._reply(422, {"detail": "image fields are not supported by this mock"})
        elif scenario == "failonce":
            with LOCK:
                key = text or body.get("image_url") or "image"
                STATE["seen"][key] = STATE["seen"].get(key, 0) + 1
                first = STATE["seen"][key] == 1
            if first:
                self._reply(500, {"error": "mock failure, the next try will work"})
            else:
                self._reply(200, mock_result(note))
        elif scenario == "empty-sources":
            result = mock_result(note)
            result["sources"] = []
            self._reply(200, result)
        else:
            self._reply(200, mock_result(note))


def main():
    parser = argparse.ArgumentParser(description="Mock Infolens back-end (testing only)")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("Mock Infolens back-end on http://localhost:%d/analyze  (Ctrl+C to stop)" % args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
