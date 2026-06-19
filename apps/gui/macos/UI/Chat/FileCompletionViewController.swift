import Cocoa

/// A file suggestion from the engine.
struct FileCompletionItem {
    let path: String
    let name: String
}

/// Popover content for @file completion list.
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

        if !items.isEmpty {
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
