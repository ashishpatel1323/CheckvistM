import Cocoa

// Native macOS menu-bar app that mirrors the Checkvist web app's global timer.
// It polls a public ntfy.sh topic (the app publishes there) every ~15s and ticks the live
// elapsed once a second. Display-only. Config is read from ~/.checkvist-timer.json:
//   { "server": "https://ntfy.sh", "topic": "checkvist-timer-...." }
// The topic comes from the app's "Menu bar timer" panel.

final class TimerController: NSObject {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

    var server = "https://ntfy.sh"
    var topic = ""
    var snapshot: [String: Any]?
    var lastFetch = Date.distantPast
    let fetchInterval: TimeInterval = 15
    let staleAfter: TimeInterval = 90

    let labelItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let subItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let elapsedItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let topicItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")

    override init() {
        super.init()
        loadConfig()
        buildMenu()
        let t = Timer(timeInterval: 1.0, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        RunLoop.main.add(t, forMode: .common)
        tick()
    }

    func configPath() -> String {
        (NSHomeDirectory() as NSString).appendingPathComponent(".checkvist-timer.json")
    }

    func loadConfig() {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: configPath())),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let s = obj["server"] as? String, !s.isEmpty { server = s }
        if let tp = obj["topic"] as? String { topic = tp }
    }

    func buildMenu() {
        let menu = NSMenu()
        for item in [labelItem, subItem, elapsedItem, topicItem] {
            item.isEnabled = false
            menu.addItem(item)
        }
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem.menu = menu
    }

    @objc func quit() { NSApp.terminate(nil) }

    @objc func tick() {
        if Date().timeIntervalSince(lastFetch) >= fetchInterval || snapshot == nil {
            lastFetch = Date()
            fetch()
        }
        render()
    }

    func fetch() {
        loadConfig() // re-read so a changed topic applies without a restart
        guard !topic.isEmpty,
              let url = URL(string: "\(server)/\(topic)/json?poll=1&since=15m") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let text = String(data: data, encoding: .utf8) else { return }
            var latest: [String: Any]?
            for line in text.split(separator: "\n") {
                guard let ld = line.data(using: .utf8),
                      let evt = try? JSONSerialization.jsonObject(with: ld) as? [String: Any],
                      (evt["event"] as? String) == "message",
                      let msg = evt["message"] as? String,
                      let md = msg.data(using: .utf8),
                      let snap = try? JSONSerialization.jsonObject(with: md) as? [String: Any],
                      snap["mode"] != nil else { continue }
                latest = snap // messages arrive oldest→newest; keep the last
            }
            if let latest {
                DispatchQueue.main.async { self.snapshot = latest; self.render() }
            }
        }.resume()
    }

    func fmt(_ sec: Double) -> String {
        let s = max(0, Int(sec))
        let h = s / 3600, m = (s % 3600) / 60, ss = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, ss) : String(format: "%02d:%02d", m, ss)
    }

    func setTitle(_ text: String, color: NSColor?) {
        guard let btn = statusItem.button else { return }
        if let color {
            btn.attributedTitle = NSAttributedString(
                string: text,
                attributes: [.foregroundColor: color,
                             .font: NSFont.menuBarFont(ofSize: 0)])
        } else {
            btn.title = text
        }
    }

    func render() {
        guard statusItem.button != nil else { return }
        guard !topic.isEmpty else { setTitle("⚙ set up timer", color: .secondaryLabelColor); return }

        let nowMs = Date().timeIntervalSince1970 * 1000
        let updatedAt = snapshot?["updatedAt"] as? Double ?? 0
        let fresh = snapshot != nil && (nowMs - updatedAt) <= staleAfter * 1000

        topicItem.isHidden = false
        topicItem.title = "Topic: \(topic)"

        guard fresh, let snap = snapshot else {
            setTitle("– not tracking", color: .secondaryLabelColor)
            labelItem.isHidden = false
            labelItem.title = "App tab closed or no fresh snapshot"
            subItem.isHidden = true
            elapsedItem.isHidden = true
            return
        }

        let mode = snap["mode"] as? String ?? "idle"
        let base = snap["baseSec"] as? Double ?? 0
        let started = (snap["startedAtMs"] as? Double ?? nowMs) / 1000
        let paused = snap["isPaused"] as? Bool ?? false
        let overrun = snap["isOverrun"] as? Bool ?? false
        let target = snap["targetSec"] as? Double ?? 0
        let label = snap["label"] as? String ?? ""
        let elapsed = paused ? base : base + max(0, Date().timeIntervalSince1970 - started)

        var icon = "●"
        if mode == "execute" { icon = "▶" } else if mode == "routine" { icon = "🔁" }
        if paused { icon = "⏸" }

        let title: String
        if mode == "idle" {
            title = "\(icon) \(fmt(elapsed)) idle"
        } else {
            let short = label.count > 24 ? String(label.prefix(23)) + "…" : label
            title = "\(icon) \(fmt(elapsed)) · \(short)" + (overrun ? " · OVER" : "")
        }
        setTitle(title, color: overrun ? .systemRed : nil)

        labelItem.isHidden = false
        labelItem.title = label
        if let sub = snap["sublabel"] as? String, !sub.isEmpty {
            subItem.isHidden = false
            subItem.title = sub
        } else {
            subItem.isHidden = true
        }
        elapsedItem.isHidden = false
        elapsedItem.title = target > 0 ? "Elapsed \(fmt(elapsed)) / \(fmt(target))" : "Elapsed \(fmt(elapsed))"
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // menu-bar agent: no Dock icon
let controller = TimerController()
app.run()
