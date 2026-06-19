import Cocoa

@main
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var mainWindowController: MainWindowController?
    private var engineService: ByfEngineService?
    private var rpcClient: RpcClient?
    private let dialogManager = DialogManager()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Set up main menu
        setupMainMenu()

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
            guard let eventDict = event as? [String: Any],
                  let sessionId = eventDict["sessionId"] as? String ?? eventDict["_sessionId"] as? String else { return }
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

        // Start the client (which starts the engine subprocess)
        do {
            try client.start()
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
            guard let params = params as? [String: Any] else { return respond(nil, RpcError.responseError("Invalid params")) }
            let toolName = params["toolName"] as? String ?? "Unknown"
            let action = params["action"] as? String ?? ""
            let display = params["display"]
            dialogManager.showApproval(toolName: toolName, action: action, display: display, respond: respond)

        case "requestQuestion":
            guard let params = params as? [String: Any] else { return respond(nil, RpcError.responseError("Invalid params")) }
            let question = params["question"] as? String ?? ""
            let options = params["options"] as? [[String: Any]] ?? []
            let multiSelect = params["multiSelect"] as? Bool ?? false
            dialogManager.showQuestion(question: question, options: options, multiSelect: multiSelect, respond: respond)

        default:
            respond(nil, RpcError.responseError("Unknown reverse method: \(method)"))
        }
    }

    // MARK: - Menu

    private func setupMainMenu() {
        let mainMenu = NSMenu()

        // BYF Desktop menu
        let appMenuItem = NSMenuItem()
        appMenuItem.submenu = NSMenu(title: "BYF Desktop")
        appMenuItem.submenu?.items = [
            NSMenuItem(title: "Settings…", action: #selector(showSettings), keyEquivalent: ","),
            NSMenuItem.separator(),
            NSMenuItem(title: "Quit BYF Desktop", action: #selector(NSApp.terminate(_:)), keyEquivalent: "q"),
        ]
        mainMenu.addItem(appMenuItem)

        // Window menu
        let windowMenuItem = NSMenuItem()
        windowMenuItem.submenu = NSMenu(title: "Window")
        windowMenuItem.submenu?.items = [
            NSMenuItem(title: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m"),
        ]
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    @objc private func showSettings() {
        guard let rpcClient = rpcClient,
              let mainWindow = mainWindowController?.window else { return }

        // For now, show settings in a simple alert with model text field
        // Full implementation would use a proper SettingsViewController
        let alert = NSAlert()
        alert.messageText = "Session Settings"
        alert.informativeText = "Runtime configuration will be available in the settings panel."
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: mainWindow, completionHandler: nil)
    }
}