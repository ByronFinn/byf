import Foundation

/// Protocol for JSON-RPC communication with the engine.
///
/// Extracted for testability — allows injecting mock clients in tests.
@MainActor
public protocol RpcClientProtocol: AnyObject {
    typealias EventHandler = (Any) -> Void
    typealias ReverseRequestHandler = (String, Any, @escaping (Any?, Error?) -> Void) -> Void

    var onEvent: EventHandler? { get set }
    var onReverseRequest: ReverseRequestHandler? { get set }

    /// Send a JSON-RPC request and await the response.
    @discardableResult
    func call(method: String, params: Any?) async throws -> Any

    /// Send a JSON-RPC notification (no response expected).
    func notify(method: String, params: Any?) throws

    /// Handle a response to a reverse-RPC request.
    func respondToReverse(id: Int64, result: Any?, error: Error?) throws
}
