import Cocoa

/// Input bar with text field, send button, and @file completion popover.
final class InputBarView: NSView, NSTextFieldDelegate, NSPopoverDelegate {
    private let rpcClient: any RpcClientProtocol
    private let textField: NSTextField = {
        let field = NSTextField()
        field.placeholderString = "Type a message… (@ to mention files)"
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

    // Completion popover state
    private var completionPopover: NSPopover?
    private let completionVC = FileCompletionViewController()
    private var currentQuery = ""
    private var debounceTimer: Timer?
    private var workDir: String

    init(rpcClient: any RpcClientProtocol, workDir: String = FileManager.default.currentDirectoryPath) {
        self.rpcClient = rpcClient
        self.workDir = workDir
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

    // MARK: - Actions

    @objc private func didPressSend() {
        let text = textField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        completionPopover?.close()
        onSend?(text)
        textField.stringValue = ""
    }

    // MARK: - NSTextFieldDelegate

    func controlTextDidChange(_ obj: Notification) {
        // Use sendButton action for Return key
        checkForCompletion()
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(insertNewline(_:)) {
            didPressSend()
            return true // Handled
        }
        if commandSelector == #selector(moveUp(_:)) {
            completionVC.selectPrevious()
            return true
        }
        if commandSelector == #selector(moveDown(_:)) {
            completionVC.selectNext()
            return true
        }
        if commandSelector == #selector(insertTab(_:)) || commandSelector == #selector(insertNewline(_:)) {
            if completionPopover?.isShown == true, let selected = completionVC.selectedFile {
                insertCompletion(selected)
                return true
            }
        }
        if commandSelector == #selector(cancelOperation(_:)) {
            completionPopover?.close()
            return true
        }
        return false
    }

    // MARK: - @file Completion

    private func checkForCompletion() {
        let text = textField.stringValue
        let cursorPos = textField.currentEditor()?.selectedRange.location ?? text.count

        // Find the last @ before cursor
        let prefix = String(text.prefix(cursorPos))
        if let atRange = prefix.lastRangeOf("@") {
            let queryStart = text.index(after: atRange.lowerBound)
            let queryEnd = text.index(text.startIndex, offsetBy: cursorPos)
            currentQuery = String(text[queryStart..<queryEnd])

            // Only trigger if query is reasonably short
            if currentQuery.count <= 100 {
                showCompletionPopover()
                // Debounce the actual RPC call
                debounceTimer?.invalidate()
                debounceTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: false) { [weak self] _ in
                    Task { @MainActor in
                        self?.fetchCompletions()
                    }
                }
                return
            }
        }

        // No @ detected, close popover
        completionPopover?.close()
    }

    private func showCompletionPopover() {
        guard completionPopover == nil || !(completionPopover?.isShown ?? false) else { return }

        let popover = NSPopover()
        popover.contentViewController = completionVC
        popover.behavior = .transient
        popover.delegate = self
        popover.show(
            relativeTo: textField.bounds,
            of: textField,
            preferredEdge: .minY
        )
        completionPopover = popover
    }

    private func fetchCompletions() {
        Task { @MainActor in
            do {
                let result = try await rpcClient.call(
                    method: "workspace.suggestFiles",
                    params: ["workDir": workDir, "query": currentQuery]
                )

                if let dict = result as? [String: Any],
                   let files = dict["files"] as? [[String: Any]] {
                    let suggestions = files.compactMap { f -> FileCompletionItem? in
                        guard let path = f["path"] as? String else { return nil }
                        let name = f["name"] as? String ?? path
                        return FileCompletionItem(path: path, name: name)
                    }
                    completionVC.updateItems(suggestions) { [weak self] selected in
                        self?.insertCompletion(selected)
                    }
                }
            } catch {
                // Silently fail — no completions to show
                completionPopover?.close()
            }
        }
    }

    private func insertCompletion(_ item: FileCompletionItem) {
        let text = textField.stringValue
        let cursorPos = textField.currentEditor()?.selectedRange.location ?? text.count
        let prefix = String(text.prefix(cursorPos))

        guard let atRange = prefix.lastRangeOf("@") else { return }

        let beforeAt = String(text[..<atRange.lowerBound])
        let afterQuery = String(text.suffix(from: text.index(text.startIndex, offsetBy: cursorPos)))

        // Properly escape the file path
        let escapedPath = escapeFilePath(item.path)
        textField.stringValue = "\(beforeAt)@\(escapedPath) \(afterQuery)"

        // Move cursor after the inserted path
        let newCursor = beforeAt.count + 1 + escapedPath.count + 1
        if let editor = textField.currentEditor() {
            editor.selectedRange = NSRange(location: newCursor, length: 0)
        }

        completionPopover?.close()
    }

    /// Escape a file path for safe insertion into the prompt.
    /// Adds quotes if path contains spaces or special characters.
    private func escapeFilePath(_ path: String) -> String {
        if path.contains(" ") || path.contains("'") || path.contains("\"") || path.contains("\\") {
            let escaped = path
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            return "\"\(escaped)\""
        }
        return path
    }
}

// MARK: - String Helpers

private extension String {
    /// Find the last occurrence of a substring.
    func lastRangeOf(_ search: String) -> Range<String.Index>? {
        range(of: search, options: .backwards)
    }
}

// MARK: - File Completion Model

struct FileCompletionItem {
    let path: String
    let name: String
}

/// Popover content for file completion list.
final class FileCompletionViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    private let tableView = NSTableView()
    private var items: [FileCompletionItem] = []
    private var onSelect: ((FileCompletionItem) -> Void)?

    var selectedFile: FileCompletionItem? {
        let row = tableView.selectedRow
        guard row >= 0, row < items.count else { return nil }
        return items[row]
    }

    override func loadView() {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = false
        scrollView.borderType = .noBorder

        let column = NSTableColumn(identifier: .fileCompletionColumn)
        column.title = "File"
        column.minWidth = 200
        column.maxWidth = 400
        tableView.addTableColumn(column)
        tableView.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        tableView.headerView = nil
        tableView.dataSource = self
        tableView.delegate = self
        tableView.selectionHighlightStyle = .regular
        tableView.backgroundColor = .windowBackgroundColor

        scrollView.documentView = tableView

        view = scrollView
        preferredContentSize = NSSize(width: 320, height: 200)
    }

    func updateItems(_ newItems: [FileCompletionItem], onSelect: @escaping (FileCompletionItem) -> Void) {
        self.items = newItems
        self.onSelect = onSelect
        tableView.reloadData()

        // Auto-select first item
        if !items.isEmpty {
            tableView.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
        }
    }

    func selectPrevious() {
        let current = tableView.selectedRow
        let prev = max(0, current - 1)
        tableView.selectRowIndexes(IndexSet(integer: prev), byExtendingSelection: false)
        tableView.scrollRowToVisible(prev)
    }

    func selectNext() {
        let current = tableView.selectedRow
        let next = min(items.count - 1, current + 1)
        if next > current {
            tableView.selectRowIndexes(IndexSet(integer: next), byExtendingSelection: false)
            tableView.scrollRowToVisible(next)
        }
    }

    // MARK: - NSTableViewDataSource

    func numberOfRows(in tableView: NSTableView) -> Int {
        items.count
    }

    // MARK: - NSTableViewDelegate

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < items.count else { return nil }

        let cell = tableView.makeView(withIdentifier: .fileCompletionCell, owner: nil)
            as? NSTableCellView ?? NSTableCellView()

        let item = items[row]
        let textField = NSTextField(labelWithString: item.name)
        textField.font = NSFont.systemFont(ofSize: 12)
        cell.textField = textField
        cell.addSubview(textField)
        textField.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            textField.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8),
            textField.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -8),
            textField.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        cell.identifier = .fileCompletionCell

        // Tooltip shows full path
        cell.toolTip = item.path

        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        guard let selected = selectedFile else { return }
        onSelect?(selected)
    }
}

private extension NSUserInterfaceItemIdentifier {
    static let fileCompletionColumn = NSUserInterfaceItemIdentifier("fileCompletionColumn")
    static let fileCompletionCell = NSUserInterfaceItemIdentifier("fileCompletionCell")
}
