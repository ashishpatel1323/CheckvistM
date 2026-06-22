#!/usr/bin/env python3
# <xbar.title>Checkvist Timer</xbar.title>
# <xbar.version>2.0</xbar.version>
# <xbar.author>Checkvist</xbar.author>
# <xbar.desc>Mirrors the Checkvist web app's global timer (execute / routine / idle) in the menu bar.</xbar.desc>
# <xbar.dependencies>python3</xbar.dependencies>
#
# <swiftbar.type>streamable</swiftbar.type>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.var>string(VAR_CV_EMAIL=""): Your Checkvist account email</swiftbar.var>
# <swiftbar.var>string(VAR_CV_KEY=""): Your Checkvist API key (Profile → OpenAPI key)</swiftbar.var>
# <swiftbar.var>string(VAR_CV_LIST=""): List ID from the app's Menu bar timer panel</swiftbar.var>
# <swiftbar.var>string(VAR_CV_TASK=""): Task ID from the app's Menu bar timer panel</swiftbar.var>
# <swiftbar.var>string(VAR_CV_SERVER="https://checkvist.com"): Checkvist server (rarely changed)</swiftbar.var>
#
# Streaming plugin: logs into Checkvist with your API key, polls the single hidden task where the
# web app writes the timer snapshot every ~15s, and re-renders the live elapsed once a second in
# between. Display-only — it never writes. Configure the VAR_CV_* values in SwiftBar's plugin
# settings (List/Task IDs come from the app's "Menu bar timer" panel) and keep the app tab open.

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

FETCH_INTERVAL = 15  # seconds between network polls
STALE_AFTER = 150    # seconds without a fresh snapshot before showing "not tracking"
CONTENT_PREFIX = "CVTIMER1 "

SERVER = (os.environ.get("VAR_CV_SERVER") or "https://checkvist.com").rstrip("/")
EMAIL = (os.environ.get("VAR_CV_EMAIL") or "").strip()
KEY = (os.environ.get("VAR_CV_KEY") or "").strip()
LIST_ID = (os.environ.get("VAR_CV_LIST") or "").strip()
TASK_ID = (os.environ.get("VAR_CV_TASK") or "").strip()

INDIGO = "#6366F1"
EMERALD = "#10B981"
AMBER = "#F59E0B"
RED = "#EF4444"
GRAY = "#9CA3AF"

_token = None  # cached auth token for this streaming process


def configured():
    return bool(EMAIL and KEY and LIST_ID and TASK_ID)


def fmt(sec):
    sec = max(0, int(sec))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _post_form(path, fields):
    body = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(SERVER + path, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def login():
    """Log in with the API key and cache the token. Returns the token or None."""
    global _token
    obj = _post_form("/auth/login.json?version=2", {"username": EMAIL, "remote_key": KEY})
    _token = obj.get("token") if isinstance(obj, dict) else None
    return _token


def decode_snapshot(content):
    if not content or not content.startswith(CONTENT_PREFIX):
        return None
    b64 = content[len(CONTENT_PREFIX):].replace("-", "+").replace("_", "/")
    b64 += "=" * (-len(b64) % 4)  # restore base64 padding
    try:
        snap = json.loads(base64.b64decode(b64).decode("utf-8"))
    except Exception:
        return None
    return snap if isinstance(snap, dict) and snap.get("mode") else None


def _get_task(token):
    """GET the relay task; returns (snapshot_or_None, status_code)."""
    url = f"{SERVER}/checklists/{LIST_ID}/tasks/{TASK_ID}.json?token={urllib.parse.quote(token)}"
    req = urllib.request.Request(url)
    req.add_header("Cache-Control", "no-cache")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            obj = json.loads(resp.read().decode("utf-8"))
            # Checkvist returns the task as a single-element array, not a bare object.
            if isinstance(obj, list):
                obj = obj[0] if obj else {}
            return decode_snapshot(obj.get("content", "")), 200
    except urllib.error.HTTPError as e:
        return None, e.code
    except Exception:
        return None, 0


def fetch():
    """Return the most recent snapshot dict from the relay task, re-authenticating on 401."""
    if not configured():
        return None
    token = _token or login()
    if not token:
        return None
    snap, status = _get_task(token)
    if status == 401:  # token expired — log in again and retry once
        token = login()
        if token:
            snap, _ = _get_task(token)
    return snap


def elapsed_sec(snap):
    base = snap.get("baseSec", 0)
    if snap.get("isPaused"):
        return base
    started = snap.get("startedAtMs", 0) / 1000.0
    return base + max(0.0, time.time() - started)


def truncate(text, n=24):
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def render(snap):
    if not configured():
        print("⚙ set up timer | color=%s" % GRAY)
        print("---")
        print("Set VAR_CV_EMAIL / VAR_CV_KEY / VAR_CV_LIST / VAR_CV_TASK in SwiftBar plugin settings")
        return

    if not snap or (time.time() * 1000 - snap.get("updatedAt", 0)) > STALE_AFTER * 1000:
        print("– not tracking | color=%s" % GRAY)
        print("---")
        print("App tab closed or no fresh snapshot")
        print("Checkvist · list %s / task %s | color=%s" % (LIST_ID, TASK_ID, GRAY))
        return

    mode = snap.get("mode")
    elapsed = elapsed_sec(snap)
    target = snap.get("targetSec", 0)
    overrun = snap.get("isOverrun")
    paused = snap.get("isPaused")
    label = truncate(snap.get("label", ""))

    if mode == "execute":
        icon, color = "▶", INDIGO
    elif mode == "routine":
        icon, color = "🔁", EMERALD
    else:
        icon, color = "●", AMBER
    if overrun:
        color = RED
    if paused:
        icon = "⏸"

    if mode == "idle":
        title = f"{icon} {fmt(elapsed)} idle"
    else:
        title = f"{icon} {fmt(elapsed)} · {label}"
        if overrun:
            title += " · OVER"
    print(f"{title} | color={color}")

    print("---")
    print(snap.get("label", ""))
    if snap.get("sublabel"):
        print(f"{snap['sublabel']} | color={GRAY}")
    if target:
        print(f"Elapsed {fmt(elapsed)} / {fmt(target)} | color={GRAY}")
    else:
        print(f"Elapsed {fmt(elapsed)} | color={GRAY}")


def main():
    last_fetch = 0.0
    snap = None
    while True:
        now = time.time()
        if now - last_fetch >= FETCH_INTERVAL or snap is None:
            snap = fetch()
            last_fetch = now
        render(snap)
        print("~~~")  # SwiftBar streaming delimiter: flush this menu, await the next
        sys.stdout.flush()
        time.sleep(1)


if __name__ == "__main__":
    main()
