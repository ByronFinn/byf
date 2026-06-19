import Cocoa

/// A table cell view that displays a single chat message using NSTextView (TextKit2).
///
/// Each message gets its own NSTextView — avoids re-layout of long history.
final class ChatMessageCell: NSTableCellView {
    static let identifier = NSUserInterfaceItemIdentifier("ChatMessageCell")

    /// The text view for rendering message content.
    /// Uses TextKit2 (default in macOS 14+).
    let messageTextView: NSTextView = {
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

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupView() {
        // Role label at top
        addSubview(roleLabel)
        NSLayoutConstraint.activate([
            roleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            roleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            roleLabel.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -12),
        ])

        // Message text view below role label
        messageTextView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(messageTextView)
        NSLayoutConstraint.activate([
            messageTextView.topAnchor.constraint(equalTo: roleLabel.bottomAnchor, constant: 2),
            messageTextView.leadingAnchor.constraint(equalTo: leadingAnchor),
            messageTextView.trailingAnchor.constraint(equalTo: trailingAnchor),
            messageTextView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    /// Configure the cell with a message.
    func configure(with message: Message) {
        switch message.role {
        case .user:
            roleLabel.stringValue = "You"
            messageTextView.textColor = .controlTextColor
        case .assistant:
            roleLabel.stringValue = "Assistant"
            messageTextView.textColor = .controlTextColor
        case .system:
            roleLabel.stringValue = "System"
            messageTextView.textColor = .tertiaryLabelColor
        }

        // Render markdown for finalized messages; plain text for streaming
        if message.isStreaming {
            messageTextView.textColor = .secondaryLabelColor
            messageTextView.string = message.text
        } else {
            let attributed = MarkdownRenderer.render(message.text)
            messageTextView.textStorage?.setAttributedString(attributed)
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        messageTextView.string = ""
        roleLabel.stringValue = ""
    }
}
