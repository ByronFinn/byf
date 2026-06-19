import Cocoa

/// Tab view: one tab per open session, each containing a ChatViewController.
final class TabViewController: NSViewController {
    private let rpcClient: RpcClient
    private let tabView = NSTabView()

    init(rpcClient: RpcClient) {
        self.rpcClient = rpcClient
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = tabView
    }

    func routeEvent(sessionId: String, event: Any) {
        // Find or create tab for this sessionId, forward event
        // Placeholder — full implementation in #162/#163
    }
}