import Foundation

/// A single message in the chat history.
struct Message {
    let id: UUID
    let role: MessageRole
    var text: String
    let timestamp: Date
    var isStreaming: Bool

    init(role: MessageRole, text: String = "", timestamp: Date = Date(), isStreaming: Bool = false) {
        self.id = UUID()
        self.role = role
        self.text = text
        self.timestamp = timestamp
        self.isStreaming = isStreaming
    }
}

enum MessageRole {
    case user
    case assistant
    case system
}

/// Manages a list of messages and handles agent events (turn.started, assistant.delta, turn.ended).
///
/// This is the testable data layer for ChatViewController.
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
        // Find the last streaming assistant message
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
}
