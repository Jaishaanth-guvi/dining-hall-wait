#!/usr/bin/env python3
"""Shared state for the Ridge Hall lunch board. No accounts."""

import json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlparse

from forecast import apply_shorten, board_for

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
STATE_PATH = ROOT / "data" / "state.json"
PORT = 8765
LOCK = Lock()

EMPTY = {"lineDelta": 0, "moves": {}, "joined": 0, "served": 0}


def load_state():
    if not STATE_PATH.exists():
        return {"lineDelta": 0, "moves": {}, "joined": 0, "served": 0}
    try:
        data = json.loads(STATE_PATH.read_text())
    except json.JSONDecodeError:
        return {"lineDelta": 0, "moves": {}, "joined": 0, "served": 0}
    data.setdefault("lineDelta", 0)
    data.setdefault("moves", {})
    data.setdefault("joined", 0)
    data.setdefault("served", 0)
    return data


def save_state(data):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(data))


def shift_key(start, dest):
    return f"{start}:{dest}"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            with LOCK:
                self._send(200, load_state())
            return
        if parsed.path == "/api/board":
            raw = parse_qs(parsed.query).get("at", ["70"])[0]
            try:
                at = int(raw)
            except ValueError:
                at = 70
            with LOCK:
                self._send(200, board_for(at, load_state()))
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(min(length, 10_000)) if length else b"{}"
        try:
            body = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "Expected JSON."})
            return

        with LOCK:
            state = load_state()
            if path == "/api/join":
                state["lineDelta"] = int(state["lineDelta"]) + 1
                state["joined"] = int(state["joined"]) + 1
            elif path == "/api/served":
                state["lineDelta"] = int(state["lineDelta"]) - 1
                state["served"] = int(state["served"]) + 1
            elif path == "/api/shorten":
                start = body.get("from")
                dest = body.get("to")
                if not isinstance(start, int) or not isinstance(dest, int):
                    self._send(400, {"error": "Bad shorten."})
                    return
                if apply_shorten(state, start, dest) is None:
                    self._send(400, {"error": "This time cannot be shortened."})
                    return
            elif path == "/api/move":
                start = body.get("from")
                dest = body.get("to")
                delta = body.get("delta", 0)
                if (
                    not isinstance(start, int)
                    or not isinstance(dest, int)
                    or not isinstance(delta, int)
                    or not (0 <= start <= 180 and 0 <= dest <= 180)
                    or start == dest
                    or delta not in (-1, 1)
                ):
                    self._send(400, {"error": "Bad move."})
                    return
                key = shift_key(start, dest)
                nxt = int(state["moves"].get(key, 0)) + delta
                if nxt <= 0:
                    state["moves"].pop(key, None)
                elif nxt > 400:
                    self._send(400, {"error": "Too many moves."})
                    return
                else:
                    state["moves"][key] = nxt
            elif path == "/api/reset":
                state = {"lineDelta": 0, "moves": {}, "joined": 0, "served": 0}
            else:
                self._send(404, {"error": "Not found."})
                return
            save_state(state)
            self._send(200, state)

    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith("GET /api") or (
            args and str(args[0]).startswith("POST /api")
        ):
            return
        super().log_message(fmt, *args)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Ridge Hall lunch board  http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
