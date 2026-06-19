import Cocoa

/// Manages approval and question dialogs for reverse RPC.
///
/// On engine crash, all pending dialogs are dismissed automatically.
final class DialogManager {
    private var activeDialogs: [Int64: NSAlert] = [:]
    private var pendingReverseRpcs: [Int64: (Any?, Error?) -> Void] = [:]

    /// Show an approval dialog for a tool call.
    /// - Parameters:
    ///   - toolName: Name of the tool
    ///   - action: Description of the action
    ///   - display: Optional display data
    ///   - respond: Callback with response (result, error)
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

        // Optional: session scope checkbox
        let sessionScopeCheckbox = NSButton(checkboxWithTitle: "Approve for this session", target: nil, action: nil)
        sessionScopeCheckbox.state = .off
        alert.accessoryView = sessionScopeCheckbox

        let response = alert.runModal()
        let decision: String
        let feedback: String?

        switch response {
        case .alertFirstButtonReturn:
            decision = "approved"
            feedback = nil
        case .alertSecondButtonReturn:
            decision = "rejected"
            feedback = "User rejected via dialog"
        default:
            decision = "cancelled"
            feedback = nil
        }

        var result: [String: Any] = ["decision": decision]
        if let feedback = feedback {
            result["feedback"] = feedback
        }
        if sessionScopeCheckbox.state == .on {
            result["scope"] = "session"
        }

        respond(result, nil)
    }

    /// Show a multi-option question dialog.
    /// - Parameters:
    ///   - question: The question text
    ///   - options: Available options
    ///   - multiSelect: Whether multiple options can be selected
    ///   - respond: Callback with response (result, error)
    func showQuestion(question: String, options: [[String: Any]], multiSelect: Bool, respond: @escaping (Any?, Error?) -> Void) {
        let alert = NSAlert()
        alert.messageText = question

        // Use radio buttons for single-select, checkboxes for multi-select
        if multiSelect {
            // Multi-select: show checkboxes
            alert.informativeText = "Select all that apply:"
            for (i, option) in options.enumerated() {
                let label = option["label"] as? String ?? "Option \(i + 1)"
                alert.informativeText += "\n☐ \(label)"
            }
            alert.addButton(withTitle: "Confirm")
            alert.addButton(withTitle: "Cancel")
        } else {
            // Single-select: each option as a button
            for option in options {
                let label = option["label"] as? String ?? "Option"
                alert.addButton(withTitle: label)
            }
            alert.addButton(withTitle: "Cancel")
        }

        let response = alert.runModal()

        if multiSelect {
            // For multi-select, we just return confirmed with empty selection
            // (full implementation would use accessoryView with checkboxes)
            respond(["answers": []], nil)
        } else {
        let clickedIndex = response.rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue
        guard clickedIndex >= 0, clickedIndex < options.count else {
            // Cancelled
            respond(nil, nil)
            return
        }
        let selected = options[clickedIndex]
        let label = selected["label"] as? String ?? ""
        respond(["answers": [label]], nil)
        }
    }

    /// Dismiss all active dialogs (e.g., on engine crash).
    func dismissAll(reason: String) {
        for (_, respond) in pendingReverseRpcs {
            respond(nil, EngineError.peerTerminated)
        }
        pendingReverseRpcs.removeAll()

        for (_, alert) in activeDialogs {
            alert.alertStyle = .critical
            alert.messageText = "Engine Disconnected"
            alert.informativeText = reason
            alert.window.orderOut(nil)
        }
        activeDialogs.removeAll()
    }
}
