import Cocoa

/// Settings panel for model, permission, and thinking configuration.
final class SettingsViewController: NSViewController {
    private let rpcClient: any RpcClientProtocol
    private let sessionId: String

    // Model
    private let modelLabel = NSTextField(labelWithString: "Model:")
    private let modelField = NSTextField(string: "")
    private let modelSaveButton = NSButton(title: "Update", target: nil, action: nil)

    // Thinking
    private let thinkingLabel = NSTextField(labelWithString: "Thinking:")
    private let thinkingPopup = NSPopUpButton()
    private let thinkingSaveButton = NSButton(title: "Set", target: nil, action: nil)

    // Permission
    private let permissionLabel = NSTextField(labelWithString: "Permission:")
    private let permissionPopup = NSPopUpButton()
    private let permissionSaveButton = NSButton(title: "Set", target: nil, action: nil)

    init(rpcClient: any RpcClientProtocol, sessionId: String) {
        self.rpcClient = rpcClient
        self.sessionId = sessionId
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        let view = NSView()
        view.frame = NSRect(x: 0, y: 0, width: 400, height: 250)

        // Model section
        modelLabel.translatesAutoresizingMaskIntoConstraints = false
        modelField.translatesAutoresizingMaskIntoConstraints = false
        modelField.placeholderString = "e.g., claude-sonnet-4-20250514"
        modelSaveButton.translatesAutoresizingMaskIntoConstraints = false
        modelSaveButton.bezelStyle = .rounded
        modelSaveButton.action = #selector(saveModel)
        modelSaveButton.target = self

        // Thinking section
        thinkingLabel.translatesAutoresizingMaskIntoConstraints = false
        thinkingPopup.translatesAutoresizingMaskIntoConstraints = false
        thinkingPopup.addItems(withTitles: ["Default", "Enabled", "Disabled"])
        thinkingPopup.selectItem(at: 0)
        thinkingSaveButton.translatesAutoresizingMaskIntoConstraints = false
        thinkingSaveButton.bezelStyle = .rounded
        thinkingSaveButton.action = #selector(saveThinking)
        thinkingSaveButton.target = self

        // Permission section
        permissionLabel.translatesAutoresizingMaskIntoConstraints = false
        permissionPopup.translatesAutoresizingMaskIntoConstraints = false
        permissionPopup.addItems(withTitles: ["Default", "Allow All", "Ask Each"])
        permissionPopup.selectItem(at: 0)
        permissionSaveButton.translatesAutoresizingMaskIntoConstraints = false
        permissionSaveButton.bezelStyle = .rounded
        permissionSaveButton.action = #selector(savePermission)
        permissionSaveButton.target = self

        view.addSubview(modelLabel)
        view.addSubview(modelField)
        view.addSubview(modelSaveButton)
        view.addSubview(thinkingLabel)
        view.addSubview(thinkingPopup)
        view.addSubview(thinkingSaveButton)
        view.addSubview(permissionLabel)
        view.addSubview(permissionPopup)
        view.addSubview(permissionSaveButton)

        NSLayoutConstraint.activate([
            // Model
            modelLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 20),
            modelLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),

            modelField.centerYAnchor.constraint(equalTo: modelLabel.centerYAnchor),
            modelField.leadingAnchor.constraint(equalTo: modelLabel.trailingAnchor, constant: 12),
            modelField.widthAnchor.constraint(equalToConstant: 220),

            modelSaveButton.centerYAnchor.constraint(equalTo: modelLabel.centerYAnchor),
            modelSaveButton.leadingAnchor.constraint(equalTo: modelField.trailingAnchor, constant: 8),

            // Thinking
            thinkingLabel.topAnchor.constraint(equalTo: modelLabel.bottomAnchor, constant: 24),
            thinkingLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),

            thinkingPopup.centerYAnchor.constraint(equalTo: thinkingLabel.centerYAnchor),
            thinkingPopup.leadingAnchor.constraint(equalTo: thinkingLabel.trailingAnchor, constant: 12),

            thinkingSaveButton.centerYAnchor.constraint(equalTo: thinkingLabel.centerYAnchor),
            thinkingSaveButton.leadingAnchor.constraint(equalTo: thinkingPopup.trailingAnchor, constant: 8),

            // Permission
            permissionLabel.topAnchor.constraint(equalTo: thinkingLabel.bottomAnchor, constant: 24),
            permissionLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),

            permissionPopup.centerYAnchor.constraint(equalTo: permissionLabel.centerYAnchor),
            permissionPopup.leadingAnchor.constraint(equalTo: permissionLabel.trailingAnchor, constant: 12),

            permissionSaveButton.centerYAnchor.constraint(equalTo: permissionLabel.centerYAnchor),
            permissionSaveButton.leadingAnchor.constraint(equalTo: permissionPopup.trailingAnchor, constant: 8),
        ])

        self.view = view
        preferredContentSize = NSSize(width: 400, height: 250)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadCurrentSettings()
    }

    private func loadCurrentSettings() {
        Task { @MainActor in
            do {
                let result = try await rpcClient.call(
                    method: "session.getConfig",
                    params: ["sessionId": sessionId]
                )
                if let dict = result as? [String: Any] {
                    if let model = dict["model"] as? String {
                        modelField.stringValue = model
                    }
                }
            } catch {
                // Silently fail
            }
        }
    }

    @objc private func saveModel() {
        let model = modelField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !model.isEmpty else { return }

        Task { @MainActor in
            do {
                try await rpcClient.call(
                    method: "session.setModel",
                    params: ["sessionId": sessionId, "model": model]
                )
            } catch {
                print("Failed to set model: \(error)")
            }
        }
    }

    @objc private func saveThinking() {
        let value = thinkingPopup.titleOfSelectedItem ?? "Default"
        let enabled: Bool?
        switch value {
        case "Enabled": enabled = true
        case "Disabled": enabled = false
        default: enabled = nil
        }

        Task { @MainActor in
            do {
                try await rpcClient.call(
                    method: "session.setThinking",
                    params: ["sessionId": sessionId, "enabled": enabled as Any]
                )
            } catch {
                print("Failed to set thinking: \(error)")
            }
        }
    }

    @objc private func savePermission() {
        let value = permissionPopup.titleOfSelectedItem ?? "Default"
        let mode: String?
        switch value {
        case "Allow All": mode = "allow_all"
        case "Ask Each": mode = "ask_each"
        default: mode = nil
        }

        Task { @MainActor in
            do {
                try await rpcClient.call(
                    method: "session.setPermission",
                    params: ["sessionId": sessionId, "mode": mode as Any]
                )
            } catch {
                print("Failed to set permission: \(error)")
            }
        }
    }
}
