import Foundation
@testable import ByfDesktop

/// A mock RPC client used for testing UI controllers.
///
/// Captures method calls and allows injecting canned responses.
@MainActor
final class MockRpcClient: RpcClientProtocol {
    var onEvent: EventHandler?
    var onReverseRequest: ReverseRequestHandler?

    /// Recorded method calls for verification.
    private(set) var recordedCalls: [(method: String, params: Any?)] = []

    /// Canned responses keyed by method name.
    var cannedResponses: [String: Any] = [:]

    /// Errors to throw, keyed by method name.
    var cannedErrors: [String: Error] = [:]

    func call(method: String, params: Any?) async throws -> Any {
        recordedCalls.append((method, params))

        if let error = cannedErrors[method] {
            throw error
        }
        return cannedResponses[method] as Any
    }

    func notify(method: String, params: Any?) throws {
        recordedCalls.append((method, params))
    }

    func respondToReverse(id: Int64, result: Any?, error: Error?) throws {
        // Not needed for #162 tests
    }
}
