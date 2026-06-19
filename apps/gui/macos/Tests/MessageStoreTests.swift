import XCTest
@testable import ByfDesktop

/// Tests for the MessageStore — manages message array and turn lifecycle.
///
/// Validates event handling:
/// - turn.started creates a new assistant message slot
/// - assistant.delta appends to current assistant message
/// - turn.ended finalizes the assistant message
/// - User messages are recorded with role: user
final class MessageStoreTests: XCTestCase {

    private var store: MessageStore!

    override func setUp() async throws {
        try await super.setUp()
        store = MessageStore()
    }

    override func tearDown() async throws {
        store = nil
        try await super.tearDown()
    }

    // MARK: - Initial State

    func test_initial_state_has_no_messages() throws {
        XCTAssertEqual(store.messages.count, 0,
                       "Store should start with no messages")
    }

    // MARK: - User Messages

    func test_addUserMessage_appends_text_message() throws {
        store.addUserMessage(text: "Hello, what is TypeScript?")
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].role, .user)
        XCTAssertEqual(store.messages[0].text, "Hello, what is TypeScript?")
    }

    func test_addUserMessage_has_timestamp() throws {
        store.addUserMessage(text: "Test")
        XCTAssertNotNil(store.messages[0].timestamp,
                        "Message should have a timestamp")
    }

    // MARK: - Turn Lifecycle

    func test_turn_started_creates_assistant_slot() throws {
        // When: turn starts with a prompt
        store.handleEvent(["type": "turn.started", "prompt": "What is Rust?"])

        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].role, .assistant)
        XCTAssertEqual(store.messages[0].text, "",
                       "Assistant message should start empty")
        XCTAssertTrue(store.messages[0].isStreaming,
                      "Assistant message should be streaming")
    }

    func test_assistant_delta_appends_to_current_message() throws {
        // Given: turn started
        store.handleEvent(["type": "turn.started"])

        // When: delta tokens arrive
        store.handleEvent(["type": "assistant.delta", "delta": "Rust is "])
        store.handleEvent(["type": "assistant.delta", "delta": "a systems "])
        store.handleEvent(["type": "assistant.delta", "delta": "language."])

        // Then: text is accumulated
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].text, "Rust is a systems language.")
        XCTAssertTrue(store.messages[0].isStreaming)
    }

    func test_turn_ended_finalizes_message() throws {
        // Given: turn started and some deltas received
        store.handleEvent(["type": "turn.started"])
        store.handleEvent(["type": "assistant.delta", "delta": "Final answer."])

        // When: turn ends
        store.handleEvent(["type": "turn.ended"])

        // Then: message is finalized
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].text, "Final answer.")
        XCTAssertFalse(store.messages[0].isStreaming,
                       "Message should no longer be streaming after turn.ended")
    }

    func test_delta_before_turn_started_is_ignored() throws {
        // When: delta without prior turn.started
        store.handleEvent(["type": "assistant.delta", "delta": "Orphan delta"])

        // Then: no message created
        XCTAssertEqual(store.messages.count, 0,
                       "Deltas without turn.started should be ignored")
    }

    // MARK: - Multiple Turns

    func test_multiple_turns_produce_multiple_messages() throws {
        store.addUserMessage(text: "Q1")
        store.handleEvent(["type": "turn.started"])
        store.handleEvent(["type": "assistant.delta", "delta": "A1"])
        store.handleEvent(["type": "turn.ended"])

        store.addUserMessage(text: "Q2")
        store.handleEvent(["type": "turn.started"])
        store.handleEvent(["type": "assistant.delta", "delta": "A2"])
        store.handleEvent(["type": "turn.ended"])

        XCTAssertEqual(store.messages.count, 4)
        XCTAssertEqual(store.messages[0].role, .user)
        XCTAssertEqual(store.messages[0].text, "Q1")
        XCTAssertEqual(store.messages[1].role, .assistant)
        XCTAssertEqual(store.messages[1].text, "A1")
        XCTAssertEqual(store.messages[2].role, .user)
        XCTAssertEqual(store.messages[2].text, "Q2")
        XCTAssertEqual(store.messages[3].role, .assistant)
        XCTAssertEqual(store.messages[3].text, "A2")
    }

    // MARK: - Reset

    func test_clear_resets_all_messages() throws {
        store.addUserMessage(text: "Test")
        store.handleEvent(["type": "turn.started"])
        store.clear()

        XCTAssertEqual(store.messages.count, 0,
                       "Clear should remove all messages")
    }
}
