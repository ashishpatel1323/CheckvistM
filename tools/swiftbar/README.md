# Checkvist menu-bar timer (SwiftBar)

Mirror the app's global timer — the running Execute task, the active routine step, or the idle
"nothing is being tracked" countdown — in the macOS menu bar.

## How it works

The web app (kept open in a browser tab) publishes a live snapshot of the timer to a public
[ntfy.sh](https://ntfy.sh) topic. This SwiftBar plugin polls the same topic and ticks the elapsed
time locally every second. There is **no backend of our own** — ntfy is an open pub/sub service with
CORS enabled, so the browser can publish and the plugin can read with no account or API key.

```
Browser tab  ──POST──▶  ntfy.sh/<topic>  ──GET (poll)──▶  this plugin  ──▶  menu bar
```

The topic name is the only "key" — anyone who knows it can read the snapshot, so it's randomly
generated per user. When the tab closes, no fresh snapshots arrive and the plugin shows
"not tracking" once the last snapshot is older than 90s (via the snapshot's `updatedAt`). It is
**display-only** and read-only — it never controls the app.

> Note: ntfy.sh is a free public service. The data is non-sensitive (an activity name + elapsed
> time). If you'd rather not use the public instance you can self-host ntfy and point both the app
> and `VAR_NTFY_SERVER` at it.

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

3. In the app (web), open the **Menu bar timer** panel (the monitor icon in the header) and copy the
   **Menu bar topic**.

4. In SwiftBar → the plugin's settings, set:
   - `VAR_NTFY_TOPIC` → the Menu bar topic
   - `VAR_NTFY_SERVER` → leave as `https://ntfy.sh` (only change if self-hosting ntfy)

5. Keep the app tab open. Start an Execute task or routine and watch the menu bar update within ~15s.

## Indicators

- `▶ 12:34 · Task name` — Execute timer (indigo)
- `🔁 03:10 · Step name` — routine step (emerald)
- `● 02:40 idle` — nothing tracked, counting to the 5-min alert (amber → red)
- `⏸ …` — paused · `… · OVER` (red) — overrunning the estimate/duration
- `– not tracking` — app tab closed or no fresh snapshot

## Troubleshooting

- **Always "not tracking"**: confirm the app tab is open and the topic matches exactly. Test the
  topic directly (replace `TOPIC`):
  ```sh
  NOW=$(($(date +%s)*1000))
  curl -d '{"mode":"idle","label":"test","updatedAt":'"$NOW"'}' https://ntfy.sh/TOPIC
  curl -s 'https://ntfy.sh/TOPIC/json?poll=1'
  ```
