# Checkvist menu-bar timer (SwiftBar)

Mirror the app's global timer — the running Execute task, the active routine step, or the idle
"nothing is being tracked" countdown — in the macOS menu bar.

## How it works

The web app (kept open in a browser tab) writes a live snapshot of the timer into a single hidden,
**private** Checkvist task using the session you're already logged into. This SwiftBar plugin logs
into Checkvist with your own API key, polls that task, and ticks the elapsed time locally every
second. There is **no third-party relay** — the data stays inside your own Checkvist account, so
there are no message caps.

```
Browser tab ──PUT──▶ Checkvist task (hidden list) ──GET (poll, authed)──▶ this plugin ──▶ menu bar
```

The snapshot lives in one task whose `content` is the base64-encoded JSON. When the tab closes, no
fresh snapshots are written and the plugin shows "not tracking" once the last snapshot is older than
150s (via the snapshot's `updatedAt`). It is **display-only** and read-only — it never controls the
app and never writes to Checkvist.

## Mac setup

1. Install SwiftBar:
   ```sh
   brew install swiftbar
   ```
   Launch it and choose a plugins folder when prompted.

2. Copy the plugin into that folder and make it executable:
   ```sh
   cp tools/swiftbar/checkvist-timer.15s.py "$HOME/Library/Application Support/SwiftBar/Plugins/"
   chmod +x "$HOME/Library/Application Support/SwiftBar/Plugins/checkvist-timer.15s.py"
   ```

3. Get your **API key** from Checkvist → Profile → "OpenAPI key". In the web app, open the
   **Menu bar timer** panel (the monitor icon in the header) and note the **List ID** and **Task ID**
   (they appear after you start a timer once).

4. In SwiftBar → the plugin's settings, set:
   - `VAR_CV_EMAIL` → your Checkvist account email
   - `VAR_CV_KEY` → your Checkvist API key
   - `VAR_CV_LIST` → the List ID from the panel
   - `VAR_CV_TASK` → the Task ID from the panel
   - `VAR_CV_SERVER` → leave as `https://checkvist.com`

5. Keep the app tab open. Start an Execute task or routine and watch the menu bar update within ~15s.

## Indicators

- `▶ 12:34 · Task name` — Execute timer (indigo)
- `🔁 03:10 · Step name` — routine step (emerald)
- `● 02:40 idle` — nothing tracked, counting to the 5-min alert (amber → red)
- `⏸ …` — paused · `… · OVER` (red) — overrunning the estimate/duration
- `– not tracking` — app tab closed or no fresh snapshot

## Troubleshooting

- **Always "not tracking"**: confirm the app tab is open and the IDs match the panel. Test your
  credentials and the relay task directly (fill in the values):
  ```sh
  TOKEN=$(curl -s -d 'username=EMAIL&remote_key=KEY' 'https://checkvist.com/auth/login.json?version=2' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
  curl -s "https://checkvist.com/checklists/LIST/tasks/TASK.json?token=$TOKEN"
  ```
  The task's `content` should start with the marker `CVTIMER1` followed by a space and base64.
