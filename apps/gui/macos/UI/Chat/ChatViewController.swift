import Cocoa

/// The main chat view controller for a single session.
///
/// Architecture:
/// - NSTableView (virtualized) for message list
/// - ChatMessageCell per message with NSTextView (TextKit2)
/// - DeltaCoalescer for 16ms streaming coalescence
/// - MessageStore for data model
/// - MarkdownRenderer for message display
/// - InputBarView for user input
final class ChatViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate, EventHandlerProtocol {
    private let rpcClient: any RpcClientProtocol
    let messageStore = MessageStore()
    private let coalescer = DeltaCoalescer(interval: 0.016) // 16ms
    private lazy var tableView: NSTableView = {
        let tv = NSTableView()
        tv.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        tv.addTableColumn(NSTableColumn(identifier: .chatMessageColumn))
        tv.rowHeight = 0 // Automatic row height
        tv.usesAutomaticRowHeights = true
        tv.selectionHighlightStyle = .none
        tv.backgroundColor = .clear
        tv.dataSource = self
        tv.delegate = self
        tv.registerForDraggedTypes([])
        return tv
    }()

    private lazy var inputBar: InputBarView = {
        let bar = InputBarView(rpcClient: rpcClient)
        bar.translatesAutoresizingMaskIntoConstraints = false
        return bar
    }()

    private let scrollView = NSScrollView()

    init(rpcClient: any RpcClientProtocol) {
        self.rpcClient = rpcClient
        super.init(nibName: nil, bundle: nil)

        // Wire up coalescer
        coalescer.onFlush = { [weak self] batch in
            Task { @MainActor in
                self?.handleCoalescedBatch(batch)
            }
        }

        // Wire up input bar
        inputBar.onSend = { [weak self] text in
            self?.sendMessage(text)
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        // Listen for command notifications from input bar
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleClearConversation),
            name: .commandClearConversation,
            object: inputBar
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleActivateSkill(_:)),
            name: .commandActivateSkill,
            object: inputBar
        )

        // Load skills for command completion
        Task { @MainActor in
            await inputBar.loadCommands()
        }
    }

    override func loadView() {
        let rootView = NSView()
        rootView.wantsLayer = true

        // Scroll view with table
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.documentView = tableView

        // Input bar at bottom
        rootView.addSubview(scrollView)
        rootView.addSubview(inputBar)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: rootView.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: inputBar.topAnchor),

            inputBar.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            inputBar.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            inputBar.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),
        ])

        view = rootView
    }

    // MARK: - Message Handling

    /// Handle an incoming agent event.
    func handleEvent(_ event: Any) {
        guard let dict = event as? [String: Any],
              let type = dict["type"] as? String else { return }

        switch type {
        case "assistant.delta":
            // Route through coalescer for 16ms batching
            if let delta = dict["delta"] as? String {
                coalescer.append(delta)
            }

        case "turn.started", "turn.ended":
            // Flush any pending deltas first
            coalescer.flush()
            messageStore.handleEvent(dict)
            reloadTableView()

        case "tool.call.started", "tool.call.delta", "tool.result",
             "thinking.delta",
             "background.task.started", "background.task.updated", "background.task.terminated":
            // These events bypass coalescer
            messageStore.handleEvent(dict)
            reloadTableView()

        default:
            // Other events (user message echo, etc.)
            messageStore.handleEvent(dict)
            reloadTableView()
        }
    }

    /// Send a user message via session.prompt RPC.
    func sendMessage(_ text: String) {
        messageStore.addUserMessage(text: text)
        reloadTableView()

        Task { @MainActor in
            do {
                try await rpcClient.call(
                    method: "session.prompt",
                    params: ["text": text]
                )
            } catch {
                print("Failed to send prompt: \(error)")
            }
        }
    }

    /// Clear the current conversation.
    func clearConversation() {
        messageStore.clear()
        reloadTableView()
    }

    // MARK: - Command Handling

    @objc private func handleClearConversation() {
        clearConversation()
    }

    @objc private func handleActivateSkill(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let skillName = userInfo["skillName"] as? String else { return }

        Task { @MainActor in
            do {
                try await rpcClient.call(
                    method: "agent.activateSkill",
                    params: ["name": skillName]
                )
            } catch {
                print("Failed to activate skill '\(skillName)': \(error)")
            }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Private

    private func handleCoalescedBatch(_ batch: [String]) {
        let combined = batch.joined()
        messageStore.handleEvent(["type": "assistant.delta", "delta": combined])
        reloadLastRow()
    }

    private func reloadTableView() {
        tableView.reloadData()
        scrollToBottom()
    }

    private func reloadLastRow() {
        let lastRow = messageStore.messages.count - 1
        guard lastRow >= 0 else { return }
        tableView.noteHeightOfRows(withIndexesChanged: IndexSet(integer: lastRow))
        tableView.reloadData(forRowIndexes: IndexSet(integer: lastRow),
                             columnIndexes: IndexSet(integer: 0))
    }

    private func scrollToBottom() {
        let lastRow = messageStore.messages.count - 1
        guard lastRow >= 0 else { return }
        tableView.scrollRowToVisible(lastRow)
    }

    // MARK: - NSTableViewDataSource

    func numberOfRows(in tableView: NSTableView) -> Int {
        return messageStore.messages.count
    }

    // MARK: - NSTableViewDelegate

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < messageStore.messages.count else { return nil }

        let cell = tableView.makeView(withIdentifier: ChatMessageCell.identifier, owner: nil)
            as? ChatMessageCell ?? ChatMessageCell()

        let message = messageStore.messages[row]
        cell.configure(with: message)
        cell.identifier = ChatMessageCell.identifier

        return cell
    }
}

extension NSUserInterfaceItemIdentifier {
    static let chatMessageColumn = NSUserInterfaceItemIdentifier("chatMessage")
}
