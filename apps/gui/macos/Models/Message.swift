import Foundation

/// A single message in the chat history.
struct Message {
    let id: UUID
    let role: MessageRole
    var text: String
    let timestamp: Date
    var isStreaming: Bool
    var toolCallId: String?

    init(role: MessageRole, text: String = "", timestamp: Date = Date(), isStreaming: Bool = false, toolCallId: String? = nil) {
        self.id = UUID()
        self.role = role
        self.text = text
        self.timestamp = timestamp
        self.isStreaming = isStreaming
        self.toolCallId = toolCallId
    }
}

enum MessageRole {
    case user
    case assistant
    case system
    case toolCall
    case thinking
    case backgroundTask
}

/// Manages a list of messages and handles agent events (turn.started, assistant.delta, turn.ended, etc.).
@MainActor
final class MessageStore {
    private(set) var messages: [Message] = []

    /// Add a user-sent message to the history.
    func addUserMessage(text: String) {
        let msg = Message(role: .user, text: text)
        messages.append(msg)
    }

    /// Handle an agent event that affects the message list.
    func handleEvent(_ event: [String: Any]) {
        guard let type = event["type"] as? String else { return }

        switch type {
        case "turn.started":
            startNewAssistantMessage()

        case "assistant.delta":
            guard let delta = event["delta"] as? String, !delta.isEmpty else { return }
            appendToAssistantMessage(delta)

        case "turn.ended":
            finalizeAssistantMessage()

        case "thinking.delta":
            guard let delta = event["delta"] as? String else { return }
            appendToThinking(delta)

        case "tool.call.started":
            handleToolCallStarted(event)

        case "tool.call.delta":
            handleToolCallDelta(event)

        case "tool.result":
            handleToolResult(event)

        case "background.task.started":
            handleBackgroundTask(event, status: "running")

        case "background.task.updated":
            handleBackgroundTask(event, status: event["status"] as? String ?? "running")

        case "background.task.terminated":
            handleBackgroundTask(event, status: event["status"] as? String ?? "completed")

        default:
            break
        }
    }

    /// Remove all messages.
    func clear() {
        messages.removeAll()
    }

    // MARK: - Private

    private func startNewAssistantMessage() {
        let msg = Message(role: .assistant, isStreaming: true)
        messages.append(msg)
    }

    private func appendToAssistantMessage(_ delta: String) {
        guard let index = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) else {
            return
        }
        messages[index].text += delta
    }

    private func finalizeAssistantMessage() {
        guard let index = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) else {
            return
        }
        messages[index].isStreaming = false
    }

    private func appendToThinking(_ delta: String) {
        // Find or create a thinking block (created alongside the current assistant message)
        if let index = messages.lastIndex(where: { $0.role == .thinking }) {
            messages[index].text += delta
        } else {
            // Create new thinking block
            let msg = Message(role: .thinking, text: delta, isStreaming: true)
            messages.append(msg)
        }
    }

    private func handleToolCallStarted(_ event: [String: Any]) {
        let toolName = event["name"] as? String ?? "Unknown"
        let args = event["args"] as? String ?? ""
        let toolCallId = event["toolCallId"] as? String ?? UUID().uuidString
        // display field available for future rendering: event["display"] as? [String: Any]

        var text = "**\(toolName)**\n"
        if !args.isEmpty {
            text += "```\n\(args)\n```"
        }

        let msg = Message(role: .toolCall, text: text, isStreaming: true, toolCallId: toolCallId)
        messages.append(msg)
    }

    private func handleToolCallDelta(_ event: [String: Any]) {
        guard let toolCallId = event["toolCallId"] as? String,
              let delta = event["delta"] as? String else { return }
        guard let index = messages.lastIndex(where: { $0.role == .toolCall && $0.toolCallId == toolCallId }) else {
            return
        }
        messages[index].text += delta
    }

    private func handleToolResult(_ event: [String: Any]) {
        guard let toolCallId = event["toolCallId"] as? String else { return }
        guard let index = messages.lastIndex(where: { $0.role == .toolCall && $0.toolCallId == toolCallId }) else {
            return
        }

        messages[index].isStreaming = false

        // Append result summary
        let output = event["output"] as? String ?? ""
        let isError = event["isError"] as? Bool ?? false
        let blockedReason = event["blockedReason"] as? String

        var resultText = messages[index].text
        if blockedReason == "rejected" {
            resultText += "\n\n⛔ **Blocked: Rejected**"
        } else if blockedReason == "cancelled" {
            resultText += "\n\n🚫 **Cancelled**"
        } else if isError {
            resultText += "\n\n❌ **Error**: \(output)"
        } else if !output.isEmpty {
            // Show a short preview of result
            let preview = output.prefix(200)
            resultText += "\n\n✅ **Result**: \(preview)"
        }

        messages[index].text = resultText
    }

    private func handleBackgroundTask(_ event: [String: Any], status: String) {
        let taskId = event["taskId"] as? String ?? UUID().uuidString
        let taskName = event["taskName"] as? String ?? "Background Task"
        let statusEmoji: String
        switch status {
        case "running": statusEmoji = "🔄"
        case "awaiting_approval": statusEmoji = "⏳"
        case "completed": statusEmoji = "✅"
        case "failed": statusEmoji = "❌"
        case "killed": statusEmoji = "💀"
        case "lost": statusEmoji = "⚠️"
        default: statusEmoji = "❓"
        }

        // Find existing task card or create new one
        if let index = messages.lastIndex(where: { $0.role == .backgroundTask && $0.toolCallId == taskId }) {
            let text = "\(statusEmoji) **\(taskName)** — \(status)"
            messages[index].text = text
            messages[index].isStreaming = (status == "running")
        } else {
            let text = "\(statusEmoji) **\(taskName)** — \(status)"
            let msg = Message(role: .backgroundTask, text: text, toolCallId: taskId)
            messages.append(msg)
        }
    }
}
