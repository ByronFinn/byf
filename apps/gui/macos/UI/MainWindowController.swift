import Cocoa

/// Main window with NSSplitView: left sidebar + right tab view.
final class MainWindowController: NSWindowController {
    private let splitView = NSSplitView()
    private let sidebarViewController: SidebarViewController
    private let tabViewController: TabViewController

    init(rpcClient: RpcClient) {
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
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupSplitView() {
        guard let window = window else { return }
        splitView.isVertical = true
        splitView.dividerStyle = .thin

        let sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebarViewController)
        let tabItem = NSSplitViewItem(viewController: tabViewController)

        splitView.addSplitViewItem(sidebarItem)
        splitView.addSplitViewItem(tabItem)

        window.contentView = splitView
    }

    /// Route an event to the correct session tab.
    func routeEvent(sessionId: String, event: Any) {
        tabViewController.routeEvent(sessionId: sessionId, event: event)
    }
}