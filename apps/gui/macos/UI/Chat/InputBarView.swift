import Cocoa

/// The type of completion currently active.
private enum CompletionMode {
    case file(query: String)
    case command(query: String)
    case none
}

/// Input bar with text field, send button, @file and /command completions.
final class InputBarView: NSView, NSTextFieldDelegate, NSPopoverDelegate {
    private let rpcClient: any RpcClientProtocol
    private let textField: NSTextField = {
        let field = NSTextField()
        field.placeholderString = "Type a message… (@file, /command)"
        field.bezelStyle = .roundedBezel
        field.font = NSFont.systemFont(ofSize: 13)
        field.translatesAutoresizingMaskIntoConstraints = false
        field.isContinuous = false
        return field
    }()

    private let sendButton: NSButton = {
        let button = NSButton(title: "Send", target: nil, action: nil)
        button.bezelStyle = .rounded
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }()

    /// Called when the user clicks Send or presses Return.
    var onSend: ((String) -> Void)?

    // Popover + completion state
    private var completionPopover: NSPopover?
    private var completionMode: CompletionMode = .none
    private var debounceTimer: Timer?
    private var workDir: String

    // File completion
    private let fileCompletionVC = FileCompletionViewController()

    // Command completion
    private let commandRegistry: CommandRegistry
    private let commandCompletionVC = CommandCompletionViewController()

    init(rpcClient: any RpcClientProtocol, workDir: String = FileManager.default.currentDirectoryPath) {
        self.rpcClient = rpcClient
        self.workDir = workDir
        self.commandRegistry = CommandRegistry(rpcClient: rpcClient)
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupView() {
        textField.delegate = self

        addSubview(textField)
        addSubview(sendButton)

        NSLayoutConstraint.activate([
            textField.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            textField.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            textField.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),

            sendButton.leadingAnchor.constraint(equalTo: textField.trailingAnchor, constant: 8),
            sendButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            sendButton.centerYAnchor.constraint(equalTo: textField.centerYAnchor),
            sendButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 60),
        ])

        sendButton.action = #selector(didPressSend)
        sendButton.target = self
    }

    /// Update the workspace directory for file completion.
    func setWorkDir(_ newWorkDir: String) {
        workDir = newWorkDir
    }

    /// Load commands from the engine (called after session start).
    func loadCommands() async {
        await commandRegistry.loadSkills()
    }

    // MARK: - Actions

    @objc private func didPressSend() {
        let text = textField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        dismissPopover()
        onSend?(text)
        textField.stringValue = ""
    }

    // MARK: - NSTextFieldDelegate

    func controlTextDidChange(_ obj: Notification) {
        checkForCompletion()
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(insertNewline(_:)) {
            if completionPopover?.isShown == true {
                // Accept current completion on Enter
                return acceptCompletion()
            }
            didPressSend()
            return true
        }
        if commandSelector == #selector(moveUp(_:)) {
            movePopoverSelection(up: true)
            return true
        }
        if commandSelector == #selector(moveDown(_:)) {
            movePopoverSelection(up: false)
            return true
        }
        if commandSelector == #selector(insertTab(_:)) {
            if completionPopover?.isShown == true {
                return acceptCompletion()
            }
            return false
        }
        if commandSelector == #selector(cancelOperation(_:)) {
            dismissPopover()
            return true
        }
        return false
    }

    // MARK: - Completion Detection

    private func checkForCompletion() {
        let text = textField.stringValue
        let cursorPos = textField.currentEditor()?.selectedRange.location ?? text.count
        let prefix = String(text.prefix(cursorPos))

        // Check for @file completion
        if let atRange = prefix.lastRangeOf("@") {
            let queryStart = text.index(after: atRange.lowerBound)
            let queryEnd = text.index(text.startIndex, offsetBy: cursorPos)
            let query = String(text[queryStart..<queryEnd])

            if query.count <= 100 {
                completionMode = .file(query: query)
                showCompletionPopover(contentVC: fileCompletionVC)
                debounceWith { [weak self] in self?.fetchFileCompletions(query: query) }
                return
            }
        }

        // Check for /command completion (only at start of text or after whitespace)
        if let slashRange = prefix.lastRangeOf("/") {
            // Only if slash is the first char or preceded by whitespace
            if slashRange.lowerBound == text.startIndex || text[text.index(before: slashRange.lowerBound)].isWhitespace {
                let queryStart = text.index(after: slashRange.lowerBound)
                let queryEnd = text.index(text.startIndex, offsetBy: cursorPos)
                let query = String(text[queryStart..<queryEnd])

                if query.count <= 100 {
                    completionMode = .command(query: query)
                    showCompletionPopover(contentVC: commandCompletionVC)
                    updateCommandCompletions(query: query)
                    return
                }
            }
        }

        // No completion trigger, close popover
        completionMode = .none
        dismissPopover()
    }

    // MARK: - Popover Management

    private func showCompletionPopover(contentVC: NSViewController) {
        guard completionPopover == nil || !(completionPopover?.isShown ?? false) else { return }

        let popover = NSPopover()
        popover.contentViewController = contentVC
        popover.behavior = .transient
        popover.delegate = self
        popover.show(
            relativeTo: textField.bounds,
            of: textField,
            preferredEdge: .minY
        )
        completionPopover = popover
    }

    private func dismissPopover() {
        completionPopover?.close()
        completionPopover = nil
    }

    private func debounceWith(_ action: @escaping () -> Void) {
        debounceTimer?.invalidate()
        debounceTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: false) { _ in
            Task { @MainActor in action() }
        }
    }

    private func movePopoverSelection(up: Bool) {
        guard completionPopover?.isShown == true else { return }
        switch completionMode {
        case .file:
            up ? fileCompletionVC.selectPrevious() : fileCompletionVC.selectNext()
        case .command:
            up ? commandCompletionVC.selectPrevious() : commandCompletionVC.selectNext()
        case .none:
            break
        }
    }

    private func acceptCompletion() -> Bool {
        guard completionPopover?.isShown == true else { return false }
        switch completionMode {
        case .file:
            if let selected = fileCompletionVC.selectedFile {
                insertFileCompletion(selected)
                return true
            }
        case .command:
            if let selected = commandCompletionVC.selectedCommand {
                executeCommand(selected)
                return true
            }
        case .none:
            break
        }
        return false
    }

    // MARK: - @file Completion

    private func fetchFileCompletions(query: String) {
        Task { @MainActor in
            do {
                let result = try await rpcClient.call(
                    method: "workspace.suggestFiles",
                    params: ["workDir": workDir, "query": query]
                )

                if let dict = result as? [String: Any],
                   let files = dict["files"] as? [[String: Any]] {
                    let suggestions = files.compactMap { f -> FileCompletionItem? in
                        guard let path = f["path"] as? String else { return nil }
                        let name = f["name"] as? String ?? path
                        return FileCompletionItem(path: path, name: name)
                    }
                    fileCompletionVC.updateItems(suggestions) { [weak self] selected in
                        self?.insertFileCompletion(selected)
                    }
                }
            } catch {
                dismissPopover()
            }
        }
    }

    private func insertFileCompletion(_ item: FileCompletionItem) {
        let text = textField.stringValue
        let cursorPos = textField.currentEditor()?.selectedRange.location ?? text.count
        let prefix = String(text.prefix(cursorPos))

        guard let atRange = prefix.lastRangeOf("@") else { return }

        let beforeAt = String(text[..<atRange.lowerBound])
        let afterQuery = String(text.suffix(from: text.index(text.startIndex, offsetBy: cursorPos)))

        let escapedPath = escapeFilePath(item.path)
        textField.stringValue = "\(beforeAt)@\(escapedPath) \(afterQuery)"

        let newCursor = beforeAt.count + 1 + escapedPath.count + 1
        if let editor = textField.currentEditor() {
            editor.selectedRange = NSRange(location: newCursor, length: 0)
        }

        dismissPopover()
    }

    private func escapeFilePath(_ path: String) -> String {
        if path.contains(" ") || path.contains("'") || path.contains("\"") || path.contains("\\") {
            let escaped = path
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            return "\"\(escaped)\""
        }
        return path
    }

    // MARK: - /command Completion

    private func updateCommandCompletions(query: String) {
        let results = commandRegistry.search(query: query)
        commandCompletionVC.updateCommands(results) { [weak self] command in
            self?.executeCommand(command)
        }
    }

    private func executeCommand(_ command: CommandDefinition) {
        switch command.action {
        case "builtin.clear":
            // Signal to clear conversation via notification
            NotificationCenter.default.post(name: .commandClearConversation, object: self)
            textField.stringValue = ""
            dismissPopover()

        case "builtin.help":
            textField.stringValue = "/help"
            didPressSend()

        case "session.compact":
            textField.stringValue = "/compact"
            didPressSend()

        case "agent.activateSkill":
            // Extract skill name from command (format: "skill:<name>")
            let skillName = command.name.replacingOccurrences(of: "skill:", with: "")
            textField.stringValue = "" // Clear input
            dismissPopover()

            // Signal to activate skill via notification
            NotificationCenter.default.post(
                name: .commandActivateSkill,
                object: self,
                userInfo: ["skillName": skillName]
            )

        default:
            textField.stringValue = "/\(command.name)"
            didPressSend()
        }
    }
}

// MARK: - String Helpers

private extension String {
    func lastRangeOf(_ search: String) -> Range<String.Index>? {
        range(of: search, options: .backwards)
    }
}

// MARK: - Notifications

extension Notification.Name {
    /// Posted when user wants to clear conversation.
    static let commandClearConversation = Notification.Name("byf.command.clearConversation")
    /// Posted when user wants to activate a skill.
    static let commandActivateSkill = Notification.Name("byf.command.activateSkill")
}
