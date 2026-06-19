import Foundation

/// Coalesces streaming tokens into batches at a fixed interval (default 16ms for 1 frame).
///
/// - Buffers tokens as they arrive
/// - Flushes accumulated tokens via `onFlush` callback on the coalescing interval
/// - Manual `flush()` for immediate delivery
/// - `cancel()` to stop the auto-flush timer
@MainActor
final class DeltaCoalescer {
    private let interval: TimeInterval
    private var buffer: [String] = []
    private var timer: Timer?
    private var isScheduled = false

    /// Called with the accumulated tokens when flushed.
    var onFlush: (([String]) -> Void)?

    /// Create a coalescer with the given interval in seconds.
    /// - Parameter interval: Flush interval (default 0.016 = 16ms = 1 frame at 60fps)
    init(interval: TimeInterval = 0.016) {
        self.interval = interval
    }

    /// Append a token to the buffer.
    /// Resets the auto-flush timer.
    func append(_ token: String) {
        buffer.append(token)
        scheduleTimer()
    }

    /// Manually flush buffered tokens (if any) to the callback.
    /// Does NOT reset the auto-flush timer.
    func flush() {
        guard !buffer.isEmpty else { return }
        let batch = buffer
        buffer = []
        onFlush?(batch)
    }

    /// Cancel the auto-flush timer.
    /// Pending tokens are NOT flushed.
    func cancel() {
        timer?.invalidate()
        timer = nil
        isScheduled = false
    }

    /// Number of buffered tokens.
    var count: Int { buffer.count }

    // MARK: - Private

    private func scheduleTimer() {
        // Cancel any existing timer to reset the interval
        if isScheduled {
            timer?.invalidate()
            timer = nil
        }

        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.flush()
                self?.isScheduled = false
            }
        }
        isScheduled = true
    }
}
