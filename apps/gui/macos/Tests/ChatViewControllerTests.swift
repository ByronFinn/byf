import XCTest
@testable import ByfDesktop

/// Cycle 3-5: ChatViewController UI integration tests.
///
/// Acceptance criteria:
/// - NSTableView virtualized message list
/// - Per-message NSTextView (TextKit2)
/// - Streaming delta 16ms coalesce
/// - Markdown rendering
/// - Event handling + session.prompt
///
/// ⚠️ These tests require a running app environment (NSApplication shared).
/// They serve as specifications and can be run in Xcode.
final class ChatViewControllerTests: XCTestCase {

    private var mockClient: MockRpcClient!
    private var chatVC: ChatViewController!

    override func setUp() async throws {
        try await super.setUp()
        mockClient = MockRpcClient()
        chatVC = ChatViewController(rpcClient: mockClient)
        chatVC.loadView()
    }

    override func tearDown() async throws {
        chatVC = nil
        mockClient = nil
        try await super.tearDown()
    }

    // MARK: - Initial State

    func test_initial_state_has_no_messages() throws {
        XCTAssertEqual(chatVC.messageStore.messages.count, 0,
                       "Chat should start with no messages")
    }

    func test_initial_state_table_has_zero_rows() throws {
        // Access the tableView via internal reference or expose for testing
        // For now, verify via message store
        XCTAssertEqual(chatVC.messageStore.messages.count, 0)
    }

    // MARK: - Sending Messages

    func test_send_message_adds_user_message() throws {
        // Given
        let initialCount = chatVC.messageStore.messages.count

        // When
        chatVC.sendMessage("Hello world")

        // Then: user message added
        XCTAssertEqual(chatVC.messageStore.messages.count, initialCount + 1)
        guard let last = chatVC.messageStore.messages.last else { return }
        XCTAssertEqual(last.role, .user)
        XCTAssertEqual(last.text, "Hello world")
    }

    func test_send_message_calls_session_prompt() throws {
        // When
        chatVC.sendMessage("Test prompt")

        // Then: RPC call recorded
        let promptCalls = mockClient.recordedCalls.filter { $0.method == "session.prompt" }
        XCTAssertEqual(promptCalls.count, 1,
                       "sendMessage should call session.prompt")
        if let params = promptCalls.first?.params as? [String: String] {
            XCTAssertEqual(params["text"], "Test prompt")
        }
    }

    // MARK: - Event Handling

    func test_turn_started_creates_assistant_slot() throws {
        // When
        chatVC.handleEvent(["type": "turn.started"])

        // Then
        XCTAssertEqual(chatVC.messageStore.messages.count, 1)
        XCTAssertEqual(chatVC.messageStore.messages[0].role, .assistant)
    }

    func test_assistant_delta_appends_to_message() throws {
        // Given
        chatVC.handleEvent(["type": "turn.started"])

        // When: multiple deltas
        chatVC.handleEvent(["type": "assistant.delta", "delta": "Hello "])
        chatVC.handleEvent(["type": "assistant.delta", "delta": "World"])

        // Then: text accumulated
        // Note: deltas go through coalescer which flushes async
        // For test, flush manually
        let lastMsg = chatVC.messageStore.messages.last
        XCTAssertEqual(lastMsg?.text, "Hello World")
    }

    func test_turn_ended_finalizes_message() throws {
        // Given
        chatVC.handleEvent(["type": "turn.started"])
        chatVC.handleEvent(["type": "assistant.delta", "delta": "Final."])

        // When
        chatVC.handleEvent(["type": "turn.ended"])

        // Then
        guard let last = chatVC.messageStore.messages.last else { return }
        XCTAssertFalse(last.isStreaming, "Message should be finalized after turn.ended")
        XCTAssertEqual(last.text, "Final.")
    }

    func test_full_conversation_flow() throws {
        // Simulate: user message → turn → response → user message → turn → response
        chatVC.sendMessage("What is Swift?")
        chatVC.handleEvent(["type": "turn.started"])
        chatVC.handleEvent(["type": "assistant.delta", "delta": "Swift is "])
        chatVC.handleEvent(["type": "assistant.delta", "delta": "a programming language."])
        chatVC.handleEvent(["type": "turn.ended"])

        chatVC.sendMessage("What about Kotlin?")
        chatVC.handleEvent(["type": "turn.started"])
        chatVC.handleEvent(["type": "assistant.delta", "delta": "Kotlin is "])
        chatVC.handleEvent(["type": "assistant.delta", "delta": "also a language."])
        chatVC.handleEvent(["type": "turn.ended"])

        XCTAssertEqual(chatVC.messageStore.messages.count, 4)
        XCTAssertEqual(chatVC.messageStore.messages[0].text, "What is Swift?")
        XCTAssertEqual(chatVC.messageStore.messages[1].text, "Swift is a programming language.")
        XCTAssertEqual(chatVC.messageStore.messages[2].text, "What about Kotlin?")
        XCTAssertEqual(chatVC.messageStore.messages[3].text, "Kotlin is also a language.")
    }

    // MARK: - Clear

    func test_clear_resets_conversation() throws {
        chatVC.sendMessage("Test")
        chatVC.handleEvent(["type": "turn.started"])
        chatVC.handleEvent(["type": "turn.ended"])

        chatVC.clearConversation()

        XCTAssertEqual(chatVC.messageStore.messages.count, 0,
                       "Clear should remove all messages")
    }

    // MARK: - MarkdownRenderer

    func test_markdown_renderer_bold_text() throws {
        let rendered = MarkdownRenderer.render("This is **bold**")
        let plainText = rendered.string
        XCTAssertTrue(plainText.contains("bold"),
                      "Rendered string should contain the text")
        // AttributedString should have bold attribute on "bold"
        var foundBold = false
        rendered.enumerateAttribute(.font, in: NSRange(location: 0, length: rendered.length)) { value, range, _ in
            if let font = value as? NSFont, font.symbolicTraits.contains(.bold) {
                foundBold = true
            }
        }
        XCTAssertTrue(foundBold, "**bold** should render with bold font trait")
    }

    func test_markdown_renderer_code_block() throws {
        let md = "```\nlet x = 42\n```"
        let rendered = MarkdownRenderer.render(md)
        XCTAssertTrue(rendered.string.contains("x = 42"),
                      "Code block content should be present")
    }

    func test_markdown_renderer_heading() throws {
        let md = "# Heading"
        let rendered = MarkdownRenderer.render(md)
        XCTAssertTrue(rendered.string.contains("Heading"),
                      "Heading text should be present")
    }

    func test_markdown_renderer_empty_string() throws {
        let rendered = MarkdownRenderer.render("")
        XCTAssertEqual(rendered.length, 0,
                       "Empty string should produce empty attributed string")
    }

    func test_markdown_renderer_fallback_on_error() throws {
        // Null bytes may cause parse failure — fallback should produce plain text
        let rendered = MarkdownRenderer.render("Hello \0 World")
        // Should not crash, should contain the text
        XCTAssertTrue(rendered.string.contains("Hello"),
                      "Fallback should still contain readable text")
    }

    // MARK: - DeltaCoalescer

    func test_coalescer_batches_tokens() throws {
        let coalescer = DeltaCoalescer(interval: 0.1)
        var flushed = false

        coalescer.onFlush = { batch in
            XCTAssertEqual(batch.joined(), "abc")
            flushed = true
        }

        coalescer.append("a")
        coalescer.append("b")
        coalescer.append("c")
        coalescer.flush()

        XCTAssertTrue(flushed)
    }

    func test_coalescer_does_not_flush_empty() throws {
        let coalescer = DeltaCoalescer(interval: 0.1)
        var flushCount = 0

        coalescer.onFlush = { _ in flushCount += 1 }
        coalescer.flush()

        XCTAssertEqual(flushCount, 0)
    }
}
