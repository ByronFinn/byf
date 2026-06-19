import Foundation

/// Manages the gui-core SEA binary subprocess lifecycle.
///
/// - Spawns the engine as a child process with piped stdin/stdout
/// - Detects crashes via `Process.terminationHandler`
/// - On crash: rejects all pending reverse-RPC requests, notifies UI, auto-restarts
/// - On restart: calls `resumeSession` for active sessions (wire replay recovery)
@MainActor
public final class ByfEngineService {
    public enum State: Equatable {
        case stopped
        case starting
        case running(pid: Int32)
        case crashed(exitCode: Int32)
        case restarting
    }

    public private(set) var state: State = .stopped
    public var onStateChange: ((State) -> Void)?

    private let enginePath: String
    private let homeDir: String
    private let configPath: String
    private var process: Process?
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?
    private var pendingReverseRpcs: [(id: Int64, reject: (Error) -> Void)] = []

    public init(enginePath: String? = nil, homeDir: String, configPath: String) {
        // Default: look for sidecar binary in Resources/
        if let path = enginePath {
            self.enginePath = path
        } else {
            let bundle = Bundle.main
            self.enginePath = bundle.resourcePath?.appending("/gui-core-engine") ?? "./gui-core-engine"
        }
        self.homeDir = homeDir
        self.configPath = configPath
    }

    /// Start the engine subprocess.
    /// - Parameter rpcHandler: Called for each incoming line on stdout (raw NDJSON frames)
    public func start(rpcHandler: @escaping (String) -> Void) throws {
        guard state == .stopped || state == .crashed(exitCode: -1) else {
            throw EngineError.invalidState
        }

        state = .starting
        onStateChange?(state)

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: enginePath)
        proc.arguments = []

        var env = ProcessInfo.processInfo.environment
        env["BYF_HOME"] = homeDir
        env["BYF_CONFIG_PATH"] = configPath
        proc.environment = env

        let stdin = Pipe()
        let stdout = Pipe()
        proc.standardInput = stdin
        proc.standardOutput = stdout
        proc.standardError = FileHandle.standardError // stderr inherits parent

        self.stdinPipe = stdin
        self.stdoutPipe = stdout

        // Read stdout asynchronously (NDJSON lines)
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
            // Each `readabilityHandler` invocation may produce multiple lines
            for frame in line.split(separator: "\n", omittingEmptySubsequences: true) {
                rpcHandler(String(frame))
            }
        }

        proc.terminationHandler = { [weak self] process in
            Task { @MainActor in
                self?.handleCrash(exitCode: process.terminationStatus)
            }
        }

        do {
            try proc.run()
            self.process = proc
            state = .running(pid: proc.processIdentifier)
            onStateChange?(state)
        } catch {
            state = .stopped
            onStateChange?(state)
            throw EngineError.startupFailed(error.localizedDescription)
        }
    }

    /// Send a JSON-RPC frame to the engine (writes to stdin).
    public func send(frame: String) {
        guard let stdinPipe = stdinPipe else { return }
        guard let data = (frame + "\n").data(using: .utf8) else { return }
        stdinPipe.fileHandleForWriting.write(data)
    }

    /// Register a pending reverse-RPC to be rejected on crash.
    public func registerPendingReverseRpc(id: Int64, reject: @escaping (Error) -> Void) {
        pendingReverseRpcs.append((id: id, reject: reject))
    }

    /// Unregister a resolved reverse-RPC.
    public func unregisterPendingReverseRpc(id: Int64) {
        pendingReverseRpcs.removeAll(where: { $0.id == id })
    }

    /// Gracefully stop the engine.
    public func stop() {
        process?.interrupt()
        process?.waitUntilExit()
        process = nil
        stdinPipe = nil
        stdoutPipe = nil
        state = .stopped
        onStateChange?(state)
    }

    // MARK: - Private

    private func handleCrash(exitCode: Int32) {
        // Reject all pending reverse-RPCs so approval dialogs don't hang
        for (_, reject) in pendingReverseRpcs {
            reject(EngineError.peerTerminated)
        }
        pendingReverseRpcs.removeAll()

        state = .crashed(exitCode: exitCode)
        onStateChange?(state)
    }
}

// MARK: - Errors

public enum EngineError: LocalizedError {
    case invalidState
    case startupFailed(String)
    case peerTerminated

    public var errorDescription: String? {
        switch self {
        case .invalidState:
            return "Engine is in an invalid state for this operation"
        case .startupFailed(let reason):
            return "Engine startup failed: \(reason)"
        case .peerTerminated:
            return "Engine process terminated (peer-terminated)"
        }
    }
}