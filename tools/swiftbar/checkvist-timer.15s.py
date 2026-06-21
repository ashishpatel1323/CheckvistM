#!/usr/bin/env python3
# <xbar.title>Checkvist Timer</xbar.title>
# <xbar.version>1.0</xbar.version>
# <xbar.author>Checkvist</xbar.author>
# <xbar.desc>Mirrors the Checkvist web app's global timer (execute / routine / idle) in the menu bar.</xbar.desc>
# <xbar.dependencies>python3</xbar.dependencies>
#
# <swiftbar.type>streamable</swiftbar.type>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.var>string(VAR_NTFY_TOPIC=""): The "Menu bar topic" from the app's Menu bar timer panel</swiftbar.var>
# <swiftbar.var>string(VAR_NTFY_SERVER="https://ntfy.sh"): ntfy server (only change if self-hosting)</swiftbar.var>
#
# Streaming plugin: polls the latest snapshot from a public ntfy.sh topic every ~15s and re-renders
# the live elapsed once a second in between. No backend of our own — the app publishes the snapshot
# to the same topic. Configure VAR_NTFY_TOPIC in SwiftBar's plugin settings and keep the app tab open.

import json
import os
import sys
import time
import urllib.request

FETCH_INTERVAL = 15  # seconds between network polls
STALE_AFTER = 90     # seconds without a fresh snapshot before showing "not tracking"

SERVER = (os.environ.get("VAR_NTFY_SERVER") or "https://ntfy.sh").rstrip("/")
TOPIC = (os.environ.get("VAR_NTFY_TOPIC") or "").strip()

INDIGO = "#6366F1"
EMERALD = "#10B981"
AMBER = "#F59E0B"
RED = "#EF4444"
GRAY = "#9CA3AF"


def fmt(sec):
    sec = max(0, int(sec))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def fetch():
    """Return the most recent snapshot dict published to the topic, or None."""
    if not TOPIC:
        return None
    url = f"{SERVER}/{TOPIC}/json?poll=1&since=15m"
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            latest = None
            for line in resp.read().decode("utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    evt = json.loads(line)
                except ValueError:
                    continue
                if evt.get("event") != "message" or "message" not in evt:
                    continue
                try:
                    snap = json.loads(evt["message"])
                except ValueError:
                    continue
                if isinstance(snap, dict) and snap.get("mode"):
                    latest = snap  # messages arrive oldest→newest; keep the last
            return latest
    except Exception:
        return None


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
    if not TOPIC:
        print("⚙ set up timer | color=%s" % GRAY)
        print("---")
        print("Set VAR_NTFY_TOPIC in SwiftBar plugin settings")
        return

    if not snap or (time.time() * 1000 - snap.get("updatedAt", 0)) > STALE_AFTER * 1000:
        print("– not tracking | color=%s" % GRAY)
        print("---")
        print("App tab closed or no fresh snapshot")
        print("Topic: %s | color=%s" % (TOPIC, GRAY))
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
