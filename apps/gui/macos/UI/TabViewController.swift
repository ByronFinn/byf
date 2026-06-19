import Cocoa

/// Tab view: one tab per open session, each containing a ChatViewController.
final class TabViewController: NSViewController {
    private let rpcClient: any RpcClientProtocol
    let tabView = NSTabView()
    private var pendingTabs: Set<String> = [] // sessionIds being created

    init(rpcClient: any RpcClientProtocol) {
        self.rpcClient = rpcClient
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = tabView
        tabView.tabPosition = .none // We manage tabs programmatically
        tabView.tabViewBorderType = .none
        tabView.autoresizingMask = [.width, .height]
    }

    // MARK: - Tab Management

    /// Create a new session and its corresponding tab.
    func createSessionTab() async throws {
        let result = try await rpcClient.call(method: "core.createSession", params: nil)

        guard let dict = result as? [String: Any],
              let sessionId = dict["sessionId"] as? String else {
            throw RpcError.responseError("createSession returned invalid response")
        }

        addTab(sessionId: sessionId, title: dict["title"] as? String ?? "Session")
    }

    /// Add a tab for an existing session (e.g., after resume or event routing).
    func addTab(sessionId: String, title: String = "Session") {
        guard !pendingTabs.contains(sessionId) else { return }
        pendingTabs.insert(sessionId)

        let tabItem = NSTabViewItem(identifier: sessionId)
        tabItem.label = title

        // Placeholder content — ChatViewController will be added in #163
        let placeholderVC = PlaceholderContentViewController()
        tabItem.viewController = placeholderVC

        tabView.addTabViewItem(tabItem)
        tabView.selectTabViewItem(tabItem)

        pendingTabs.remove(sessionId)
    }

    /// Switch to the tab for a given session ID.
    func switchToTab(sessionId: String) {
        for i in 0..<tabView.numberOfTabViewItems {
            if tabView.tabViewItem(at: i).identifier as? String == sessionId {
                tabView.selectTabViewItem(at: i)
                return
            }
        }
    }

    /// Close the tab for a given session.
    func closeTab(sessionId: String) {
        for i in 0..<tabView.numberOfTabViewItems {
            let tab = tabView.tabViewItem(at: i)
            if tab.identifier as? String == sessionId {
                tabView.removeTabViewItem(tab)

                // Notify engine
                Task { @MainActor in
                    try? await rpcClient.call(
                        method: "core.closeSession",
                        params: ["sessionId": sessionId]
                    )
                }
                return
            }
        }
    }

    // MARK: - Event Routing

    /// Route an incoming event to the correct session tab.
    func routeEvent(sessionId: String, event: Any) {
        // Find or create tab for this session
        var tab: NSTabViewItem?
        for i in 0..<tabView.numberOfTabViewItems {
            if tabView.tabViewItem(at: i).identifier as? String == sessionId {
                tab = tabView.tabViewItem(at: i)
                break
            }
        }

        if tab == nil {
            // Auto-create tab for unknown session (e.g., event from resume)
            addTab(sessionId: sessionId, title: "Session")
            tab = tabView.tabViewItem(at: tabView.numberOfTabViewItems - 1)
        }

        // Forward the event to the tab's content view controller
        if let vc = tab?.viewController as? EventHandlerProtocol {
            vc.handleEvent(event)
        }
    }
}

/// Protocol for view controllers that can handle events.
protocol EventHandlerProtocol: AnyObject {
    func handleEvent(_ event: Any)
}

/// Placeholder content view controller for sessions without a ChatViewController yet.
final class PlaceholderContentViewController: NSViewController, EventHandlerProtocol {
    private let label = NSTextField(labelWithString: "Session tab — ChatViewController coming in #163")

    override func loadView() {
        let view = NSView()
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor

        label.font = NSFont.systemFont(ofSize: 14)
        label.textColor = .secondaryLabelColor
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)

        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])

        self.view = view
    }

    func handleEvent(_ event: Any) {
        // Ignore events — ChatViewController will handle them in #163
    }
}
