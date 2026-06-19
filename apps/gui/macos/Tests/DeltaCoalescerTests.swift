import XCTest
@testable import ByfDesktop

/// Tests for the DeltaCoalescer — 16ms streaming coalescing.
///
/// Validates:
/// - Tokens are buffered and flushed on the coalescing interval
/// - Flush delivers accumulated tokens as a single batch
/// - No flush occurs without pending tokens
final class DeltaCoalescerTests: XCTestCase {

    // MARK: - Manual Flush

    func test_append_buffers_token() throws {
        let coalescer = DeltaCoalescer(interval: 0.1) // 100ms for test
        var flushedText = ""

        coalescer.onFlush = { batch in
            flushedText = batch.joined()
        }

        coalescer.append("Hello ")
        coalescer.append("World")

        // Manually flush
        coalescer.flush()

        XCTAssertEqual(flushedText, "Hello World",
                       "Flush should deliver accumulated tokens")
    }

    func test_flush_with_no_tokens_does_not_trigger_callback() throws {
        let coalescer = DeltaCoalescer(interval: 0.1)
        var flushCount = 0

        coalescer.onFlush = { _ in flushCount += 1 }

        coalescer.flush()

        XCTAssertEqual(flushCount, 0,
                       "Flush without pending tokens should not trigger callback")
    }

    func test_multiple_appends_before_flush() throws {
        let coalescer = DeltaCoalescer(interval: 0.1)
        var batches: [[String]] = []

        coalescer.onFlush = { batch in
            batches.append(batch)
        }

        coalescer.append("a")
        coalescer.append("b")
        coalescer.flush()
        coalescer.append("c")
        coalescer.flush()

        XCTAssertEqual(batches.count, 2)
        XCTAssertEqual(batches[0].joined(), "ab")
        XCTAssertEqual(batches[1].joined(), "c")
    }

    // MARK: - Auto-flush

    func test_auto_flush_after_interval() throws {
        let interval: TimeInterval = 0.05 // 50ms
        let coalescer = DeltaCoalescer(interval: interval)
        let flushExpectation = expectation(description: "auto flush")
        var flushedText = ""

        coalescer.onFlush = { batch in
            flushedText = batch.joined()
            flushExpectation.fulfill()
        }

        coalescer.append("Auto ")
        coalescer.append("flush")

        // Auto-flush timer should fire after interval
        wait(for: [flushExpectation], timeout: interval * 3)

        XCTAssertEqual(flushedText, "Auto flush",
                       "Auto-flush timer should deliver tokens")
    }

    func test_append_resets_timer() throws {
        let coalescer = DeltaCoalescer(interval: 0.1)
        let flushExpectation = expectation(description: "flush after final append")
        var flushCount = 0

        coalescer.onFlush = { _ in flushCount += 1 }

        coalescer.append("a")
        // Small delay
        let delay = expectation(description: "delay")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
            coalescer.append("b") // Reset timer
            delay.fulfill()
        }
        wait(for: [delay], timeout: 0.1)

        // Wait for auto-flush
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            flushExpectation.fulfill()
        }
        wait(for: [flushExpectation], timeout: 0.5)

        XCTAssertEqual(flushCount, 1,
                       "Only one flush should occur after final append")
    }

    // MARK: - Cancel

    func test_cancel_stops_auto_flush() throws {
        let coalescer = DeltaCoalescer(interval: 0.05)
        var flushCount = 0

        coalescer.onFlush = { _ in flushCount += 1 }

        coalescer.append("Cancelled ")
        coalescer.cancel()

        // Wait for interval to pass
        let wait = expectation(description: "wait")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            wait.fulfill()
        }
        wait(for: [wait], timeout: 0.5)

        XCTAssertEqual(flushCount, 0,
                       "Cancelled coalescer should not flush")
    }
}
