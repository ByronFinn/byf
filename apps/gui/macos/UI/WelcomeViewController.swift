import Cocoa

/// Welcome view shown on first launch or when no sessions are active.
final class WelcomeViewController: NSViewController {
    private let rpcClient: any RpcClientProtocol

    private let titleLabel: NSTextField = {
        let label = NSTextField(labelWithString: "Welcome to BYF Desktop")
        label.font = NSFont.boldSystemFont(ofSize: 24)
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let subtitleLabel: NSTextField = {
        let label = NSTextField(wrappingLabelWithString: "Your AI-powered development assistant.\nStart a new session or open a recent one.")
        label.font = NSFont.systemFont(ofSize: 14)
        label.textColor = .secondaryLabelColor
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let newSessionButton: NSButton = {
        let button = NSButton(title: "New Session", target: nil, action: nil)
        button.bezelStyle = .rounded
        button.font = NSFont.systemFont(ofSize: 14)
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }()

    private let recentSessionsLabel: NSTextField = {
        let label = NSTextField(labelWithString: "Recent Sessions")
        label.font = NSFont.boldSystemFont(ofSize: 14)
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let recentSessionsTable = NSTableView()
    private var recentSessions: [[String: Any]] = []

    /// Called when user wants to create a new session.
    var onCreateSession: (() -> Void)?

    /// Called when user selects a recent session.
    var onResumeSession: ((String) -> Void)?

    init(rpcClient: any RpcClientProtocol) {
        self.rpcClient = rpcClient
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        let view = NSView()
        view.wantsLayer = true

        // Recent sessions table
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("sessionColumn"))
        column.title = "Sessions"
        recentSessionsTable.addTableColumn(column)
        recentSessionsTable.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        recentSessionsTable.headerView = nil
        recentSessionsTable.dataSource = self
        recentSessionsTable.delegate = self
        recentSessionsTable.selectionHighlightStyle = .regular

        let scrollView = NSScrollView()
        scrollView.documentView = recentSessionsTable
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .bezelBorder
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        newSessionButton.action = #selector(didPressNewSession)
        newSessionButton.target = self

        view.addSubview(titleLabel)
        view.addSubview(subtitleLabel)
        view.addSubview(newSessionButton)
        view.addSubview(recentSessionsLabel)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 60),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 12),
            subtitleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            subtitleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 40),
            subtitleLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -40),

            newSessionButton.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 24),
            newSessionButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            newSessionButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 160),

            recentSessionsLabel.topAnchor.constraint(equalTo: newSessionButton.bottomAnchor, constant: 32),
            recentSessionsLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),

            scrollView.topAnchor.constraint(equalTo: recentSessionsLabel.bottomAnchor, constant: 8),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -40),
        ])

        self.view = view
        preferredContentSize = NSSize(width: 500, height: 500)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadRecentSessions()
    }

    private func loadRecentSessions() {
        Task { @MainActor in
            do {
                let result = try await rpcClient.call(
                    method: "core.listSessions",
                    params: ["workDir": FileManager.default.currentDirectoryPath]
                )
                if let dict = result as? [String: Any],
                   let sessions = dict["sessions"] as? [[String: Any]] {
                    recentSessions = sessions
                    recentSessionsTable.reloadData()
                }
            } catch {
                // No recent sessions
            }
        }
    }

    @objc private func didPressNewSession() {
        onCreateSession?()
    }
}

// MARK: - NSTableViewDataSource

extension WelcomeViewController: NSTableViewDataSource {
    func numberOfRows(in tableView: NSTableView) -> Int {
        recentSessions.count
    }
}

// MARK: - NSTableViewDelegate

extension WelcomeViewController: NSTableViewDelegate {
    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < recentSessions.count else { return nil }

        let session = recentSessions[row]
        let title = session["title"] as? String ?? session["id"] as? String ?? "Untitled"
        let updatedAt = session["updatedAt"] as? String ?? ""

        let cell = NSTableCellView()
        let textField = NSTextField(labelWithString: title)
        textField.font = NSFont.systemFont(ofSize: 13)
        cell.textField = textField
        cell.addSubview(textField)
        textField.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            textField.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8),
            textField.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -8),
            textField.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        cell.toolTip = updatedAt

        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        let row = recentSessionsTable.selectedRow
        guard row >= 0, row < recentSessions.count else { return }
        if let sessionId = recentSessions[row]["id"] as? String {
            onResumeSession?(sessionId)
        }
    }
}
