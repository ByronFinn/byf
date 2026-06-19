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

        // Use ChatViewController for the session content (#163)
        let chatVC = ChatViewController(rpcClient: rpcClient)
        tabItem.viewController = chatVC

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
    /// Checks for running background tasks and confirms before closing.
    func closeTab(sessionId: String) {
        // Check for background tasks before closing
        Task { @MainActor in
            let hasBackgroundTasks = await checkBackgroundTasks(sessionId: sessionId)
            if hasBackgroundTasks {
                let alert = NSAlert()
                alert.messageText = "Background Tasks Running"
                alert.informativeText = "This session has running background tasks. What would you like to do?"
                alert.addButton(withTitle: "Stop Tasks & Close")
                alert.addButton(withTitle: "Keep Running (KeepAlive)")
                alert.addButton(withTitle: "Cancel")

                let response = alert.runModal()
                switch response {
                case .alertFirstButtonReturn:
                    // Stop tasks and close
                    await closeSessionWithEngine(sessionId: sessionId)
                case .alertSecondButtonReturn:
                    // KeepAlive: close but keep tasks running
                    await closeSessionWithEngine(sessionId: sessionId, keepAlive: true)
                default:
                    // Cancel close
                    return
                }
            } else {
                await closeSessionWithEngine(sessionId: sessionId)
            }
        }
    }

    /// Call core.closeSession via RPC and remove the tab.
    private func closeSessionWithEngine(sessionId: String, keepAlive: Bool = false) async {
        // Remove the tab first
        for i in 0..<tabView.numberOfTabViewItems {
            let tab = tabView.tabViewItem(at: i)
            if tab.identifier as? String == sessionId {
                tabView.removeTabViewItem(tab)
                break
            }
        }

        // Notify engine
        var params: [String: Any] = ["sessionId": sessionId]
        if keepAlive {
            params["keepAlive"] = true
        }
        let _ = try? await rpcClient.call(method: "core.closeSession", params: params)
    }

    /// Check if a session has running background tasks.
    private func checkBackgroundTasks(sessionId: String) async -> Bool {
        do {
            let result = try await rpcClient.call(
                method: "agent.getBackground",
                params: ["sessionId": sessionId]
            )
            if let dict = result as? [String: Any],
               let tasks = dict["tasks"] as? [[String: Any]] {
                return tasks.contains { ($0["status"] as? String) == "running" }
            }
        } catch {
            // If we can't check, assume no background tasks
        }
        return false
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
