import Cocoa

/// Main window with NSSplitView: left sidebar + right tab view.
///
/// Wires sidebar session selection to tab creation/switch.
final class MainWindowController: NSWindowController {
    let splitViewController = NSSplitViewController()
    let sidebarViewController: SidebarViewController
    let tabViewController: TabViewController

    init(rpcClient: any RpcClientProtocol) {
        sidebarViewController = SidebarViewController(rpcClient: rpcClient)
        tabViewController = TabViewController(rpcClient: rpcClient)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "BYF Desktop"
        window.minSize = NSSize(width: 800, height: 500)
        super.init(window: window)

        setupSplitView()
        observeSidebarSelection()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupSplitView() {
        let splitVC = splitViewController
        splitVC.splitView.isVertical = true
        splitVC.splitView.dividerStyle = .thin

        // Sidebar item — left panel with ~250pt preferred width
        let sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebarViewController)
        sidebarItem.minimumThickness = 180
        sidebarItem.maximumThickness = 400

        // Tab item — main content area
        let tabItem = NSSplitViewItem(viewController: tabViewController)

        splitVC.addSplitViewItem(sidebarItem)
        splitVC.addSplitViewItem(tabItem)

        // Set the split view controller as the window's content view controller
        window?.contentViewController = splitVC
    }

    /// Listen for sidebar session selection to open/switch tabs.
    private func observeSidebarSelection() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSidebarSelection(_:)),
            name: .sidebarDidSelectSession,
            object: sidebarViewController
        )
    }

    @objc
    private func handleSidebarSelection(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let sessionId = userInfo["sessionId"] as? String else { return }

        // Switch to existing tab or create a new one
        tabViewController.switchToTab(sessionId: sessionId)

        // If the tab doesn't exist yet, add it for this existing session
        let exists = tabViewController.tabView.tabViewItems.contains(where: {
            $0.identifier as? String == sessionId
        })
        if !exists {
            let title = (userInfo["session"] as? [String: Any])?["title"] as? String ?? "Session"
            tabViewController.addTab(sessionId: sessionId, title: title)
        }
    }

    /// Route an event to the correct session tab.
    func routeEvent(sessionId: String, event: Any) {
        tabViewController.routeEvent(sessionId: sessionId, event: event)
    }

    /// Change the workspace directory — refreshes the sidebar.
    func setWorkDir(_ newWorkDir: String) {
        sidebarViewController.workDir = newWorkDir
    }

    /// The underlying NSSplitView (for testing).
    var splitView: NSSplitView {
        splitViewController.splitView
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
