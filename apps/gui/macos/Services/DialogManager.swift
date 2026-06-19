import Cocoa

/// Manages approval and question dialogs for reverse RPC.
///
/// All UI operations run on the main thread (AppKit requirement).
/// Callers must ensure they invoke methods from the main actor.
final class DialogManager {
    private var activeDialogs: [Int64: NSAlert] = [:]

    /// Show an approval dialog for a tool call.
    func showApproval(toolName: String, action: String, display: Any?, respond: @escaping (Any?, Error?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Approve: \(toolName)"
        alert.informativeText = action

        if let displayDict = display as? [String: Any],
           let args = displayDict["args"] as? String {
            alert.informativeText += "\n\n\(args)"
        }

        alert.addButton(withTitle: "Approve")
        alert.addButton(withTitle: "Reject")
        alert.addButton(withTitle: "Cancel")

        // Session scope checkbox
        let sessionScopeCheckbox = NSButton(checkboxWithTitle: "Approve for this session", target: nil, action: nil)
        sessionScopeCheckbox.state = .off
        alert.accessoryView = sessionScopeCheckbox

        let response = alert.runModal()

        var result: [String: Any] = ["decision": "cancelled"]
        switch response {
        case .alertFirstButtonReturn:
            result["decision"] = "approved"
        case .alertSecondButtonReturn:
            result["decision"] = "rejected"
            result["feedback"] = "User rejected via dialog"
        default:
            break
        }
        if sessionScopeCheckbox.state == .on {
            result["scope"] = "session"
        }

        respond(result, nil)
    }

    /// Show a multi-option question dialog.
    func showQuestion(question: String, options: [[String: Any]], multiSelect: Bool, respond: @escaping (Any?, Error?) -> Void) {
        let alert = NSAlert()
        alert.messageText = question

        if multiSelect {
            // Multi-select: checkboxes in accessory view
            alert.informativeText = "Select all that apply:"
            let checkboxStack = NSStackView()
            checkboxStack.orientation = .vertical
            checkboxStack.spacing = 6
            var checkboxes: [NSButton] = []

            for (i, option) in options.enumerated() {
                let label = option["label"] as? String ?? "Option \(i + 1)"
                let cb = NSButton(checkboxWithTitle: label, target: nil, action: nil)
                cb.state = .off
                checkboxes.append(cb)
                checkboxStack.addArrangedSubview(cb)
            }

            alert.accessoryView = checkboxStack
            alert.addButton(withTitle: "Confirm")
            alert.addButton(withTitle: "Cancel")

            let response = alert.runModal()
            if response == .alertFirstButtonReturn {
                let selected = checkboxes
                    .filter { $0.state == .on }
                    .map { $0.title }
                respond(["answers": selected], nil)
            } else {
                respond(nil, nil)
            }
        } else {
            // Single-select: each option as a button, last is Cancel
            for option in options {
                let label = option["label"] as? String ?? "Option"
                alert.addButton(withTitle: label)
            }
            alert.addButton(withTitle: "Cancel")

            let response = alert.runModal()
            let clickedIndex = response.rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue

            guard clickedIndex >= 0, clickedIndex < options.count else {
                respond(nil, nil) // Cancelled
                return
            }
            let selected = options[clickedIndex]
            let label = selected["label"] as? String ?? ""
            respond(["answers": [label]], nil)
        }
    }

    /// Dismiss all active dialogs (e.g., on engine crash).
    func dismissAll(reason: String) {
        for (_, alert) in activeDialogs {
            alert.alertStyle = .critical
            alert.messageText = "Engine Disconnected"
            alert.informativeText = reason
            alert.window.orderOut(nil)
        }
        activeDialogs.removeAll()
    }
}
