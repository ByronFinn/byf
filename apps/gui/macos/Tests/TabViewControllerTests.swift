import XCTest
@testable import ByfDesktop

/// Cycle 3: NSTabView multi-session tabs.
///
/// Acceptance criterion: NSTabView 支持多 session 标签页，可新建/切换
///
/// Verifies:
/// - Can create new session tabs
/// - Can switch between open tabs
/// - Events routed by sessionId reach the correct tab
/// - TabView properly manages tab items
final class TabViewControllerTests: XCTestCase {

    private var mockClient: MockRpcClient!
    private var tabVC: TabViewController!

    override func setUp() async throws {
        try await super.setUp()
        mockClient = MockRpcClient()
        tabVC = TabViewController(rpcClient: mockClient)
        tabVC.loadView() // Ensure view is loaded
    }

    override func tearDown() async throws {
        tabVC = nil
        mockClient = nil
        try await super.tearDown()
    }

    // MARK: - Tab Management

    func test_initial_state_has_no_tabs() throws {
        XCTAssertEqual(tabVC.tabView.numberOfTabViewItems, 0,
                       "Tab view should start with no tabs")
    }

    func test_create_tab_adds_tabViewItem() async throws {
        // Given: mock createSession returns a session ID
        mockClient.cannedResponses["core.createSession"] = [
            "sessionId": "sess-new-1",
            "title": "New Session",
        ]

        // When
        try await tabVC.createSessionTab()

        // Then
        XCTAssertEqual(tabVC.tabView.numberOfTabViewItems, 1,
                       "Should have 1 tab after creating a session")
        XCTAssertEqual(tabVC.tabView.tabViewItems.first?.identifier as? String, "sess-new-1",
                       "Tab identifier should be the session ID")
    }

    func test_create_two_tabs_adds_two_items() async throws {
        // Given: mock returns different session IDs
        mockClient.cannedResponses["core.createSession"] = [
            "sessionId": "sess-1",
            "title": "Session 1",
        ]

        // When
        try await tabVC.createSessionTab()

        // Change response for second call
        mockClient.cannedResponses["core.createSession"] = [
            "sessionId": "sess-2",
            "title": "Session 2",
        ]
        try await tabVC.createSessionTab()

        // Then
        XCTAssertEqual(tabVC.tabView.numberOfTabViewItems, 2,
                       "Should have 2 tabs after creating 2 sessions")
        XCTAssertEqual(tabVC.tabView.tabViewItems[0].identifier as? String, "sess-1")
        XCTAssertEqual(tabVC.tabView.tabViewItems[1].identifier as? String, "sess-2")
    }

    func test_switch_to_existing_tab() throws {
        // Given: tabs already exist (added directly)
        tabVC.addTab(sessionId: "sess-1", title: "Session 1")
        tabVC.addTab(sessionId: "sess-2", title: "Session 2")

        // When: switch to tab 2
        tabVC.switchToTab(sessionId: "sess-2")

        // Then
        XCTAssertEqual(tabVC.tabView.selectedTabViewItem?.identifier as? String, "sess-2",
                       "Should select the requested session tab")
    }

    // MARK: - Tab Close

    func test_close_tab_removes_tabViewItem() throws {
        // Given
        tabVC.addTab(sessionId: "sess-1", title: "Session 1")

        // When
        tabVC.closeTab(sessionId: "sess-1")

        // Then
        XCTAssertEqual(tabVC.tabView.numberOfTabViewItems, 0,
                       "Tab should be removed after close")
    }

    func test_close_tab_calls_closeSession() throws {
        // Given
        tabVC.addTab(sessionId: "sess-close-test")

        // When
        tabVC.closeTab(sessionId: "sess-close-test")

        // Then: should have called core.closeSession
        // Note: closeSession is called asynchronously via Task, so we wait briefly
        let expectation = XCTestExpectation(description: "closeSession called")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)

        guard let lastCall = mockClient.recordedCalls.last else {
            XCTFail("Expected a call to core.closeSession")
            return
        }
        XCTAssertEqual(lastCall.method, "core.closeSession",
                       "Closing a tab should call core.closeSession")
        if let params = lastCall.params as? [String: String] {
            XCTAssertEqual(params["sessionId"], "sess-close-test",
                           "Should pass the correct sessionId")
        }
    }

    // MARK: - Event Routing

    func test_routes_event_to_correct_tab() throws {
        // Given: two tabs exist
        tabVC.addTab(sessionId: "sess-event-1")
        tabVC.addTab(sessionId: "sess-event-2")

        let mockTab1 = MockTabContent()
        let mockTab2 = MockTabContent()
        tabVC.tabView.tabViewItems[0].viewController = mockTab1
        tabVC.tabView.tabViewItems[1].viewController = mockTab2

        // When: route event to session 2
        tabVC.routeEvent(sessionId: "sess-event-2", event: ["type": "message", "content": "hello"])

        // Then: only tab 2 should have received the event
        XCTAssertFalse(mockTab1.didReceiveEvent,
                       "Tab 1 should not receive events for session 2")
        XCTAssertTrue(mockTab2.didReceiveEvent,
                       "Tab 2 should receive events for session 2")
    }

    func test_routes_event_creates_tab_if_not_found() throws {
        // When: event for unknown session
        tabVC.routeEvent(sessionId: "sess-unknown", event: ["type": "message", "content": "hello"])

        // Then: should create a new tab for this session
        let found = tabVC.tabView.tabViewItems.contains(where: {
            $0.identifier as? String == "sess-unknown"
        })
        XCTAssertTrue(found,
                       "Should auto-create a tab for unknown session IDs")
    }
}

/// Simple mock to track if a view received an event.
private final class MockTabContent: NSViewController, EventHandlerProtocol {
    var didReceiveEvent = false

    func handleEvent(_ event: Any) {
        didReceiveEvent = true
    }
}
