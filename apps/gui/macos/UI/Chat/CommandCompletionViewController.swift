import Cocoa

/// Popover content for slash command completion.
final class CommandCompletionViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    private let tableView = NSTableView()
    private var commands: [CommandDefinition] = []
    private var onSelect: ((CommandDefinition) -> Void)?

    var selectedCommand: CommandDefinition? {
        let row = tableView.selectedRow
        guard row >= 0, row < commands.count else { return nil }
        return commands[row]
    }

    override func loadView() {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = false
        scrollView.borderType = .noBorder

        let column = NSTableColumn(identifier: .commandCompletionColumn)
        column.title = "Command"
        column.minWidth = 250
        column.maxWidth = 500
        tableView.addTableColumn(column)
        tableView.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        tableView.headerView = nil
        tableView.dataSource = self
        tableView.delegate = self
        tableView.selectionHighlightStyle = .regular
        tableView.backgroundColor = .windowBackgroundColor

        scrollView.documentView = tableView

        view = scrollView
        preferredContentSize = NSSize(width: 380, height: 240)
    }

    func updateCommands(_ newCommands: [CommandDefinition], onSelect: @escaping (CommandDefinition) -> Void) {
        self.commands = newCommands
        self.onSelect = onSelect
        tableView.reloadData()

        if !commands.isEmpty {
            tableView.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
        }
    }

    func selectPrevious() {
        let current = tableView.selectedRow
        tableView.selectRowIndexes(IndexSet(integer: max(0, current - 1)), byExtendingSelection: false)
        tableView.scrollRowToVisible(tableView.selectedRow)
    }

    func selectNext() {
        let current = tableView.selectedRow
        let next = min(commands.count - 1, current + 1)
        if next > current {
            tableView.selectRowIndexes(IndexSet(integer: next), byExtendingSelection: false)
            tableView.scrollRowToVisible(next)
        }
    }

    // MARK: - NSTableViewDataSource

    func numberOfRows(in tableView: NSTableView) -> Int {
        commands.count
    }

    // MARK: - NSTableViewDelegate

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < commands.count else { return nil }

        let cell = NSTableCellView()

        let command = commands[row]
        let text = "/\(command.name)"
        let textField = NSTextField(labelWithString: text)
        textField.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        cell.textField = textField
        cell.addSubview(textField)
        textField.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            textField.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8),
            textField.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -8),
            textField.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        cell.identifier = .commandCompletionCell
        cell.toolTip = command.description

        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        guard let selected = selectedCommand else { return }
        onSelect?(selected)
    }
}

private extension NSUserInterfaceItemIdentifier {
    static let commandCompletionColumn = NSUserInterfaceItemIdentifier("commandCompletionColumn")
    static let commandCompletionCell = NSUserInterfaceItemIdentifier("commandCompletionCell")
}
