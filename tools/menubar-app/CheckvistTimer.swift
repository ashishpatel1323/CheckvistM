import Cocoa

// Native macOS menu-bar app that mirrors the Checkvist web app's global timer.
// It logs into Checkvist with the user's own API key, polls a single hidden task (where the web app
// writes the snapshot) every ~15s, and ticks the live elapsed once a second. Display-only — it never
// writes. Config is read from ~/.checkvist-timer.json:
//   { "server": "https://checkvist.com", "email": "you@example.com",
//     "remoteKey": "your-openapi-key", "listId": 123456, "taskId": 7890123 }
// The auth token is cached in UserDefaults and refreshed automatically (Checkvist tokens last ~1 day).
//
// A menu option toggles an always-on-top split-flap FLIP CLOCK (white digits on charcoal tiles)
// showing the elapsed time, with a task label + progress bar on the right. The window can be made
// wider/narrower (menu items or by dragging the right-edge grip), and a "Show Details" toggle
// reduces both the window and the menu-bar title to just the timer. Preferences persist.

// Brand colours (match the web app's GlobalTimerBar).
let cExecute = NSColor(srgbRed: 0.39, green: 0.40, blue: 0.95, alpha: 1) // #6366F1
let cRoutine = NSColor(srgbRed: 0.06, green: 0.72, blue: 0.51, alpha: 1) // #10B981
let cIdle    = NSColor(srgbRed: 0.96, green: 0.62, blue: 0.04, alpha: 1) // #F59E0B
let cOver    = NSColor(srgbRed: 0.94, green: 0.27, blue: 0.27, alpha: 1) // #EF4444

/// Render a single character into a crisp 2× image, with its cap-height box centred in `size`.
func renderGlyph(_ ch: Character, size: NSSize, color: NSColor) -> CGImage? {
    let scale: CGFloat = 2
    let pxW = max(1, Int(size.width * scale))
    let pxH = max(1, Int(size.height * scale))
    guard let ctx = CGContext(data: nil, width: pxW, height: pxH, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.scaleBy(x: scale, y: scale)
    let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ns
    let f = NSFont.systemFont(ofSize: size.height * 0.74, weight: .bold)
    let attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: color]
    let s = String(ch) as NSString
    let sz = s.size(withAttributes: attrs)
    let x = (size.width - sz.width) / 2
    let y = size.height / 2 - f.capHeight / 2 + f.descender // centre the cap box on the tile centre
    s.draw(at: NSPoint(x: x, y: y), withAttributes: attrs)
    NSGraphicsContext.restoreGraphicsState()
    return ctx.makeImage()
}

let kTopRect = CGRect(x: 0, y: 0.5, width: 1, height: 0.5)
let kBottomRect = CGRect(x: 0, y: 0, width: 1, height: 0.5)

// MARK: - Flip-clock digit (split-flap)

/// One charcoal rounded tile showing a single character, split at the centre seam, with a two-phase
/// split-flap animation when the value changes.
final class FlipDigitView: NSView {
    let w: CGFloat
    let h: CGFloat
    let corner: CGFloat = 5
    let scale: CGFloat = NSScreen.main?.backingScaleFactor ?? 2
    let tileColor = NSColor(white: 0.15, alpha: 1)

    var current: Character = " "
    var digitColor = NSColor.white
    var currentImage: CGImage?

    let topHalf = CALayer()
    let bottomHalf = CALayer()
    let seam = CALayer()

    init(width: CGFloat, height: CGFloat) {
        w = width; h = height
        super.init(frame: NSRect(x: 0, y: 0, width: width, height: height))
        wantsLayer = true
        var persp = CATransform3DIdentity
        persp.m34 = -1 / 500
        layer?.sublayerTransform = persp

        configHalf(topHalf, top: true)
        configHalf(bottomHalf, top: false)
        seam.backgroundColor = NSColor.black.withAlphaComponent(0.55).cgColor
        seam.frame = CGRect(x: 0, y: h / 2 - 0.75, width: w, height: 1.5)
        layer?.addSublayer(bottomHalf)
        layer?.addSublayer(topHalf)
        layer?.addSublayer(seam)
    }
    required init?(coder: NSCoder) { fatalError() }

    func topCorners() -> CACornerMask { [.layerMinXMaxYCorner, .layerMaxXMaxYCorner] }
    func bottomCorners() -> CACornerMask { [.layerMinXMinYCorner, .layerMaxXMinYCorner] }

    func configHalf(_ half: CALayer, top: Bool) {
        half.backgroundColor = tileColor.cgColor
        half.cornerRadius = corner
        half.masksToBounds = true
        half.maskedCorners = top ? topCorners() : bottomCorners()
        half.contentsGravity = .resize
        half.contentsScale = scale
        half.frame = top ? CGRect(x: 0, y: h / 2, width: w, height: h / 2)
                         : CGRect(x: 0, y: 0, width: w, height: h / 2)
        half.contentsRect = top ? kTopRect : kBottomRect
    }

    func setColor(_ c: NSColor) {
        guard c != digitColor else { return }
        digitColor = c
        if currentImage != nil, current != " " {
            currentImage = renderGlyph(current, size: NSSize(width: w, height: h), color: c)
            topHalf.contents = currentImage
            bottomHalf.contents = currentImage
        }
    }

    func setDigit(_ d: Character, animated: Bool) {
        guard d != current || currentImage == nil else { return }
        current = d
        let newImg = renderGlyph(d, size: NSSize(width: w, height: h), color: digitColor)
        currentImage = newImg
        // No flip animation — just refresh both halves in place.
        CATransaction.begin(); CATransaction.setDisableActions(true)
        topHalf.contents = newImg
        bottomHalf.contents = newImg
        CATransaction.commit()
    }
}

// MARK: - Flip clock (MM:SS, expands to H:MM:SS)

final class FlipClockView: NSView {
    var scale: CGFloat = 1
    var tileW: CGFloat { 26 * scale }
    var tileH: CGFloat { 42 * scale }
    var tileGap: CGFloat { 3 * scale }
    var colonW: CGFloat { 10 * scale }

    private var digitViews: [FlipDigitView] = []
    private var groups: [Int] = []
    var onResize: (() -> Void)?

    init() { super.init(frame: .zero) }
    required init?(coder: NSCoder) { fatalError() }

    func setScale(_ s: CGFloat) {
        guard s != scale else { return }
        scale = s
        groups = [] // force a rebuild at the new tile size on next set()
    }

    private func colonView() -> NSView {
        let v = NSView(frame: NSRect(x: 0, y: 0, width: colonW, height: tileH))
        v.wantsLayer = true
        v.layer?.contentsGravity = .resize
        v.layer?.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
        v.layer?.contents = renderGlyph(":", size: NSSize(width: colonW, height: tileH), color: .white)
        return v
    }

    private func rebuild(groups newGroups: [Int]) {
        guard newGroups != groups else { return }
        groups = newGroups
        subviews.forEach { $0.removeFromSuperview() }
        digitViews = []

        var x: CGFloat = 0
        for (gi, count) in groups.enumerated() {
            for _ in 0..<count {
                let dv = FlipDigitView(width: tileW, height: tileH)
                dv.frame = NSRect(x: x, y: 0, width: tileW, height: tileH)
                addSubview(dv)
                digitViews.append(dv)
                x += tileW + tileGap
            }
            if gi < groups.count - 1 {
                x -= tileGap
                let colon = colonView()
                colon.frame = NSRect(x: x, y: 0, width: colonW, height: tileH)
                addSubview(colon)
                x += colonW
            }
        }
        setFrameSize(NSSize(width: x, height: tileH))
        onResize?()
    }

    /// Render a count of seconds; non-tracking states pass placeholder = true.
    func set(seconds: Int, color: NSColor, animated: Bool, placeholder: Bool) {
        let chars: [Character]
        if placeholder {
            rebuild(groups: [2, 2]); chars = Array("----")
        } else if seconds >= 3600 {
            let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
            let hs = String(h)
            rebuild(groups: [hs.count, 2, 2])
            chars = Array(hs + String(format: "%02d%02d", m, s))
        } else {
            let m = seconds / 60, s = seconds % 60
            rebuild(groups: [2, 2])
            chars = Array(String(format: "%02d%02d", m, s))
        }
        for (i, dv) in digitViews.enumerated() where i < chars.count {
            dv.setColor(placeholder ? NSColor(white: 0.55, alpha: 1) : color)
            dv.setDigit(chars[i], animated: animated && !placeholder)
        }
    }
}

// MARK: - Resize grip (drag to change width)

final class ResizeHandleView: NSView {
    var onDrag: ((CGFloat) -> Void)?     // cumulative horizontal delta in points
    var onEnd: (() -> Void)?
    private var startX: CGFloat = 0

    override var mouseDownCanMoveWindow: Bool { false }

    override func resetCursorRects() { addCursorRect(bounds, cursor: .resizeLeftRight) }

    override func draw(_ dirtyRect: NSRect) {
        let dot = NSColor(white: 1, alpha: 0.45)
        dot.setFill()
        let cx = bounds.midX
        for i in -1...1 {
            let y = bounds.midY + CGFloat(i) * 5
            NSBezierPath(ovalIn: NSRect(x: cx - 1.2, y: y - 1.2, width: 2.4, height: 2.4)).fill()
        }
    }

    override func mouseDown(with event: NSEvent) { startX = event.locationInWindow.x }
    override func mouseDragged(with event: NSEvent) {
        onDrag?(event.locationInWindow.x - startX)
    }
    override func mouseUp(with event: NSEvent) { onEnd?() }
}

// MARK: - Animated hourglass

/// Render the SF Symbol "hourglass" tinted into a crisp 2× image (white by default, red on overtime).
func hourglassImage(_ s: CGFloat, tint: NSColor = .white) -> CGImage? {
    let cfg = NSImage.SymbolConfiguration(pointSize: s * 0.9, weight: .semibold)
    guard let base = NSImage(systemSymbolName: "hourglass", accessibilityDescription: nil)?
        .withSymbolConfiguration(cfg) else { return nil }
    let scale: CGFloat = 2
    let px = max(1, Int(s * scale))
    guard let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.scaleBy(x: scale, y: scale)
    let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ns
    let isz = base.size
    base.draw(in: NSRect(x: (s - isz.width) / 2, y: (s - isz.height) / 2, width: isz.width, height: isz.height))
    ns.compositingOperation = .sourceAtop // recolour the template glyph to the given tint
    tint.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: s, height: s)).fill()
    NSGraphicsContext.restoreGraphicsState()
    return ctx.makeImage()
}

/// A small hourglass that turns over on a seamless loop (hold · flip · hold · flip).
final class HourglassView: NSView {
    private let glyph = CALayer()
    private(set) var size: CGFloat
    private var tint: NSColor = .white
    var onClick: (() -> Void)?

    override var mouseDownCanMoveWindow: Bool { false }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
    override func mouseDown(with event: NSEvent) { onClick?() }

    init(size: CGFloat) {
        self.size = size
        super.init(frame: NSRect(x: 0, y: 0, width: size, height: size))
        wantsLayer = true
        glyph.contentsGravity = .resizeAspect
        glyph.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
        glyph.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        applySize(size)
        layer?.addSublayer(glyph)
        startAnimation()
    }
    required init?(coder: NSCoder) { fatalError() }

    private func applySize(_ s: CGFloat) {
        setFrameSize(NSSize(width: s, height: s))
        glyph.bounds = CGRect(x: 0, y: 0, width: s, height: s)
        glyph.position = CGPoint(x: s / 2, y: s / 2)
        glyph.contents = hourglassImage(s, tint: tint)
    }

    func update(size s: CGFloat) {
        guard abs(s - size) > 0.5 else { return }
        size = s
        applySize(s)
    }

    /// Recolour the glyph (e.g. red on overtime, white otherwise) without disturbing the spin animation.
    func update(tint t: NSColor) {
        guard !t.isEqual(tint) else { return }
        tint = t
        applySize(size)
    }

    private func startAnimation() {
        let a = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        a.values = [0, 0, CGFloat.pi, CGFloat.pi, 2 * CGFloat.pi]
        a.keyTimes = [0, 0.35, 0.5, 0.85, 1.0]
        a.duration = 5
        a.repeatCount = .infinity
        a.isRemovedOnCompletion = false
        glyph.add(a, forKey: "turn")
    }
}

// MARK: - Controller

final class TimerController: NSObject {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

    var server = "https://checkvist.com"
    var email = ""
    var remoteKey = ""
    var listId = 0
    var taskId = 0
    var token: String?
    var tokenAt = Date.distantPast
    var snapshot: [String: Any]?
    var lastFetch = Date.distantPast
    let fetchInterval: TimeInterval = 15
    let staleAfter: TimeInterval = 150 // app heartbeats every 2 min while active; allow margin

    // Persisted UI prefs.
    var rightWidth: CGFloat = 200
    var clockScale: CGFloat = 1
    var showDetails = true
    var dragStartRight: CGFloat = 0
    var dragStartScale: CGFloat = 0

    let labelItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let subItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let elapsedItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let topicItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    var progressMenuItem: NSMenuItem!
    var detailsMenuItem: NSMenuItem!

    var progressWindow: NSWindow?
    var settingsWindow: NSWindow?
    var fServer: NSTextField!
    var fEmail: NSTextField!
    var fKey: NSSecureTextField!
    var fList: NSTextField!
    var fTask: NSTextField!
    var settingsStatus: NSTextField!
    var hourglass: HourglassView!
    var hgSize: CGFloat { 24 * clockScale }
    let flipClock = FlipClockView()
    let captionField = NSTextField(labelWithString: "")
    let totalField = NSTextField(labelWithString: "")
    let progressTrack = NSView()
    let progressFill = NSView()
    let closeButton = NSButton()
    let resizeHandle = ResizeHandleView()
    let pad: CGFloat = 10
    let handleW: CGFloat = 14

    override init() {
        super.init()
        loadPrefs()
        loadConfig()
        flipClock.setScale(clockScale)
        buildMenu()
        let t = Timer(timeInterval: 1.0, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        RunLoop.main.add(t, forMode: .common)
        tick()
    }

    // MARK: Config + prefs

    func configPath() -> String {
        (NSHomeDirectory() as NSString).appendingPathComponent(".checkvist-timer.json")
    }

    var configured: Bool { !email.isEmpty && !remoteKey.isEmpty && listId > 0 && taskId > 0 }

    func loadConfig() {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: configPath())),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let s = obj["server"] as? String, !s.isEmpty { server = s }
        if let e = obj["email"] as? String { email = e }
        if let k = obj["remoteKey"] as? String { remoteKey = k }
        if let l = obj["listId"] as? Int { listId = l } else if let s = obj["listId"] as? String { listId = Int(s) ?? 0 }
        if let t = obj["taskId"] as? Int { taskId = t } else if let s = obj["taskId"] as? String { taskId = Int(s) ?? 0 }
    }

    func loadPrefs() {
        let d = UserDefaults.standard
        if d.object(forKey: "mb_rightWidth") != nil { rightWidth = CGFloat(d.double(forKey: "mb_rightWidth")) }
        if d.object(forKey: "mb_clockScale") != nil { clockScale = CGFloat(d.double(forKey: "mb_clockScale")) }
        if d.object(forKey: "mb_showDetails") != nil { showDetails = d.bool(forKey: "mb_showDetails") }
        token = d.string(forKey: "mb_token")
        if d.object(forKey: "mb_tokenAt") != nil { tokenAt = Date(timeIntervalSince1970: d.double(forKey: "mb_tokenAt")) }
        rightWidth = min(max(rightWidth, 120), 560)
        clockScale = min(max(clockScale, 0.7), 2.0)
    }

    func savePrefs() {
        let d = UserDefaults.standard
        d.set(Double(rightWidth), forKey: "mb_rightWidth")
        d.set(Double(clockScale), forKey: "mb_clockScale")
        d.set(showDetails, forKey: "mb_showDetails")
    }

    func setToken(_ t: String) {
        token = t
        tokenAt = Date()
        let d = UserDefaults.standard
        d.set(t, forKey: "mb_token")
        d.set(tokenAt.timeIntervalSince1970, forKey: "mb_tokenAt")
    }

    func buildMenu() {
        let menu = NSMenu()
        for item in [labelItem, subItem, elapsedItem, topicItem] {
            item.isEnabled = false
            menu.addItem(item)
        }
        menu.addItem(.separator())
        progressMenuItem = NSMenuItem(title: "Show Flip Clock", action: #selector(toggleProgressBar), keyEquivalent: "p")
        progressMenuItem.target = self
        menu.addItem(progressMenuItem)
        detailsMenuItem = NSMenuItem(title: "Show Details", action: #selector(toggleDetails), keyEquivalent: "d")
        detailsMenuItem.target = self
        detailsMenuItem.state = showDetails ? .on : .off
        menu.addItem(detailsMenuItem)
        let wider = NSMenuItem(title: "Wider", action: #selector(widen), keyEquivalent: "=")
        wider.target = self; menu.addItem(wider)
        let narrower = NSMenuItem(title: "Narrower", action: #selector(narrow), keyEquivalent: "-")
        narrower.target = self; menu.addItem(narrower)
        menu.addItem(.separator())
        let settings = NSMenuItem(title: "Settings…", action: #selector(openSettings), keyEquivalent: ",")
        settings.target = self
        menu.addItem(settings)
        let quit = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem.menu = menu
    }

    @objc func quit() { NSApp.terminate(nil) }

    // MARK: Settings window

    @objc func openSettings() {
        loadConfig()
        if settingsWindow == nil { buildSettingsWindow() }
        fServer.stringValue = server
        fEmail.stringValue = email
        fKey.stringValue = remoteKey
        fList.stringValue = listId > 0 ? String(listId) : ""
        fTask.stringValue = taskId > 0 ? String(taskId) : ""
        settingsStatus.stringValue = ""
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.center()
        settingsWindow?.makeKeyAndOrderFront(nil)
    }

    func buildSettingsWindow() {
        let W: CGFloat = 460, H: CGFloat = 300
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: W, height: H),
                           styleMask: [.titled, .closable], backing: .buffered, defer: false)
        win.title = "Checkvist Timer Settings"
        win.isReleasedWhenClosed = false
        let content = win.contentView!

        let labelW: CGFloat = 80
        let fieldX = 20 + labelW + 10
        let fieldW = W - fieldX - 20
        let rowH: CGFloat = 24
        let gap: CGFloat = 14
        var y = H - 48

        func addRow(_ title: String, _ field: NSTextField, hint: String? = nil) {
            let l = NSTextField(labelWithString: title)
            l.frame = NSRect(x: 20, y: y, width: labelW, height: rowH)
            l.alignment = .right
            content.addSubview(l)
            field.frame = NSRect(x: fieldX, y: y, width: fieldW, height: rowH)
            field.placeholderString = hint
            content.addSubview(field)
            y -= (rowH + gap)
        }

        fServer = NSTextField(string: "")
        fEmail = NSTextField(string: "")
        fKey = NSSecureTextField(string: "")
        fList = NSTextField(string: "")
        fTask = NSTextField(string: "")
        addRow("Server", fServer, hint: "https://checkvist.com")
        addRow("Email", fEmail, hint: "you@example.com")
        addRow("API key", fKey, hint: "Checkvist → Profile → OpenAPI key")
        addRow("List ID", fList, hint: "from the app's Menu bar timer panel")
        addRow("Task ID", fTask, hint: "from the app's Menu bar timer panel")

        settingsStatus = NSTextField(labelWithString: "")
        settingsStatus.frame = NSRect(x: 20, y: 56, width: W - 40, height: rowH)
        settingsStatus.textColor = .secondaryLabelColor
        settingsStatus.font = .systemFont(ofSize: 11)
        content.addSubview(settingsStatus)

        let save = NSButton(title: "Save", target: self, action: #selector(saveSettings))
        save.bezelStyle = .rounded
        save.keyEquivalent = "\r"
        save.frame = NSRect(x: W - 20 - 90, y: 16, width: 90, height: 30)
        content.addSubview(save)

        let test = NSButton(title: "Test login", target: self, action: #selector(testSettings))
        test.bezelStyle = .rounded
        test.frame = NSRect(x: W - 20 - 90 - 10 - 100, y: 16, width: 100, height: 30)
        content.addSubview(test)

        settingsWindow = win
    }

    /// Pull the field values into the live config vars (used by both Save and Test).
    func applyFields() {
        let s = fServer.stringValue.trimmingCharacters(in: .whitespaces)
        server = s.isEmpty ? "https://checkvist.com" : s
        email = fEmail.stringValue.trimmingCharacters(in: .whitespaces)
        remoteKey = fKey.stringValue.trimmingCharacters(in: .whitespaces)
        listId = Int(fList.stringValue.trimmingCharacters(in: .whitespaces)) ?? 0
        taskId = Int(fTask.stringValue.trimmingCharacters(in: .whitespaces)) ?? 0
    }

    @objc func saveSettings() {
        applyFields()
        let obj: [String: Any] = [
            "server": server, "email": email, "remoteKey": remoteKey,
            "listId": listId, "taskId": taskId,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]) {
            try? data.write(to: URL(fileURLWithPath: configPath()))
        }
        token = nil // credentials may have changed — force a fresh login
        settingsStatus.textColor = .secondaryLabelColor
        settingsStatus.stringValue = configured ? "Saved — connecting…" : "Saved. Fill every field to connect."
        forceRefresh()
    }

    @objc func testSettings() {
        applyFields()
        guard !email.isEmpty, !remoteKey.isEmpty else {
            settingsStatus.textColor = .systemRed
            settingsStatus.stringValue = "Enter email and API key first."
            return
        }
        settingsStatus.textColor = .secondaryLabelColor
        settingsStatus.stringValue = "Testing…"
        token = nil
        login { [weak self] tok in
            DispatchQueue.main.async {
                guard let self else { return }
                if tok != nil {
                    self.settingsStatus.textColor = .systemGreen
                    self.settingsStatus.stringValue = "Login OK ✓"
                } else {
                    self.settingsStatus.textColor = .systemRed
                    self.settingsStatus.stringValue = "Login failed — check email / API key / server."
                }
            }
        }
    }

    @objc func tick() {
        if Date().timeIntervalSince(lastFetch) >= fetchInterval || snapshot == nil {
            lastFetch = Date()
            fetch()
        }
        render()
    }

    /// Click the hourglass to pull the latest snapshot immediately (don't wait for the 15s poll).
    func forceRefresh() {
        lastFetch = Date()
        fetch()
    }

    func fetch() {
        loadConfig()
        guard configured else { return }
        ensureToken { [weak self] tok in
            guard let self, let tok else { return }
            self.fetchTask(token: tok, retryOn401: true)
        }
    }

    /// POST an x-www-form-urlencoded request and hand back the parsed JSON object (or nil).
    func postForm(_ path: String, fields: [String: String], completion: @escaping ([String: Any]?) -> Void) {
        guard let url = URL(string: server + path) else { completion(nil); return }
        let allowed = CharacterSet(charactersIn:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        let body = fields
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }
            .joined(separator: "&")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = body.data(using: .utf8)
        URLSession.shared.dataTask(with: req) { data, _, _ in
            completion(data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? nil)
        }.resume()
    }

    /// Return a usable token: reuse the cached one if fresh, else refresh it, else log in afresh.
    func ensureToken(_ completion: @escaping (String?) -> Void) {
        if let token, Date().timeIntervalSince(tokenAt) < 23 * 3600 { completion(token); return }
        if let old = token {
            postForm("/auth/refresh_token.json?version=2", fields: ["old_token": old]) { [weak self] obj in
                if let t = obj?["token"] as? String { self?.setToken(t); completion(t) }
                else { self?.login(completion) }
            }
        } else {
            login(completion)
        }
    }

    func login(_ completion: @escaping (String?) -> Void) {
        guard !email.isEmpty, !remoteKey.isEmpty else { completion(nil); return }
        postForm("/auth/login.json?version=2", fields: ["username": email, "remote_key": remoteKey]) { [weak self] obj in
            if let t = obj?["token"] as? String { self?.setToken(t); completion(t) } else { completion(nil) }
        }
    }

    /// GET the single relay task and decode its snapshot. On 401, drop the token and retry once.
    func fetchTask(token tok: String, retryOn401: Bool) {
        guard let url = URL(string: "\(server)/checklists/\(listId)/tasks/\(taskId).json?token=\(tok)") else { return }
        var req = URLRequest(url: url)
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        URLSession.shared.dataTask(with: req) { [weak self] data, resp, _ in
            guard let self else { return }
            if let http = resp as? HTTPURLResponse, http.statusCode == 401, retryOn401 {
                self.token = nil
                self.ensureToken { newTok in if let newTok { self.fetchTask(token: newTok, retryOn401: false) } }
                return
            }
            // Checkvist returns the task as a single-element array, not a bare object.
            guard let data else { return }
            let top = try? JSONSerialization.jsonObject(with: data)
            let obj = (top as? [[String: Any]])?.first ?? (top as? [String: Any])
            guard let content = obj?["content"] as? String,
                  let snap = self.decodeSnapshot(content) else { return }
            DispatchQueue.main.async { self.snapshot = snap; self.render() }
        }.resume()
    }

    /// Strip the marker prefix and base64url-decode the snapshot JSON the web app wrote.
    func decodeSnapshot(_ content: String) -> [String: Any]? {
        let prefix = "CVTIMER1 "
        guard content.hasPrefix(prefix) else { return nil }
        var b64 = String(content.dropFirst(prefix.count))
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let snap = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              snap["mode"] != nil else { return nil }
        return snap
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
                attributes: [.foregroundColor: color, .font: NSFont.menuBarFont(ofSize: 0)])
        } else {
            btn.title = text
        }
    }

    // MARK: Width / details

    @objc func widen() { adjustWidth(1) }
    @objc func narrow() { adjustWidth(-1) }

    func adjustWidth(_ dir: CGFloat) {
        if showDetails {
            rightWidth = min(max(rightWidth + dir * 40, 120), 560)
        } else {
            clockScale = min(max(clockScale + dir * 0.15, 0.7), 2.0)
            flipClock.setScale(clockScale)
            flipClock.set(seconds: lastSeconds, color: .white, animated: false, placeholder: lastPlaceholder)
        }
        savePrefs()
        layoutWindowContents()
    }

    @objc func toggleDetails() {
        showDetails.toggle()
        detailsMenuItem.state = showDetails ? .on : .off
        captionField.isHidden = !showDetails
        totalField.isHidden = !showDetails
        progressTrack.isHidden = !showDetails
        resizeHandle.isHidden = false // handle stays useful in both modes
        savePrefs()
        layoutWindowContents()
        render()
    }

    // MARK: Flip-clock window

    @objc func toggleProgressBar() {
        if let w = progressWindow, w.isVisible { hideProgressBar() } else { showProgressBar() }
    }

    func showProgressBar() {
        if progressWindow == nil { createProgressWindow() }
        progressWindow?.orderFrontRegardless()
        progressMenuItem.state = .on
        progressMenuItem.title = "Hide Flip Clock"
        render()
    }

    @objc func hideProgressBar() {
        progressWindow?.orderOut(nil)
        progressMenuItem.state = .off
        progressMenuItem.title = "Show Flip Clock"
    }

    func layoutWindowContents() {
        guard let win = progressWindow else { return }
        hourglass.update(size: hgSize)
        let hg = hgSize
        let clockW = flipClock.frame.width
        let clockH = flipClock.frame.height
        let contentH = pad + clockH + pad
        let clockX = pad + hg + 8
        let contentW: CGFloat = showDetails ? (clockX + clockW + 16 + rightWidth + handleW + pad)
                                            : (clockX + clockW + handleW + pad)

        // Preserve top-left: keep minX, adjust y so the top edge stays put.
        let oldTopY = win.frame.maxY
        win.setFrame(NSRect(x: win.frame.minX, y: oldTopY - contentH, width: contentW, height: contentH), display: true)

        hourglass.frame = NSRect(x: pad, y: (contentH - hg) / 2, width: hg, height: hg)
        flipClock.frame.origin = NSPoint(x: clockX, y: pad)

        if showDetails {
            let rightX = clockX + clockW + 16
            let rowH: CGFloat = 16
            let labelY = contentH - pad - rowH
            captionField.frame = NSRect(x: rightX, y: labelY, width: rightWidth - 60, height: rowH)
            totalField.frame = NSRect(x: rightX + rightWidth - 58, y: labelY, width: 58, height: rowH)
            let barH: CGFloat = 6
            progressTrack.frame = NSRect(x: rightX, y: pad + 6, width: rightWidth, height: barH)
            progressTrack.layer?.cornerRadius = barH / 2
        }

        resizeHandle.frame = NSRect(x: contentW - handleW, y: 0, width: handleW, height: contentH)
        closeButton.frame = NSRect(x: contentW - handleW - 16, y: contentH - 17, width: 14, height: 14)
    }

    func setProgress(ratio: Double, color: NSColor) {
        let w = progressTrack.frame.width
        let r = max(0, min(1, CGFloat(ratio)))
        progressFill.frame = NSRect(x: 0, y: 0, width: r * w, height: progressTrack.frame.height)
        progressFill.layer?.backgroundColor = color.cgColor
    }

    func createProgressWindow() {
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 320, height: 62),
                           styleMask: .borderless, backing: .buffered, defer: false)
        win.level = .floating
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = true
        win.isMovableByWindowBackground = true
        win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let content = NSView(frame: NSRect(x: 0, y: 0, width: 320, height: 62))
        content.wantsLayer = true
        content.layer?.cornerRadius = 12
        content.layer?.masksToBounds = true
        content.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.9).cgColor
        hourglass = HourglassView(size: hgSize)
        hourglass.onClick = { [weak self] in self?.forceRefresh() }
        content.addSubview(hourglass)
        content.addSubview(flipClock)

        captionField.font = .systemFont(ofSize: 12, weight: .semibold)
        captionField.textColor = .white
        captionField.alignment = .left
        captionField.lineBreakMode = .byTruncatingTail
        captionField.maximumNumberOfLines = 1
        captionField.isHidden = !showDetails
        content.addSubview(captionField)

        totalField.font = .systemFont(ofSize: 11, weight: .medium)
        totalField.textColor = NSColor(white: 1, alpha: 0.5)
        totalField.alignment = .right
        totalField.isHidden = !showDetails
        content.addSubview(totalField)

        progressTrack.wantsLayer = true
        progressTrack.layer?.backgroundColor = NSColor(white: 1, alpha: 0.15).cgColor
        progressTrack.layer?.masksToBounds = true
        progressTrack.isHidden = !showDetails
        progressFill.wantsLayer = true
        progressFill.layer?.cornerRadius = 3
        progressTrack.addSubview(progressFill)
        content.addSubview(progressTrack)

        closeButton.isBordered = false
        closeButton.attributedTitle = NSAttributedString(
            string: "✕",
            attributes: [.foregroundColor: NSColor.white.withAlphaComponent(0.8),
                         .font: NSFont.systemFont(ofSize: 11, weight: .bold)])
        closeButton.target = self
        closeButton.action = #selector(hideProgressBar)
        content.addSubview(closeButton)

        resizeHandle.onDrag = { [weak self] delta in self?.dragResize(delta) }
        resizeHandle.onEnd = { [weak self] in self?.savePrefs() }
        content.addSubview(resizeHandle)

        win.contentView = content
        progressWindow = win
        flipClock.onResize = { [weak self] in self?.layoutWindowContents() }

        flipClock.set(seconds: 0, color: .white, animated: false, placeholder: true)
        layoutWindowContents()
        if let screen = NSScreen.main {
            let f = screen.visibleFrame
            win.setFrameOrigin(NSPoint(x: f.midX - win.frame.width / 2, y: f.maxY - win.frame.height - 8))
        }
    }

    func dragResize(_ delta: CGFloat) {
        if delta == 0 { dragStartRight = rightWidth; dragStartScale = clockScale }
        if showDetails {
            rightWidth = min(max(dragStartRight + delta, 120), 560)
        } else {
            clockScale = min(max(dragStartScale + delta / 120, 0.7), 2.0)
            flipClock.setScale(clockScale)
            flipClock.set(seconds: lastSeconds, color: .white, animated: false, placeholder: lastPlaceholder)
        }
        layoutWindowContents()
    }

    // MARK: Render

    var lastSeconds = 0
    var lastPlaceholder = true

    func render() {
        guard statusItem.button != nil else { return }
        let barVisible = progressWindow?.isVisible ?? false

        func showClock(seconds: Int, color: NSColor, animated: Bool, placeholder: Bool) {
            lastSeconds = seconds; lastPlaceholder = placeholder
            flipClock.set(seconds: seconds, color: color, animated: animated, placeholder: placeholder)
        }

        guard configured else {
            setTitle("⚙ set up timer", color: .secondaryLabelColor)
            if barVisible {
                showClock(seconds: 0, color: .white, animated: false, placeholder: true)
                if showDetails {
                    captionField.stringValue = "add API key + IDs"; captionField.textColor = NSColor(white: 1, alpha: 0.75)
                    totalField.stringValue = ""; setProgress(ratio: 0, color: cIdle)
                }
            }
            return
        }

        let nowMs = Date().timeIntervalSince1970 * 1000
        let updatedAt = snapshot?["updatedAt"] as? Double ?? 0
        let fresh = snapshot != nil && (nowMs - updatedAt) <= staleAfter * 1000

        topicItem.isHidden = false
        topicItem.title = "Checkvist · list \(listId) / task \(taskId)"

        guard fresh, let snap = snapshot else {
            setTitle("– not tracking", color: .secondaryLabelColor)
            labelItem.isHidden = false; labelItem.title = "App tab closed or no fresh snapshot"
            subItem.isHidden = true; elapsedItem.isHidden = true
            if barVisible {
                showClock(seconds: 0, color: .white, animated: false, placeholder: true)
                if showDetails {
                    captionField.stringValue = "not tracking"; captionField.textColor = NSColor(white: 1, alpha: 0.75)
                    totalField.stringValue = ""; setProgress(ratio: 0, color: cIdle)
                }
            }
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

        // Menu-bar title: full vs timer-only.
        let title: String
        if mode == "idle" {
            title = "\(icon) \(fmt(elapsed)) idle"
        } else if showDetails {
            let short = label.count > 24 ? String(label.prefix(23)) + "…" : label
            title = "\(icon) \(fmt(elapsed)) · \(short)" + (overrun ? " · OVER" : "")
        } else {
            title = "\(icon) \(fmt(elapsed))"
        }
        setTitle(title, color: overrun ? .systemRed : nil)
        hourglass?.update(tint: overrun ? cOver : .white)

        labelItem.isHidden = false; labelItem.title = label
        if let sub = snap["sublabel"] as? String, !sub.isEmpty { subItem.isHidden = false; subItem.title = sub } else { subItem.isHidden = true }
        elapsedItem.isHidden = false
        elapsedItem.title = target > 0 ? "Elapsed \(fmt(elapsed)) / \(fmt(target))" : "Elapsed \(fmt(elapsed))"

        if barVisible {
            let accent: NSColor = overrun ? cOver : (mode == "execute" ? cExecute : mode == "routine" ? cRoutine : cIdle)
            showClock(seconds: Int(elapsed), color: .white, animated: !paused, placeholder: false)
            if showDetails {
                let caption = mode == "idle" ? "idle" : label
                captionField.stringValue = caption + (paused ? "  ·  paused" : overrun ? "  ·  OVER" : "")
                captionField.textColor = overrun ? cOver : .white
                totalField.stringValue = target > 0 ? "/ \(fmt(target))" : ""
                setProgress(ratio: target > 0 ? elapsed / target : 0, color: accent)
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = TimerController()
app.run()
