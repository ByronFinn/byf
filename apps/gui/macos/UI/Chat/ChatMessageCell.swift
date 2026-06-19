import Cocoa

/// A table cell view that displays a single chat message using NSTextView (TextKit2).
///
/// Supports different message roles:
/// - user/assistant/system: text with role label
/// - toolCall: collapsible card view
/// - thinking: styled thinking block
/// - backgroundTask: summary card
final class ChatMessageCell: NSTableCellView {
    static let identifier = NSUserInterfaceItemIdentifier("ChatMessageCell")
    static let toolCallIdentifier = NSUserInterfaceItemIdentifier("ToolCallCell")
    static let thinkingIdentifier = NSUserInterfaceItemIdentifier("ThinkingCell")
    static let backgroundTaskIdentifier = NSUserInterfaceItemIdentifier("BackgroundTaskCell")

    /// Shared text view for text-based messages.
    private let messageTextView: NSTextView = {
        let textView = NSTextView()
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 12, height: 8)
        textView.textContainer?.lineFragmentPadding = 0
        textView.autoresizingMask = [.width]
        return textView
    }()

    private let roleLabel: NSTextField = {
        let label = NSTextField(labelWithString: "")
        label.font = NSFont.boldSystemFont(ofSize: 11)
        label.textColor = .secondaryLabelColor
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    /// Tool call card (for toolCall role messages, shown/hidden as needed).
    private let toolCallCard = ToolCallCardView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupView() {
        roleLabel.translatesAutoresizingMaskIntoConstraints = false
        messageTextView.translatesAutoresizingMaskIntoConstraints = false
        toolCallCard.translatesAutoresizingMaskIntoConstraints = false

        addSubview(roleLabel)
        addSubview(messageTextView)
        addSubview(toolCallCard)

        NSLayoutConstraint.activate([
            roleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            roleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            roleLabel.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -12),

            messageTextView.topAnchor.constraint(equalTo: roleLabel.bottomAnchor, constant: 2),
            messageTextView.leadingAnchor.constraint(equalTo: leadingAnchor),
            messageTextView.trailingAnchor.constraint(equalTo: trailingAnchor),
            messageTextView.bottomAnchor.constraint(equalTo: bottomAnchor),

            toolCallCard.topAnchor.constraint(equalTo: roleLabel.bottomAnchor, constant: 2),
            toolCallCard.leadingAnchor.constraint(equalTo: leadingAnchor),
            toolCallCard.trailingAnchor.constraint(equalTo: trailingAnchor),
            toolCallCard.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    func configure(with message: Message) {
        // Reset visibility
        messageTextView.isHidden = true
        toolCallCard.isHidden = true

        switch message.role {
        case .user:
            roleLabel.stringValue = "You"
            roleLabel.textColor = .secondaryLabelColor
            showTextView(with: message)

        case .assistant:
            roleLabel.stringValue = "Assistant"
            roleLabel.textColor = .secondaryLabelColor
            showTextView(with: message)

        case .system:
            roleLabel.stringValue = "System"
            roleLabel.textColor = .tertiaryLabelColor
            showTextView(with: message)

        case .toolCall:
            roleLabel.stringValue = "Tool Call"
            roleLabel.textColor = NSColor.systemBlue
            messageTextView.isHidden = true
            toolCallCard.isHidden = false

            // Parse tool call info from message text
            let lines = message.text.components(separatedBy: "\n")
            let toolName = lines.first?.trimmingCharacters(in: CharacterSet(charactersIn: "*")) ?? "Tool"
            let hasResult = message.text.contains("✅") || message.text.contains("❌") || message.text.contains("⛔") || message.text.contains("🚫")
            let status = hasResult ? "completed" : (message.isStreaming ? "running" : "done")
            let detail = message.text

            toolCallCard.configure(toolName: toolName, status: status, detail: detail, isStreaming: message.isStreaming)

        case .thinking:
            roleLabel.stringValue = "Thinking"
            roleLabel.textColor = NSColor.systemGreen
            messageTextView.isHidden = false
            messageTextView.textColor = .secondaryLabelColor
            messageTextView.string = message.text

        case .backgroundTask:
            roleLabel.stringValue = "Background Task"
            roleLabel.textColor = NSColor.systemOrange
            messageTextView.isHidden = false
            messageTextView.textColor = .secondaryLabelColor
            messageTextView.string = message.text
        }
    }

    private func showTextView(with message: Message) {
        messageTextView.isHidden = false
        toolCallCard.isHidden = true

        if message.isStreaming {
            messageTextView.textColor = .secondaryLabelColor
            messageTextView.string = message.text
        } else {
            messageTextView.textColor = .controlTextColor
            let attributed = MarkdownRenderer.render(message.text)
            messageTextView.textStorage?.setAttributedString(attributed)
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        messageTextView.string = ""
        roleLabel.stringValue = ""
        messageTextView.isHidden = false
        toolCallCard.isHidden = true
    }
}
