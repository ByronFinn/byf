import Cocoa

/// Sidebar: list of sessions in the current workspace.
final class SidebarViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    private let rpcClient: any RpcClientProtocol
    let tableView = NSTableView()
    let emptyPlaceholder = NSView()

    /// The current workspace directory.
    /// Changing this triggers a reload of the session list.
    var workDir: String {
        didSet { reloadSessions() }
    }

    private var sessions: [[String: Any]] = []

    // MARK: - Column identifiers
    private let titleColumnID = NSUserInterfaceItemIdentifier("title")
    private let lastPromptColumnID = NSUserInterfaceItemIdentifier("lastPrompt")
    private let updatedAtColumnID = NSUserInterfaceItemIdentifier("updatedAt")

    init(rpcClient: any RpcClientProtocol, workDir: String = FileManager.default.currentDirectoryPath) {
        self.rpcClient = rpcClient
        self.workDir = workDir
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder

        // Configure table view
        tableView.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        tableView.allowsColumnReordering = false
        tableView.allowsMultipleSelection = false
        tableView.headerView = nil // Compact sidebar — no column headers

        let titleCol = NSTableColumn(identifier: titleColumnID)
        titleCol.title = "Session"
        titleCol.isEditable = false
        tableView.addTableColumn(titleCol)

        tableView.dataSource = self
        tableView.delegate = self

        scrollView.documentView = tableView

        // Empty/error placeholder (hidden by default)
        emptyPlaceholder.translatesAutoresizingMaskIntoConstraints = false
        emptyPlaceholder.isHidden = true
        scrollView.addSubview(emptyPlaceholder)

        view = scrollView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        reloadSessions()
    }

    // MARK: - Session Loading

    private func reloadSessions() {
        emptyPlaceholder.isHidden = true

        Task { @MainActor in
            do {
                let result = try await rpcClient.call(
                    method: "core.listSessions",
                    params: ["workDir": workDir]
                )

                if let dict = result as? [String: Any],
                   let sessionList = dict["sessions"] as? [[String: Any]] {
                    self.sessions = sessionList
                } else {
                    self.sessions = []
                }
                self.tableView.reloadData()
                self.emptyPlaceholder.isHidden = !self.sessions.isEmpty
            } catch {
                self.sessions = []
                self.tableView.reloadData()
                self.emptyPlaceholder.isHidden = false
            }
        }
    }

    /// Test helper: wait for pending async session load to complete.
    func waitForSessions() async {
        // Give the Task a chance to complete
        try? await Task.sleep(nanoseconds: 200_000_000) // 200ms
    }

    // MARK: - NSTableViewDataSource

    func numberOfRows(in tableView: NSTableView) -> Int {
        return sessions.count
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < sessions.count else { return nil }

        let session = sessions[row]
        let identifier = tableColumn?.identifier ?? titleColumnID

        // We use a single-column list so always show title
        let title = session["title"] as? String
            ?? session["id"] as? String
            ?? "Untitled Session"

        let cell = NSTableCellView()
        cell.identifier = identifier

        let textField = NSTextField(labelWithString: title)
        textField.font = NSFont.systemFont(ofSize: 12)
        cell.textField = textField
        cell.addSubview(textField)
        textField.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            textField.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8),
            textField.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -8),
            textField.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])

        return cell
    }

    // MARK: - NSTableViewDelegate

    func tableViewSelectionDidChange(_ notification: Notification) {
        let selectedRow = tableView.selectedRow
        guard selectedRow >= 0, selectedRow < sessions.count else { return }

        let session = sessions[selectedRow]
        if let sessionId = session["id"] as? String {
            // Notify the tab view controller to select/activate this session
            // The MainWindowController or AppDelegate should set this up
            NotificationCenter.default.post(
                name: .sidebarDidSelectSession,
                object: self,
                userInfo: ["sessionId": sessionId, "session": session]
            )
        }
    }
}

// MARK: - Notifications

extension Notification.Name {
    /// Posted when a session is selected in the sidebar.
    static let sidebarDidSelectSession = Notification.Name("byf.sidebar.didSelectSession")
}
