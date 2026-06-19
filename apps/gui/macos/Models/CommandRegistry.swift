import Foundation

/// A command that can be triggered via `/command` in the input bar.
struct CommandDefinition {
    let name: String
    let description: String
    let action: String // RPC method or built-in action
}

/// Registry of slash commands available in the GUI.
///
/// Combines static built-in commands with dynamic skills loaded from the engine.
@MainActor
final class CommandRegistry {
    private let rpcClient: any RpcClientProtocol

    /// Static commands available even before skills are loaded.
    private static let staticCommands: [CommandDefinition] = [
        CommandDefinition(name: "help", description: "Show available commands", action: "builtin.help"),
        CommandDefinition(name: "clear", description: "Clear conversation", action: "builtin.clear"),
        CommandDefinition(name: "compact", description: "Compact the current session", action: "session.compact"),
    ]

    /// Skills loaded from the engine via `agent.listSkills`.
    private var skillCommands: [CommandDefinition] = []

    init(rpcClient: any RpcClientProtocol) {
        self.rpcClient = rpcClient
    }

    /// All available commands (static + dynamic skills).
    var allCommands: [CommandDefinition] {
        skillCommands + Self.staticCommands
    }

    /// Load skills from the engine and generate `/skill:<name>` commands.
    func loadSkills() async {
        do {
            let result = try await rpcClient.call(method: "agent.listSkills", params: nil)
            if let dict = result as? [String: Any],
               let skills = dict["skills"] as? [[String: Any]] {
                skillCommands = skills.compactMap { skill -> CommandDefinition? in
                    guard let name = skill["name"] as? String else { return nil }
                    let type = skill["type"] as? String
                    // Only include user-activatable skills
                    guard isUserActivatableSkillType(type) else { return nil }
                    let description = skill["description"] as? String ?? "Run /skill:\(name)"
                    return CommandDefinition(
                        name: "skill:\(name)",
                        description: description,
                        action: "agent.activateSkill"
                    )
                }
            }
        } catch {
            // Silently fail — skills are non-critical
            skillCommands = []
        }
    }

    /// Filter commands matching a query.
    func search(query: String) -> [CommandDefinition] {
        allCommands.filter { cmd in
            cmd.name.lowercased().contains(query.lowercased())
        }
    }

    /// Whether a skill type is user-activatable.
    private func isUserActivatableSkillType(_ type: String?) -> Bool {
        switch type {
        case .none, "prompt", "inline", "flow":
            return true
        default:
            return false
        }
    }
}
