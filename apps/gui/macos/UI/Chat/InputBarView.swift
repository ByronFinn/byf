import Cocoa

/// Input bar with text field and send button.
final class InputBarView: NSView {
    private let textField: NSTextField = {
        let field = NSTextField()
        field.placeholderString = "Type a message…"
        field.bezelStyle = .roundedBezel
        field.font = NSFont.systemFont(ofSize: 13)
        field.translatesAutoresizingMaskIntoConstraints = false
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

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupView() {
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
        textField.action = #selector(didPressReturn)
        textField.target = self
    }

    @objc private func didPressSend() {
        let text = textField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        onSend?(text)
        textField.stringValue = ""
    }

    @objc private func didPressReturn() {
        // Same as send for single-line input
        didPressSend()
    }
}
