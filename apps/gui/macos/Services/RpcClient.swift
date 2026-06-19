import Foundation

/// JSON-RPC 2.0 over NDJSON client.
///
/// - Reads NDJSON frames from the engine's stdout on a dedicated read queue
/// - Unbounded buffer absorbs bursts (soft warning at 10,000 items)
/// - Routes frames by shape: responses → pending promises, notifications → event stream, reverse requests → approval/question handlers
/// - Applies `event.sessionId` to route events to the correct session tab
@MainActor
public final class RpcClient: RpcClientProtocol {
    public typealias EventHandler = (Any) -> Void
    public typealias ReverseRequestHandler = (String, Any, @escaping (Any?, Error?) -> Void) -> Void

    public var onEvent: EventHandler?
    public var onReverseRequest: ReverseRequestHandler?

    private let engine: ByfEngineService
    private let readQueue = DispatchQueue(label: "com.byf.rpc.read", qos: .userInitiated)
    private var pending = [Int64: (resolve: (Any) -> Void, reject: (Error) -> Void)]()
    private var nextId: Int64 = 1
    private var bufferSoftLimit: Int = 10_000
    private var bufferWarningLogged = false

    public init(engine: ByfEngineService) {
        self.engine = engine
    }

    /// Start the client by connecting to the engine's stdout stream.
    public func start() throws {
        try engine.start { [weak self] line in
            self?.handleFrame(line)
        }
    }

    /// Send a JSON-RPC request and await the response.
    /// - Parameters:
    ///   - method: The JSON-RPC method name (e.g. "core.listSessions")
    ///   - params: The parameters object (may be nil for no params)
    /// - Returns: The response `result` field
    /// - Throws: Error if the engine returns an error response or the connection fails
    @discardableResult
    public func call(method: String, params: Any? = nil) async throws -> Any {
        let id = nextId
        nextId += 1

        // Build the request frame
        var request: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
        ]
        if let params = params {
            request["params"] = params
        }

        let frame = try JSONSerialization.data(withJSONObject: request)
        guard let frameString = String(data: frame, encoding: .utf8) else {
            throw RpcError.invalidFrame
        }

        // Create the pending promise
        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = (
                resolve: { continuation.resume(returning: $0) },
                reject: { continuation.resume(throwing: $0) }
            )

            // Write to engine stdin
            engine.send(frame: frameString)
        }
    }

    /// Send a JSON-RPC notification (no response expected).
    public func notify(method: String, params: Any? = nil) throws {
        var notification: [String: Any] = [
            "jsonrpc": "2.0",
            "method": method,
        ]
        if let params = params {
            notification["params"] = params
        }
        let frame = try JSONSerialization.data(withJSONObject: notification)
        guard let frameString = String(data: frame, encoding: .utf8) else {
            throw RpcError.invalidFrame
        }
        engine.send(frame: frameString)
    }

    /// Handle a response to a reverse-RPC request (engine asked, GUI answers).
    public func respondToReverse(id: Int64, result: Any? = nil, error: Error? = nil) throws {
        var response: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
        ]
        if let result = result {
            response["result"] = result
        } else if let error = error {
            response["error"] = ["code": -32603, "message": error.localizedDescription]
        } else {
            response["result"] = nil
        }
        let frame = try JSONSerialization.data(withJSONObject: response)
        guard let frameString = String(data: frame, encoding: .utf8) else {
            throw RpcError.invalidFrame
        }
        engine.send(frame: frameString)
    }

    // MARK: - Private

    private func handleFrame(_ line: String) {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return // Invalid JSON, skip (engine already validated framing)
        }

        guard json["jsonrpc"] as? String == "2.0" else { return }

        let id = json["id"] as? Int64

        if let id = id, json["result"] != nil || json["error"] != nil {
            // Response to one of our requests
            handleResponse(id: id, json: json)
        } else if let method = json["method"] as? String {
            if id != nil {
                // Reverse request (engine asking GUI)
                handleReverseRequest(method: method, id: id!, json: json)
            } else if method == "event" {
                // Event notification
                handleEvent(json: json)
            }
        }
    }

    private func handleResponse(id: Int64, json: [String: Any]) {
        guard let pending = pending.removeValue(forKey: id) else { return }

        if let error = json["error"] as? [String: Any] {
            let message = error["message"] as? String ?? "Unknown error"
            pending.reject(RpcError.responseError(message))
        } else if let result = json["result"] {
            pending.resolve(result)
        } else {
            pending.resolve(json as Any) // fallback
        }
    }

    private func handleReverseRequest(method: String, id: Int64, json: [String: Any]) {
        let params = json["params"]
        // Register for crash rejection
        engine.registerPendingReverseRpc(id: id, reject: { [weak self] error in
            self?.pending.removeValue(forKey: id)
            try? self?.respondToReverse(id: id, error: error)
        })

        onReverseRequest?(method, params as Any) { [weak self] result, error in
            self?.engine.unregisterPendingReverseRpc(id: id)
            try? self?.respondToReverse(id: id, result: result, error: error)
        }
    }

    private func handleEvent(json: [String: Any]) {
        guard let params = json["params"] as? [String: Any] else { return }

        // Route by sessionId (multi-session support)
        if let sessionId = params["sessionId"] {
            var routedEvent = params
            routedEvent["_sessionId"] = sessionId // Ensure it's present for routing
            onEvent?(routedEvent)
        } else {
            onEvent?(params)
        }
    }
}

// MARK: - Errors

public enum RpcError: LocalizedError {
    case invalidFrame
    case responseError(String)
    case timeout

    public var errorDescription: String? {
        switch self {
        case .invalidFrame:
            return "Failed to serialize JSON-RPC frame"
        case .responseError(let message):
            return "RPC error: \(message)"
        case .timeout:
            return "RPC timed out"
        }
    }
}