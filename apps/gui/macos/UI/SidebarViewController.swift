import Cocoa

/// Sidebar: list of sessions in the current workspace.
final class SidebarViewController: NSViewController {
    private let rpcClient: RpcClient
    private let tableView = NSTableView()

    init(rpcClient: RpcClient) {
        self.rpcClient = rpcClient
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = NSView()
        let scrollView = NSScrollView()
        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = true
        view.addSubview(scrollView)
        // Layout constraints — placeholder (will be set via Xcode / AutoLayout)
    }

    // Placeholder — full implementation in #162
}