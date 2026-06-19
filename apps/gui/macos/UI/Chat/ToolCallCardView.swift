import Cocoa

/// A collapsible card view for displaying tool calls.
///
/// Default: collapsed (shows tool name + status summary).
/// Click to expand: shows full args and result.
final class ToolCallCardView: NSView {
    private let titleLabel: NSTextField = {
        let label = NSTextField(labelWithString: "")
        label.font = NSFont.boldSystemFont(ofSize: 12)
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let statusLabel: NSTextField = {
        let label = NSTextField(labelWithString: "")
        label.font = NSFont.systemFont(ofSize: 11)
        label.textColor = .secondaryLabelColor
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let detailTextView: NSTextView = {
        let tv = NSTextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.drawsBackground = false
        tv.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        tv.textContainerInset = NSSize(width: 8, height: 4)
        tv.translatesAutoresizingMaskIntoConstraints = false
        tv.isHidden = true // Collapsed by default
        return tv
    }()

    private let borderView: NSView = {
        let v = NSView()
        v.wantsLayer = true
        v.layer?.cornerRadius = 6
        v.layer?.borderWidth = 1
        v.layer?.borderColor = NSColor.separatorColor.cgColor
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }()

    private let disclosureButton = NSButton(title: "▶", target: nil, action: nil)
    private var isExpanded = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupView() {
        disclosureButton.bezelStyle = .inline
        disclosureButton.isBordered = false
        disclosureButton.font = NSFont.systemFont(ofSize: 10)
        disclosureButton.translatesAutoresizingMaskIntoConstraints = false
        disclosureButton.action = #selector(toggleExpand)
        disclosureButton.target = self

        addSubview(borderView)
        borderView.addSubview(disclosureButton)
        borderView.addSubview(titleLabel)
        borderView.addSubview(statusLabel)
        borderView.addSubview(detailTextView)

        NSLayoutConstraint.activate([
            borderView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            borderView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            borderView.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            borderView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),

            disclosureButton.leadingAnchor.constraint(equalTo: borderView.leadingAnchor, constant: 4),
            disclosureButton.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
            disclosureButton.widthAnchor.constraint(equalToConstant: 20),

            titleLabel.leadingAnchor.constraint(equalTo: disclosureButton.trailingAnchor, constant: 4),
            titleLabel.topAnchor.constraint(equalTo: borderView.topAnchor, constant: 6),
            titleLabel.trailingAnchor.constraint(equalTo: borderView.trailingAnchor, constant: -8),

            statusLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            statusLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 2),
            statusLabel.trailingAnchor.constraint(equalTo: borderView.trailingAnchor, constant: -8),

            detailTextView.leadingAnchor.constraint(equalTo: borderView.leadingAnchor, constant: 4),
            detailTextView.trailingAnchor.constraint(equalTo: borderView.trailingAnchor, constant: -4),
            detailTextView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 4),
            detailTextView.bottomAnchor.constraint(equalTo: borderView.bottomAnchor, constant: -4),
        ])
    }

    func configure(toolName: String, status: String, detail: String, isStreaming: Bool) {
        titleLabel.stringValue = "🛠 \(toolName)"
        statusLabel.stringValue = status

        if isStreaming {
            statusLabel.stringValue = status + " (running…)"
        }

        if !detail.isEmpty {
            detailTextView.string = detail
        }

        // Auto-expand if there's a significant result
        if status.contains("Error") || status.contains("Rejected") || status.contains("Cancelled") {
            setExpanded(true)
        }
    }

    @objc private func toggleExpand() {
        setExpanded(!isExpanded)
    }

    private func setExpanded(_ expanded: Bool) {
        isExpanded = expanded
        detailTextView.isHidden = !expanded
        disclosureButton.title = expanded ? "▼" : "▶"
    }
}
