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

// MARK: - Borderless window that can still take key focus (so inline controls work)

final class ControlPanelWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
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

final class TimerController: NSObject, NSApplicationDelegate {
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
    var clockScale: CGFloat = 0.5   // compact by default; resizable down to 0.4
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
    var pomoClockScale: CGFloat { max(0.32, clockScale * 0.6) } // smaller than the relay clock (per design)
    let flipClock = FlipClockView()
    let captionField = NSTextField(labelWithString: "")
    let totalField = NSTextField(labelWithString: "")
    let progressTrack = NSView()
    let progressFill = NSView()
    let closeButton = NSButton()
    let resizeHandle = ResizeHandleView()
    let pad: CGFloat = 10
    let handleW: CGFloat = 14

    // MARK: Pomodoro (self-contained, local, in-memory — no relay, no persistence)
    enum PomoPhase { case off, work, onBreak }
    var pomoPhase: PomoPhase = .off
    var workSec: Double = 25 * 60
    var breakSec: Double = 5 * 60
    var pomoPhaseStart = Date()
    var pomoPaused = false
    var pomoPausedElapsed: Double = 0   // elapsed frozen at the moment of pausing
    var pomoMenuItem: NSMenuItem!
    var pomoPauseItem: NSMenuItem!

    var pomoActive: Bool { pomoPhase != .off }
    var pomoPhaseLen: Double { pomoPhase == .onBreak ? breakSec : workSec }
    func pomoElapsed() -> Double {
        pomoPaused ? pomoPausedElapsed : Date().timeIntervalSince(pomoPhaseStart)
    }
    func pomoRemaining() -> Double { max(0, pomoPhaseLen - pomoElapsed()) }

    // Break overlay window + its live subviews.
    var breakWindow: NSWindow?
    let breakClock = FlipClockView()
    let breakSubtitle = NSTextField(labelWithString: "")
    let breakProgressTrack = NSView()
    let breakProgressFill = NSView()

    // Parallel Pomodoro countdown shown inside the flip-clock window, below the relay timer.
    let pomoClock = FlipClockView()
    let pomoGlyphField = NSTextField(labelWithString: "")
    let pomoCaptionField = NSTextField(labelWithString: "")
    let pomoWinTrack = NSView()
    let pomoWinFill = NSView()

    // Inline Pomodoro controls inside the flip-clock window (edit durations + start/stop/reset).
    var winStartBtn: NSButton!
    var winResetBtn: NSButton!
    var winWorkStepper: NSStepper!
    var winBreakStepper: NSStepper!
    var winWorkVal: NSTextField!
    var winBreakVal: NSTextField!
    var winWorkLbl: NSTextField!
    var winBreakLbl: NSTextField!

    // Main "Pomodoro" window (the app's life outside the menu bar).
    var mainWindow: NSWindow?
    var mainPhaseField: NSTextField!
    var mainCountdownField: NSTextField!
    var mainWorkField: NSTextField!
    var mainBreakField: NSTextField!
    var mainStartBtn: NSButton!
    var mainPauseBtn: NSButton!

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
        clockScale = min(max(clockScale, 0.4), 2.0)
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

        // ── Pomodoro ──────────────────────────────────────────────────────────
        let openPomo = NSMenuItem(title: "Pomodoro Window…", action: #selector(showMainWindow), keyEquivalent: "o")
        openPomo.target = self
        menu.addItem(openPomo)
        pomoMenuItem = NSMenuItem(title: "Start Pomodoro", action: #selector(togglePomodoro), keyEquivalent: "s")
        pomoMenuItem.target = self
        menu.addItem(pomoMenuItem)
        pomoPauseItem = NSMenuItem(title: "Pause", action: #selector(togglePomoPause), keyEquivalent: "")
        pomoPauseItem.target = self
        pomoPauseItem.isHidden = true
        menu.addItem(pomoPauseItem)

        let workMenu = NSMenu()
        for m in [15.0, 25.0, 50.0] {
            let it = NSMenuItem(title: "\(Int(m)) min", action: #selector(setWorkPreset(_:)), keyEquivalent: "")
            it.target = self; it.tag = Int(m); it.state = workSec == m * 60 ? .on : .off
            workMenu.addItem(it)
        }
        let workItem = NSMenuItem(title: "Work Duration", action: nil, keyEquivalent: "")
        workItem.submenu = workMenu
        menu.addItem(workItem)

        let breakMenu = NSMenu()
        for m in [5.0, 10.0, 15.0] {
            let it = NSMenuItem(title: "\(Int(m)) min", action: #selector(setBreakPreset(_:)), keyEquivalent: "")
            it.target = self; it.tag = Int(m); it.state = breakSec == m * 60 ? .on : .off
            breakMenu.addItem(it)
        }
        let breakItem = NSMenuItem(title: "Break Duration", action: nil, keyEquivalent: "")
        breakItem.submenu = breakMenu
        menu.addItem(breakItem)

        menu.addItem(.separator())
        let settings = NSMenuItem(title: "Relay Settings…", action: #selector(openSettings), keyEquivalent: ",")
        settings.target = self
        menu.addItem(settings)
        let quit = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem.menu = menu
        refreshPomoMenu()
    }

    @objc func togglePomodoro() {
        if pomoActive { stopPomodoro() } else { startPomodoro() }
    }

    @objc func setWorkPreset(_ sender: NSMenuItem) {
        workSec = Double(sender.tag) * 60
        refreshPomoMenu(); refreshMainWindow()
    }

    @objc func setBreakPreset(_ sender: NSMenuItem) {
        breakSec = Double(sender.tag) * 60
        refreshPomoMenu(); refreshMainWindow()
    }

    /// Keep menu titles, checkmarks and the pause item in sync with Pomodoro state.
    func refreshPomoMenu() {
        guard pomoMenuItem != nil else { return }
        pomoMenuItem.title = pomoActive ? "Stop Pomodoro" : "Start Pomodoro"
        pomoPauseItem.isHidden = !pomoActive || pomoPhase == .onBreak
        pomoPauseItem.title = pomoPaused ? "Resume" : "Pause"
        if let wm = pomoMenuItem.menu {
            for it in wm.items where it.submenu != nil {
                if it.title == "Work Duration" {
                    it.submenu?.items.forEach { $0.state = workSec == Double($0.tag) * 60 ? .on : .off }
                } else if it.title == "Break Duration" {
                    it.submenu?.items.forEach { $0.state = breakSec == Double($0.tag) * 60 ? .on : .off }
                }
            }
        }
        refreshMainWindow()
        refreshWinControls()
    }

    // MARK: Inline flip-clock-window controls

    @objc func winWorkStepperChanged(_ s: NSStepper) {
        workSec = Double(max(1, min(180, s.integerValue))) * 60
        refreshPomoMenu()
    }
    @objc func winBreakStepperChanged(_ s: NSStepper) {
        breakSec = Double(max(1, min(180, s.integerValue))) * 60
        refreshPomoMenu()
    }

    /// Reset the current Pomodoro phase back to full (restart the countdown, keep the phase).
    @objc func resetPomodoro() {
        guard pomoActive else { return }
        pomoPhaseStart = Date()
        pomoPausedElapsed = 0
        if pomoPhase == .onBreak { updateBreakWindow() }
        updatePomoRow(); refreshMainWindow()
    }

    /// Keep the inline window controls (start/stop title, reset enabled, duration values) in sync.
    func ctlButtonTitle(_ glyph: String, _ text: String, _ color: NSColor) -> NSAttributedString {
        NSAttributedString(string: "\(glyph) \(text)", attributes: [
            .foregroundColor: color,
            .font: NSFont.systemFont(ofSize: 11, weight: .semibold),
        ])
    }

    func refreshWinControls() {
        guard winStartBtn != nil else { return }
        winStartBtn.attributedTitle = pomoActive
            ? ctlButtonTitle("◼", "Stop", cOver)
            : ctlButtonTitle("▶", "Start", NSColor(white: 1, alpha: 0.85))
        winResetBtn.attributedTitle = ctlButtonTitle("↺", "Reset", NSColor(white: 1, alpha: pomoActive ? 0.85 : 0.4))
        winResetBtn.isEnabled = pomoActive
        winWorkVal?.stringValue = String(Int(workSec / 60))
        winBreakVal?.stringValue = String(Int(breakSec / 60))
        winWorkStepper?.integerValue = Int(workSec / 60)
        winBreakStepper?.integerValue = Int(breakSec / 60)
    }

    @objc func quit() { NSApp.terminate(nil) }

    // Clicking the Dock icon (with no open windows) reopens the Pomodoro window.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showMainWindow() }
        return true
    }

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
        pomoTick()
        render()
    }

    // MARK: Pomodoro tick + transitions

    func pomoTick() {
        guard pomoActive else { return }

        // Auto phase transitions when the current phase runs out.
        if !pomoPaused && pomoElapsed() >= pomoPhaseLen {
            if pomoPhase == .work { enterBreak(); return }
            else { endBreak(); return }
        }

        let remaining = pomoRemaining()
        if pomoPhase == .work {
            // Drive the menu-bar title (render() yields to us while a Pomodoro runs).
            let near = remaining <= 60
            let pauseTag = pomoPaused ? " ⏸" : ""
            setTitle("🍅 \(fmt(remaining))\(pauseTag)", color: near && !pomoPaused ? cOver : nil)
        } else {
            updateBreakWindow()
        }
        updatePomoRow()
        refreshMainWindow()
    }

    @objc func startPomodoro() {
        pomoPhase = .work
        pomoPhaseStart = Date()
        pomoPaused = false
        pomoPausedElapsed = 0
        refreshPomoMenu()
        layoutWindowContents() // grow the flip-clock window to reveal the parallel row
        pomoTick()
    }

    @objc func stopPomodoro() {
        pomoPhase = .off
        pomoPaused = false
        hideBreakWindow(animated: false)
        refreshPomoMenu()
        layoutWindowContents() // collapse the parallel row
        render() // hand the menu-bar title back to the relay display
    }

    @objc func togglePomoPause() {
        guard pomoActive else { return }
        if pomoPaused {
            // Resume: shift the phase start so elapsed continues from where it froze.
            pomoPhaseStart = Date().addingTimeInterval(-pomoPausedElapsed)
            pomoPaused = false
        } else {
            pomoPausedElapsed = pomoElapsed()
            pomoPaused = true
        }
        refreshPomoMenu()
        pomoTick()
    }

    func enterBreak() {
        pomoPhase = .onBreak
        pomoPhaseStart = Date()
        pomoPaused = false
        pomoPausedElapsed = 0
        NSSound(named: "Glass")?.play()
        showBreakWindow()
        refreshPomoMenu()
    }

    /// End the break (auto at 0 or via the "Get back to work…" button) and start the next work session.
    @objc func endBreak() {
        hideBreakWindow(animated: true)
        pomoPhase = .work
        pomoPhaseStart = Date()
        pomoPaused = false
        pomoPausedElapsed = 0
        refreshPomoMenu()
        pomoTick()
    }

    // MARK: Break overlay window

    func createBreakWindow() {
        guard let screen = NSScreen.main else { return }
        let win = NSWindow(contentRect: screen.frame, styleMask: .borderless,
                           backing: .buffered, defer: false)
        win.level = .screenSaver
        win.isOpaque = false
        win.backgroundColor = .clear
        win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        win.ignoresMouseEvents = false

        let content = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.82).cgColor
        // Anchor the zoom at the centre of the screen.
        content.layer?.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        content.layer?.frame = content.bounds

        let cx = content.bounds.midX
        let cy = content.bounds.midY

        let title = NSTextField(labelWithString: "Break")
        title.font = .systemFont(ofSize: 22, weight: .medium)
        title.textColor = NSColor(white: 1, alpha: 0.85)
        title.alignment = .center
        title.frame = NSRect(x: cx - 200, y: cy + 150, width: 400, height: 30)
        content.addSubview(title)

        // Large countdown via the existing flip-clock view, scaled up.
        breakClock.setScale(2.2)
        breakClock.set(seconds: Int(breakSec), color: .white, animated: false, placeholder: false)
        let bcW = breakClock.frame.width, bcH = breakClock.frame.height
        breakClock.frame.origin = NSPoint(x: cx - bcW / 2, y: cy - bcH / 2 + 20)
        content.addSubview(breakClock)

        breakSubtitle.font = .systemFont(ofSize: 14, weight: .regular)
        breakSubtitle.textColor = NSColor(white: 1, alpha: 0.5)
        breakSubtitle.alignment = .center
        breakSubtitle.frame = NSRect(x: cx - 100, y: cy - bcH / 2 - 16, width: 200, height: 20)
        content.addSubview(breakSubtitle)

        // Progress bar (break elapsed / breakSec).
        let barW: CGFloat = 360, barH: CGFloat = 6
        breakProgressTrack.wantsLayer = true
        breakProgressTrack.layer?.backgroundColor = NSColor(white: 1, alpha: 0.15).cgColor
        breakProgressTrack.layer?.cornerRadius = barH / 2
        breakProgressTrack.layer?.masksToBounds = true
        breakProgressTrack.frame = NSRect(x: cx - barW / 2, y: cy - bcH / 2 - 50, width: barW, height: barH)
        breakProgressFill.wantsLayer = true
        breakProgressFill.layer?.backgroundColor = cIdle.cgColor
        breakProgressFill.layer?.cornerRadius = barH / 2
        breakProgressFill.frame = NSRect(x: 0, y: 0, width: 0, height: barH)
        breakProgressTrack.addSubview(breakProgressFill)
        content.addSubview(breakProgressTrack)

        let btn = NSButton(title: "Get back to work…", target: self, action: #selector(endBreak))
        btn.bezelStyle = .rounded
        btn.keyEquivalent = "\r"
        btn.frame = NSRect(x: cx - 110, y: cy - bcH / 2 - 110, width: 220, height: 34)
        content.addSubview(btn)

        // Exit the whole Pomodoro session from the break screen (not just skip the break).
        let exit = NSButton(title: "Exit Pomodoro", target: self, action: #selector(exitFromBreak))
        exit.bezelStyle = .rounded
        exit.isBordered = false
        exit.contentTintColor = NSColor(white: 1, alpha: 0.6)
        exit.frame = NSRect(x: cx - 110, y: cy - bcH / 2 - 150, width: 220, height: 26)
        content.addSubview(exit)

        win.contentView = content
        breakWindow = win
    }

    /// "Exit Pomodoro" on the break screen: stop the session entirely (zoom the overlay out first).
    @objc func exitFromBreak() {
        hideBreakWindow(animated: true)
        pomoPhase = .off
        pomoPaused = false
        refreshPomoMenu()
        layoutWindowContents()
        render()
    }

    func showBreakWindow() {
        if breakWindow == nil { createBreakWindow() }
        else if let screen = NSScreen.main { breakWindow?.setFrame(screen.frame, display: false) }
        updateBreakWindow()
        breakWindow?.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)

        // Zoom in: scale the content up from a small centred copy with a fade.
        guard let layer = breakWindow?.contentView?.layer else { return }
        layer.removeAnimation(forKey: "zoom")
        let scale = CABasicAnimation(keyPath: "transform.scale")
        scale.fromValue = 0.6
        scale.toValue = 1.0
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.0
        fade.toValue = 1.0
        let group = CAAnimationGroup()
        group.animations = [scale, fade]
        group.duration = 0.3
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        layer.add(group, forKey: "zoom")
    }

    func hideBreakWindow(animated: Bool) {
        guard let win = breakWindow, win.isVisible else { return }
        guard animated, let layer = win.contentView?.layer else { win.orderOut(nil); return }

        CATransaction.begin()
        CATransaction.setCompletionBlock { win.orderOut(nil) }
        let scale = CABasicAnimation(keyPath: "transform.scale")
        scale.fromValue = 1.0
        scale.toValue = 0.02
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1.0
        fade.toValue = 0.0
        let group = CAAnimationGroup()
        group.animations = [scale, fade]
        group.duration = 0.35
        group.timingFunction = CAMediaTimingFunction(name: .easeIn)
        group.fillMode = .forwards
        group.isRemovedOnCompletion = false
        layer.add(group, forKey: "zoom")
        CATransaction.commit()
    }

    func updateBreakWindow() {
        guard pomoPhase == .onBreak else { return }
        let remaining = pomoRemaining()
        breakClock.set(seconds: Int(ceil(remaining)), color: .white, animated: false, placeholder: false)
        breakSubtitle.stringValue = "\(Int(breakSec / 60)) min break"
        let ratio = pomoPhaseLen > 0 ? CGFloat(pomoElapsed() / pomoPhaseLen) : 0
        let w = breakProgressTrack.frame.width
        breakProgressFill.frame = NSRect(x: 0, y: 0, width: max(0, min(1, ratio)) * w,
                                         height: breakProgressTrack.frame.height)
        // Keep the menu-bar title informative during the break too.
        setTitle("☕️ \(fmt(remaining))", color: nil)
    }

    // MARK: Main Pomodoro window

    @objc func showMainWindow() {
        if mainWindow == nil { buildMainWindow() }
        // Stay an accessory (no Dock icon): a .regular app's windows can't float over OTHER apps'
        // full-screen spaces. Accessory windows with canJoinAllSpaces can. Still focusable via activate.
        NSApp.setActivationPolicy(.accessory)
        NSApp.activate(ignoringOtherApps: true)
        mainWindow?.center()
        mainWindow?.makeKeyAndOrderFront(nil)
        refreshMainWindow()
    }

    func buildMainWindow() {
        let W: CGFloat = 360, H: CGFloat = 300
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: W, height: H),
                           styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        win.title = "Pomodoro"
        win.isReleasedWhenClosed = false
        let content = win.contentView!

        // Live phase + big countdown.
        mainPhaseField = NSTextField(labelWithString: "Ready")
        mainPhaseField.font = .systemFont(ofSize: 13, weight: .medium)
        mainPhaseField.textColor = .secondaryLabelColor
        mainPhaseField.alignment = .center
        mainPhaseField.frame = NSRect(x: 20, y: H - 56, width: W - 40, height: 20)
        content.addSubview(mainPhaseField)

        mainCountdownField = NSTextField(labelWithString: "25:00")
        mainCountdownField.font = .monospacedDigitSystemFont(ofSize: 56, weight: .semibold)
        mainCountdownField.alignment = .center
        mainCountdownField.frame = NSRect(x: 20, y: H - 130, width: W - 40, height: 64)
        content.addSubview(mainCountdownField)

        // Duration steppers.
        func durationRow(_ title: String, y: CGFloat, value: Int, action: Selector) -> NSTextField {
            let l = NSTextField(labelWithString: title)
            l.frame = NSRect(x: 40, y: y, width: 110, height: 22)
            content.addSubview(l)
            let field = NSTextField(string: String(value))
            field.frame = NSRect(x: 150, y: y, width: 56, height: 22)
            field.alignment = .right
            content.addSubview(field)
            let stepper = NSStepper(frame: NSRect(x: 210, y: y, width: 19, height: 22))
            stepper.minValue = 1; stepper.maxValue = 180; stepper.increment = 1
            stepper.integerValue = value
            stepper.target = self; stepper.action = action
            content.addSubview(stepper)
            let unit = NSTextField(labelWithString: "min")
            unit.textColor = .secondaryLabelColor
            unit.frame = NSRect(x: 236, y: y, width: 40, height: 22)
            content.addSubview(unit)
            return field
        }
        mainWorkField = durationRow("Work", y: 130, value: Int(workSec / 60), action: #selector(workStepperChanged(_:)))
        mainBreakField = durationRow("Break", y: 100, value: Int(breakSec / 60), action: #selector(breakStepperChanged(_:)))
        mainWorkField.target = self; mainWorkField.action = #selector(workFieldChanged(_:))
        mainBreakField.target = self; mainBreakField.action = #selector(breakFieldChanged(_:))

        // Controls.
        mainStartBtn = NSButton(title: "Start", target: self, action: #selector(togglePomodoro))
        mainStartBtn.bezelStyle = .rounded
        mainStartBtn.keyEquivalent = "\r"
        mainStartBtn.frame = NSRect(x: 40, y: 48, width: 130, height: 32)
        content.addSubview(mainStartBtn)

        mainPauseBtn = NSButton(title: "Pause", target: self, action: #selector(togglePomoPause))
        mainPauseBtn.bezelStyle = .rounded
        mainPauseBtn.frame = NSRect(x: 190, y: 48, width: 130, height: 32)
        content.addSubview(mainPauseBtn)

        let relay = NSButton(title: "Relay Settings…", target: self, action: #selector(openSettings))
        relay.bezelStyle = .rounded
        relay.frame = NSRect(x: 40, y: 12, width: 280, height: 28)
        content.addSubview(relay)

        mainWindow = win
    }

    @objc func workStepperChanged(_ s: NSStepper) { workSec = Double(s.integerValue) * 60; refreshPomoMenu() }
    @objc func breakStepperChanged(_ s: NSStepper) { breakSec = Double(s.integerValue) * 60; refreshPomoMenu() }
    @objc func workFieldChanged(_ f: NSTextField) {
        let m = max(1, min(180, f.integerValue)); workSec = Double(m) * 60; refreshPomoMenu()
    }
    @objc func breakFieldChanged(_ f: NSTextField) {
        let m = max(1, min(180, f.integerValue)); breakSec = Double(m) * 60; refreshPomoMenu()
    }

    /// Keep the main window's live fields in sync (countdown, phase, button titles, durations).
    func refreshMainWindow() {
        guard let win = mainWindow, win.isVisible else { return }
        switch pomoPhase {
        case .off:
            mainPhaseField.stringValue = "Ready"
            mainPhaseField.textColor = .secondaryLabelColor
            mainCountdownField.stringValue = fmt(workSec)
            mainCountdownField.textColor = .labelColor
        case .work:
            mainPhaseField.stringValue = pomoPaused ? "Work · paused" : "Work"
            mainPhaseField.textColor = .labelColor
            mainCountdownField.stringValue = fmt(pomoRemaining())
            mainCountdownField.textColor = pomoRemaining() <= 60 && !pomoPaused ? cOver : .labelColor
        case .onBreak:
            mainPhaseField.stringValue = "Break"
            mainPhaseField.textColor = cIdle
            mainCountdownField.stringValue = fmt(pomoRemaining())
            mainCountdownField.textColor = cIdle
        }
        mainStartBtn?.title = pomoActive ? "Stop" : "Start"
        mainPauseBtn?.isEnabled = pomoActive && pomoPhase != .onBreak
        mainPauseBtn?.title = pomoPaused ? "Resume" : "Pause"
        // Reflect any duration changes made elsewhere.
        if let f = mainWorkField, win.firstResponder != f { f.stringValue = String(Int(workSec / 60)) }
        if let f = mainBreakField, win.firstResponder != f { f.stringValue = String(Int(breakSec / 60)) }
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
            clockScale = min(max(clockScale + dir * 0.15, 0.4), 2.0)
            flipClock.setScale(clockScale)
            flipClock.set(seconds: lastSeconds, color: .white, animated: false, placeholder: lastPlaceholder)
            syncPomoClockScale()
        }
        savePrefs()
        layoutWindowContents()
    }

    /// Keep the parallel Pomodoro clock the same size as the main flip clock.
    func syncPomoClockScale() {
        pomoClock.setScale(pomoClockScale)
        if pomoActive { pomoClock.set(seconds: Int(ceil(pomoRemaining())), color: .white, animated: false, placeholder: false) }
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
        let clockX = pad + hg + 8

        // Two sections: relay timer (top) and a single Pomodoro line — glyph + countdown +
        // ▶ Start / ↺ Reset + inline progress track + W/B steppers — (bottom).
        let bandH = max(24, pomoClock.frame.height)
        let progH: CGFloat = 5, rowGap: CGFloat = 8
        let pomoClockW = pomoClock.frame.width
        let startW: CGFloat = 62, resetW: CGFloat = 62
        let wbW: CGFloat = (12 + 1 + 20 + 1 + 15) + 12 + (12 + 1 + 18 + 1 + 15) // W + gap + B blocks
        let leftClusterW = (hg + 4) + 4 + pomoClockW + 12 + startW + 6 + resetW
        let minTrack: CGFloat = 60
        let minPomoW = pad + leftClusterW + 12 + minTrack + 12 + wbW + pad + handleW

        let bandBottom = pad
        let mainBottom = bandBottom + bandH + rowGap
        let contentH = mainBottom + clockH + pad

        let rowW: CGFloat = showDetails ? (clockX + clockW + 16 + rightWidth + handleW + pad)
                                        : (clockX + clockW + handleW + pad)
        let contentW = max(rowW, minPomoW)

        // Preserve top-left: keep minX, adjust y so the top edge stays put.
        let oldTopY = win.frame.maxY
        win.setFrame(NSRect(x: win.frame.minX, y: oldTopY - contentH, width: contentW, height: contentH), display: true)

        // Relay row (top).
        hourglass.frame = NSRect(x: pad, y: mainBottom + (clockH - hg) / 2, width: hg, height: hg)
        flipClock.frame.origin = NSPoint(x: clockX, y: mainBottom)
        if showDetails {
            let rightX = clockX + clockW + 16
            let rowH: CGFloat = 16
            let labelY = mainBottom + clockH - rowH
            captionField.frame = NSRect(x: rightX, y: labelY, width: rightWidth - 60, height: rowH)
            totalField.frame = NSRect(x: rightX + rightWidth - 58, y: labelY, width: 58, height: rowH)
            let barH: CGFloat = 6
            progressTrack.frame = NSRect(x: rightX, y: mainBottom + 6, width: rightWidth, height: barH)
            progressTrack.layer?.cornerRadius = barH / 2
        }

        // Single Pomodoro line (glyph + countdown + controls), always visible.
        pomoCaptionField.isHidden = true
        var x = pad
        func place(_ v: NSView, _ w: CGFloat, _ h: CGFloat) {
            v.frame = NSRect(x: x, y: bandBottom + (bandH - h) / 2, width: w, height: h)
            x += w
        }
        place(pomoGlyphField, hg + 4, hg); x += 4
        place(pomoClock, pomoClockW, pomoClock.frame.height); x += 12
        place(winStartBtn, startW, 20); x += 6
        place(winResetBtn, resetW, 20); x += 12

        // Inline progress track filling the gap between Reset and the W/B steppers (always shown).
        let trackX = x
        let wbX = contentW - handleW - pad - wbW
        let trackW = max(minTrack, wbX - 12 - trackX)
        pomoWinTrack.isHidden = false
        pomoWinTrack.frame = NSRect(x: trackX, y: bandBottom + (bandH - progH) / 2, width: trackW, height: progH)
        pomoWinTrack.layer?.cornerRadius = progH / 2

        x = wbX
        place(winWorkLbl, 12, 14); x += 1
        place(winWorkVal, 20, 14); x += 1
        place(winWorkStepper, 15, 22); x += 12
        place(winBreakLbl, 12, 14); x += 1
        place(winBreakVal, 18, 14); x += 1
        place(winBreakStepper, 15, 22)

        resizeHandle.frame = NSRect(x: contentW - handleW, y: 0, width: handleW, height: contentH)
        closeButton.frame = NSRect(x: contentW - handleW - 16, y: contentH - 17, width: 14, height: 14)
    }

    /// Update the single Pomodoro line (countdown + glyph + progress) inside the flip-clock window.
    func updatePomoRow() {
        guard progressWindow != nil else { return }
        if !pomoActive {
            // Idle: preview the configured work duration, dim glyph, no progress.
            pomoClock.set(seconds: Int(workSec), color: NSColor(white: 0.7, alpha: 1), animated: false, placeholder: false)
            pomoGlyphField.stringValue = "🍅"
            pomoGlyphField.alphaValue = 0.45
            pomoWinFill.frame = NSRect(x: 0, y: 0, width: 0, height: pomoWinTrack.frame.height)
            return
        }
        let onBreak = pomoPhase == .onBreak
        let remaining = pomoRemaining()
        let accent: NSColor = onBreak ? cIdle : (remaining <= 60 && !pomoPaused ? cOver : cExecute)
        pomoClock.set(seconds: Int(ceil(remaining)), color: .white, animated: !pomoPaused, placeholder: false)
        pomoGlyphField.stringValue = onBreak ? "☕️" : "🍅"
        pomoGlyphField.alphaValue = pomoPaused ? 0.5 : 1
        let ratio = pomoPhaseLen > 0 ? CGFloat(pomoElapsed() / pomoPhaseLen) : 0
        let w = pomoWinTrack.frame.width
        pomoWinFill.frame = NSRect(x: 0, y: 0, width: max(0, min(1, ratio)) * w, height: pomoWinTrack.frame.height)
        pomoWinFill.layer?.backgroundColor = accent.cgColor
    }

    func setProgress(ratio: Double, color: NSColor) {
        let w = progressTrack.frame.width
        let r = max(0, min(1, CGFloat(ratio)))
        progressFill.frame = NSRect(x: 0, y: 0, width: r * w, height: progressTrack.frame.height)
        progressFill.layer?.backgroundColor = color.cgColor
    }

    func createProgressWindow() {
        let win = ControlPanelWindow(contentRect: NSRect(x: 0, y: 0, width: 320, height: 62),
                           styleMask: .borderless, backing: .buffered, defer: false)
        win.level = .floating
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = true
        win.isMovableByWindowBackground = true
        win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

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

        // ── Single Pomodoro line (countdown + glyph), always visible ───────────
        pomoClock.setScale(pomoClockScale)
        pomoClock.set(seconds: Int(workSec), color: NSColor(white: 0.7, alpha: 1), animated: false, placeholder: false)
        content.addSubview(pomoClock)

        pomoGlyphField.font = .systemFont(ofSize: 13)
        pomoGlyphField.alignment = .center
        pomoGlyphField.stringValue = "🍅"
        pomoGlyphField.alphaValue = 0.45
        content.addSubview(pomoGlyphField)

        pomoCaptionField.isHidden = true // unused in the single-line layout

        pomoWinTrack.wantsLayer = true
        pomoWinTrack.layer?.backgroundColor = NSColor(white: 1, alpha: 0.15).cgColor
        pomoWinTrack.layer?.masksToBounds = true
        pomoWinTrack.isHidden = true
        pomoWinFill.wantsLayer = true
        pomoWinFill.layer?.cornerRadius = 2.5
        pomoWinTrack.addSubview(pomoWinFill)
        content.addSubview(pomoWinTrack)

        // ── Inline Pomodoro controls row (durations + start/stop/reset) ────────
        func ctlLabel(_ s: String) -> NSTextField {
            let l = NSTextField(labelWithString: s)
            l.font = .systemFont(ofSize: 10, weight: .semibold)
            l.textColor = NSColor(white: 1, alpha: 0.6)
            return l
        }
        winWorkLbl = ctlLabel("W"); content.addSubview(winWorkLbl)
        winWorkVal = NSTextField(labelWithString: "25")
        winWorkVal.font = .monospacedDigitSystemFont(ofSize: 11, weight: .bold)
        winWorkVal.textColor = .white
        winWorkVal.alignment = .right
        content.addSubview(winWorkVal)
        winWorkStepper = NSStepper()
        winWorkStepper.minValue = 1; winWorkStepper.maxValue = 180; winWorkStepper.increment = 1
        winWorkStepper.integerValue = Int(workSec / 60)
        winWorkStepper.target = self; winWorkStepper.action = #selector(winWorkStepperChanged(_:))
        content.addSubview(winWorkStepper)

        winBreakLbl = ctlLabel("B"); content.addSubview(winBreakLbl)
        winBreakVal = NSTextField(labelWithString: "5")
        winBreakVal.font = .monospacedDigitSystemFont(ofSize: 11, weight: .bold)
        winBreakVal.textColor = .white
        winBreakVal.alignment = .right
        content.addSubview(winBreakVal)
        winBreakStepper = NSStepper()
        winBreakStepper.minValue = 1; winBreakStepper.maxValue = 180; winBreakStepper.increment = 1
        winBreakStepper.integerValue = Int(breakSec / 60)
        winBreakStepper.target = self; winBreakStepper.action = #selector(winBreakStepperChanged(_:))
        content.addSubview(winBreakStepper)

        winStartBtn = NSButton(title: "", target: self, action: #selector(togglePomodoro))
        winStartBtn.isBordered = false
        content.addSubview(winStartBtn)

        winResetBtn = NSButton(title: "", target: self, action: #selector(resetPomodoro))
        winResetBtn.isBordered = false
        content.addSubview(winResetBtn)

        resizeHandle.onDrag = { [weak self] delta in self?.dragResize(delta) }
        resizeHandle.onEnd = { [weak self] in self?.savePrefs() }
        content.addSubview(resizeHandle)

        win.contentView = content
        progressWindow = win
        flipClock.onResize = { [weak self] in self?.layoutWindowContents() }
        pomoClock.onResize = { [weak self] in self?.layoutWindowContents() }

        flipClock.set(seconds: 0, color: .white, animated: false, placeholder: true)
        refreshWinControls()
        updatePomoRow()
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
            clockScale = min(max(dragStartScale + delta / 120, 0.4), 2.0)
            flipClock.setScale(clockScale)
            flipClock.set(seconds: lastSeconds, color: .white, animated: false, placeholder: lastPlaceholder)
            syncPomoClockScale()
        }
        layoutWindowContents()
    }

    // MARK: Render

    var lastSeconds = 0
    var lastPlaceholder = true

    func render() {
        guard statusItem.button != nil else { return }
        let barVisible = progressWindow?.isVisible ?? false

        // A running Pomodoro owns the menu-bar title (pomoTick drives it); the relay still
        // updates the flip-clock window so it never goes blank. setBar no-ops while active.
        func setBar(_ text: String, color: NSColor?) {
            if pomoActive { return }
            setTitle(text, color: color)
        }

        func showClock(seconds: Int, color: NSColor, animated: Bool, placeholder: Bool) {
            lastSeconds = seconds; lastPlaceholder = placeholder
            flipClock.set(seconds: seconds, color: color, animated: animated, placeholder: placeholder)
        }

        guard configured else {
            setBar("⚙ set up timer", color: .secondaryLabelColor)
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
            setBar("– not tracking", color: .secondaryLabelColor)
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
        setBar(title, color: overrun ? .systemRed : nil)
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
        updatePomoRow()
    }
}

let app = NSApplication.shared
// .accessory (menu-bar agent, no Dock icon): required so the floating timer window can sit on top
// of OTHER apps' full-screen spaces. A .regular app loses that ability.
app.setActivationPolicy(.accessory)
let controller = TimerController()
app.delegate = controller
controller.showMainWindow()
app.run()
