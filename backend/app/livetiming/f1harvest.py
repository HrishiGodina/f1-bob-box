import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

from .f1auth import LOGIN_URL, TOKEN_FILE, _login_listener, _token_expiry

MIN_VALID_SECONDS = 24 * 3600
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


def _current_expiry() -> Optional[float]:
    if not TOKEN_FILE.exists():
        return None
    return _token_expiry(TOKEN_FILE.read_text().strip())


def refresh() -> None:
    exp = _current_expiry()
    if exp and exp > time.time() + MIN_VALID_SECONDS:
        stamp = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(exp))
        print(f"Token valid until {stamp} — no action.")
        return
    print("Token missing or expiring soon — refreshing via browser sign-in ...")
    port, wait = _login_listener(timeout=600)
    url = LOGIN_URL.format(port=port)
    subprocess.Popen(["open", url])
    print(f"Opened {url} in your default browser — complete the sign-in there.")
    holder = wait()
    token = holder.get("token")
    if not token:
        print("No token received; token not updated.")
        raise SystemExit(1)
    TOKEN_FILE.write_text(token)
    expires = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(_token_expiry(token) or 0))
    print(f"Token saved to {TOKEN_FILE} (expires {expires})")
    restart_backend()


def restart_backend() -> None:
    cmd = ["lsof", "-tiTCP:8000", "-sTCP:LISTEN"]
    pid = subprocess.run(cmd, capture_output=True, text=True).stdout.strip()
    if pid:
        subprocess.run(["kill", pid])
        time.sleep(2)
    subprocess.Popen(
        ["uv", "run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(BACKEND_DIR),
        stdout=open(BACKEND_DIR.parent / "backend.log", "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print("Backend restarted.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "refresh"
    if cmd == "refresh":
        refresh()
    elif cmd == "restart-backend":
        restart_backend()
    else:
        print("usage: python -m app.livetiming.f1harvest [refresh|restart-backend]")
