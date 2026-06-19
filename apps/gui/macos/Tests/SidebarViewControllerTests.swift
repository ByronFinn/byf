import XCTest
@testable import ByfDesktop

/// Cycle 2: Sidebar displays current workspace session list.
///
/// Acceptance criterion: Sidebar 显示当前工作区的 session 列表
/// （`core.listSessions({ workDir })`），含标题/lastPrompt/updatedAt
///
/// Verifies:
/// - Calls core.listSessions with workDir on load
/// - Populates NSTableView with returned sessions
/// - Shows title, lastPrompt, updatedAt in table cells
final class SidebarViewControllerTests: XCTestCase {

    private var mockClient: MockRpcClient!
    private var sidebar: SidebarViewController!

    override func setUp() async throws {
        try await super.setUp()
        mockClient = MockRpcClient()
        sidebar = SidebarViewController(rpcClient: mockClient, workDir: "/Users/test/project")
    }

    override func tearDown() async throws {
        sidebar = nil
        mockClient = nil
        try await super.tearDown()
    }

    // MARK: - Initialization

    func test_initial_workDir_is_set() throws {
        XCTAssertEqual(sidebar.workDir, "/Users/test/project",
                       "Sidebar should store the initial workDir")
    }

    func test_calls_listSessions_on_viewDidLoad() throws {
        // When: load view then trigger viewDidLoad
        sidebar.loadView()
        sidebar.viewDidLoad()

        // Then
        XCTAssertEqual(mockClient.recordedCalls.count, 1,
                       "Should call exactly one RPC method on viewDidLoad")
        guard mockClient.recordedCalls.count >= 1 else { return }
        let call = mockClient.recordedCalls[0]
        XCTAssertEqual(call.method, "core.listSessions",
                       "Should call core.listSessions")
        guard let params = call.params as? [String: String] else {
            XCTFail("Params should be a dictionary")
            return
        }
        XCTAssertEqual(params["workDir"], "/Users/test/project",
                       "Should pass workDir parameter")
    }

    // MARK: - Session List Display

    func test_populates_table_with_sessions() async throws {
        // Given: mock returns sessions
        let sessions: [[String: Any]] = [
            [
                "id": "sess-1",
                "title": "Debug auth flow",
                "lastPrompt": "Fix login redirect",
                "updatedAt": "2026-06-18T10:00:00Z",
            ],
            [
                "id": "sess-2",
                "title": "Refactor API",
                "lastPrompt": "Extract validation",
                "updatedAt": "2026-06-18T09:00:00Z",
            ],
        ]
        mockClient.cannedResponses["core.listSessions"] = ["sessions": sessions]

        // When: load view and trigger session load
        sidebar.loadView()
        sidebar.viewDidLoad()
        // Allow async call to complete
        await sidebar.waitForSessions()

        // Then
        let tableView = sidebar.tableView
        XCTAssertEqual(tableView.numberOfRows, 2,
                       "Table should have 2 rows for 2 sessions")

        // Verify cell content for first session
        let row0 = sidebar.tableView(tableView, viewFor: nil, row: 0) as? NSTableCellView
        XCTAssertEqual(row0?.textField?.stringValue, "Debug auth flow",
                       "First row should show session title")
    }

    func test_shows_empty_state_when_no_sessions() async throws {
        // Given: mock returns empty list
        mockClient.cannedResponses["core.listSessions"] = ["sessions": []]

        // When
        sidebar.loadView()
        sidebar.viewDidLoad()
        await sidebar.waitForSessions()

        // Then
        XCTAssertEqual(sidebar.tableView.numberOfRows, 0,
                       "Table should have 0 rows when no sessions")
    }

    func test_shows_error_state_on_rpc_failure() async throws {
        // Given: mock throws error
        mockClient.cannedErrors["core.listSessions"] = RpcError.responseError("Engine not ready")

        // When
        sidebar.loadView()
        sidebar.viewDidLoad()
        await sidebar.waitForSessions()

        // Then: should show error placeholder (not crash)
        XCTAssertNotNil(sidebar.emptyPlaceholder,
                        "Should show an empty/error placeholder view")
    }

    // MARK: - Workspace Switching

    func test_reloads_on_new_workDir() async throws {
        // Given: initial load
        sidebar.loadView()
        sidebar.viewDidLoad()
        await sidebar.waitForSessions()
        let initialCalls = mockClient.recordedCalls.count

        // When: switch workspace
        sidebar.workDir = "/Users/test/other-project"

        // Then: should trigger new listSessions
        XCTAssertGreaterThan(mockClient.recordedCalls.count, initialCalls,
                             "Changing workDir should trigger another listSessions")
        guard mockClient.recordedCalls.count > initialCalls else { return }
        let newCall = mockClient.recordedCalls.last!
        guard let params = newCall.params as? [String: String] else {
            XCTFail("Params should be a dictionary")
            return
        }
        XCTAssertEqual(params["workDir"], "/Users/test/other-project",
                       "Should pass new workDir parameter")
    }
}
