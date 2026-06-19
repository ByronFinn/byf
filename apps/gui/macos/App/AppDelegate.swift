import Cocoa

@main
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var mainWindowController: MainWindowController?
    private var engineService: ByfEngineService?
    private var rpcClient: RpcClient?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Resolve homeDir and configPath per ADR 0019
        let homeDir = NSHomeDirectory().appending("/Library/Application Support/byfDesktop")
        let configPath = NSHomeDirectory().appending("/.byf/config.toml")

        // Create engine service (sidecar SEA binary in Resources/)
        let engine = ByfEngineService(
            homeDir: homeDir,
            configPath: configPath
        )

        // Create RPC client
        let client = RpcClient(engine: engine)

        // Wire up event handling
        client.onEvent = { [weak self] event in
            // Route event to the active session tab
            guard let sessionId = event["sessionId"] as? String ?? event["_sessionId"] as? String else { return }
            Task { @MainActor in
                self?.mainWindowController?.routeEvent(sessionId: sessionId, event: event)
            }
        }

        // Wire up reverse-RPC (approval/question dialogs)
        client.onReverseRequest = { [weak self] method, params, respond in
            Task { @MainActor in
                self?.handleReverseRequest(method: method, params: params, respond: respond)
            }
        }

        self.engineService = engine
        self.rpcClient = client

        // Start the engine
        do {
            try engine.start(rpcHandler: { [weak client] line in
                client?.handleFrame(line)
            })
        } catch {
            NSAlert(error: error).runModal()
            NSApp.terminate(nil)
        }

        // Create and show main window
        let windowController = MainWindowController(rpcClient: client)
        windowController.showWindow(nil)
        self.mainWindowController = windowController

        // Perform healthcheck
        Task {
            await performHealthcheck(client: client)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        engineService?.stop()
    }

    // MARK: - Healthcheck

    private func performHealthcheck(client: RpcClient) async {
        do {
            let result = try await client.call(method: "core.listSessions", params: ["workDir": FileManager.default.currentDirectoryPath])
            print("Engine healthcheck OK: \(result)")
        } catch {
            print("Engine healthcheck failed: \(error)")
            // Engine is not ready; show error state
        }
    }

    // MARK: - Reverse RPC

    private func handleReverseRequest(method: String, params: Any, respond: @escaping (Any?, Error?) -> Void) {
        switch method {
        case "requestApproval":
            guard let params = params as? [String: Any] else { return }
            // Show approval dialog
            let toolName = params["toolName"] as? String ?? "Unknown"
            let action = params["action"] as? String ?? ""
            let alert = NSAlert()
            alert.messageText = "Approve: \(toolName)"
            alert.informativeText = action
            alert.addButton(withTitle: "Approve")
            alert.addButton(withTitle: "Reject")
            alert.addButton(withTitle: "Cancel")

            let response = alert.runModal()
            switch response {
            case .alertFirstButtonReturn:
                respond(["decision": "approved"], nil)
            case .alertSecondButtonReturn:
                respond(["decision": "rejected", "feedback": "User rejected via dialog"], nil)
            default:
                respond(["decision": "cancelled"], nil)
            }

        case "requestQuestion":
            // Show multi-option question dialog
            // Placeholder — full implementation in #167
            respond(nil, nil)

        default:
            respond(nil, RpcError.responseError("Unknown reverse method: \(method)"))
        }
    }
}