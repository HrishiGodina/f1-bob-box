import base64
import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

TOKEN_FILE = Path(__file__).resolve().parent.parent.parent / ".f1auth.json"
LOGIN_URL = "https://f1login.fastf1.dev?port={port}"
REFRESH_WINDOW_SECONDS = 24 * 3600


class RefreshCoordinator:
    """Runs one browser-sign-in listener at a time; start() is idempotent
    while a sign-in is pending, and a received token is saved to TOKEN_FILE."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._url: Optional[str] = None
        self._done = threading.Event()

    def start(self, timeout: float = 300.0) -> str:
        with self._lock:
            if self._url and not self._done.is_set():
                return self._url
            self._done = threading.Event()
            port, wait = _login_listener(timeout)
            self._url = LOGIN_URL.format(port=port)
            threading.Thread(target=self._finish, args=(wait,), daemon=True).start()
            return self._url

    def _finish(self, wait) -> None:
        holder = wait()
        token = holder.get("token")
        if token:
            TOKEN_FILE.write_text(token)
        self._done.set()

    @property
    def waiting(self) -> bool:
        return self._url is not None and not self._done.is_set()


refresh_coordinator = RefreshCoordinator()


def _token_expiry(token: str) -> Optional[float]:
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return float(json.loads(base64.urlsafe_b64decode(payload)).get("exp"))
    except Exception:
        return None


def get_subscription_token() -> Optional[str]:
    token = os.environ.get("F1TV_SUBSCRIPTION_TOKEN")
    if not token and TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text().strip()
    if token and _token_expiry(token) and _token_expiry(token) > time.time():
        return token
    return None


def _login_listener(timeout: float, inspect: bool = False):
    received = threading.Event()
    holder = {}

    class Handler(BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self):
            self.send_response(200)
            self._cors()
            self.end_headers()

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            parsed = json.loads(unquote(data.get("loginSession", "")))
            holder["token"] = parsed.get("data", {}).get("subscriptionToken")
            if inspect:
                holder["parsed"] = parsed
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            received.set()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def wait():
        received.wait(timeout)
        server.shutdown()
        return holder

    return port, wait


def run_login_flow(inspect: bool = False, open_browser: bool = False) -> Optional[str]:
    port, wait = _login_listener(timeout=600, inspect=inspect)
    url = LOGIN_URL.format(port=port)
    print("Open this URL in your browser and sign in with your Formula1/F1TV account:")
    print(f"  {url}")
    if open_browser:
        subprocess.Popen(["open", url])
        print("(opened in your default browser)")
    print("Waiting for sign-in (Ctrl+C to cancel) ...")
    holder = wait()
    if inspect:
        parsed = holder.get("parsed") or {}
        print("loginSession top-level keys:", sorted(parsed.keys()))
        print("loginSession data keys:", sorted((parsed.get("data") or {}).keys()))
        return None
    token = holder.get("token")
    if not token:
        print("No token received.")
        raise SystemExit(1)
    TOKEN_FILE.write_text(token)
    print(f"Token saved to {TOKEN_FILE}")
    return token


if __name__ == "__main__":
    import sys

    run_login_flow(inspect="--inspect" in sys.argv, open_browser="--open" in sys.argv)
