import XCTest
@testable import ByfDesktop

/// Cycle 1: NSSplitView layout — left sidebar + right TabView.
///
/// Acceptance criterion: NSSplitView 三栏布局，左 Sidebar + 右 TabView
///
/// Verifies the split view configuration:
/// - Vertical split (left-right)
/// - Thin divider
/// - Two split view items (sidebar + tabView)
/// - Sidebar has constrained width
final class MainWindowControllerTests: XCTestCase {

    private var mockClient: MockRpcClient!
    private var controller: MainWindowController!

    override func setUp() async throws {
        try await super.setUp()
        mockClient = MockRpcClient()
        controller = MainWindowController(rpcClient: mockClient)
    }

    override func tearDown() async throws {
        controller = nil
        mockClient = nil
        try await super.tearDown()
    }

    // MARK: - Split View Structure

    func test_splitView_is_vertical() throws {
        let splitView = controller.splitView
        XCTAssertTrue(splitView.isVertical,
                       "Split view must be vertical for left-right layout")
    }

    func test_splitView_has_thin_divider() throws {
        let splitView = controller.splitView
        XCTAssertEqual(splitView.dividerStyle, .thin,
                       "Split view should use thin divider")
    }

    func test_splitView_has_two_items() throws {
        let items = controller.splitView.splitViewItems
        XCTAssertEqual(items.count, 2,
                       "Split view must have exactly 2 items: sidebar + tabView")
    }

    func test_first_item_is_sidebar() throws {
        let items = controller.splitView.splitViewItems
        guard items.count >= 1 else {
            XCTFail("Split view has no items")
            return
        }
        let sidebarItem = items[0]
        XCTAssertTrue(sidebarItem.viewController is SidebarViewController,
                      "First split view item must be the SidebarViewController")
    }

    func test_second_item_is_tabView() throws {
        let items = controller.splitView.splitViewItems
        guard items.count >= 2 else {
            XCTFail("Split view has fewer than 2 items")
            return
        }
        let tabItem = items[1]
        XCTAssertTrue(tabItem.viewController is TabViewController,
                      "Second split view item must be the TabViewController")
    }

    func test_sidebar_minimum_thickness() throws {
        let items = controller.splitView.splitViewItems
        guard items.count >= 1 else { return }
        let sidebarItem = items[0]
        XCTAssertEqual(sidebarItem.minimumThickness, 180,
                       "Sidebar minimum width should be 180pt")
        XCTAssertEqual(sidebarItem.maximumThickness, 400,
                       "Sidebar maximum width should be 400pt")
    }

    // MARK: - Window Configuration

    func test_window_has_minimum_size() throws {
        let window = controller.window!
        let minSize = window.minSize
        XCTAssertEqual(minSize.width, 800,
                       "Minimum window width should be 800pt")
        XCTAssertEqual(minSize.height, 500,
                       "Minimum window height should be 500pt")
    }

    func test_window_title_is_set() throws {
        let window = controller.window!
        XCTAssertEqual(window.title, "BYF Desktop",
                       "Window title should be 'BYF Desktop'")
    }

    func test_window_style_mask_includes_expected_styles() throws {
        let window = controller.window!
        let mask = window.styleMask
        XCTAssertTrue(mask.contains(.titled),
                       "Window should have title bar")
        XCTAssertTrue(mask.contains(.closable),
                       "Window should be closable")
        XCTAssertTrue(mask.contains(.miniaturizable),
                       "Window should be miniaturizable")
        XCTAssertTrue(mask.contains(.resizable),
                       "Window should be resizable")
    }

    // MARK: - Sidebar-Tab Wiring

    func test_sidebar_selection_creates_tab() throws {
        // Given: no tabs exist
        XCTAssertEqual(controller.tabViewController.tabView.numberOfTabViewItems, 0)

        // When: sidebar posts selection notification
        let session: [String: Any] = [
            "id": "sess-wired-1",
            "title": "Wired Session",
            "lastPrompt": "test",
            "updatedAt": "2026-06-18T10:00:00Z",
        ]
        NotificationCenter.default.post(
            name: .sidebarDidSelectSession,
            object: controller.sidebarViewController,
            userInfo: ["sessionId": "sess-wired-1", "session": session]
        )

        // Then: a tab should be created
        XCTAssertEqual(controller.tabViewController.tabView.numberOfTabViewItems, 1,
                       "Sidebar selection should create a tab")
        let tab = controller.tabViewController.tabView.tabViewItems.first
        XCTAssertEqual(tab?.identifier as? String, "sess-wired-1",
                       "Tab identifier should match session ID")
    }

    func test_sidebar_selection_switches_existing_tab() throws {
        // Given: a tab already exists for this session
        controller.tabViewController.addTab(sessionId: "sess-existing")
        let firstTabVC = controller.tabViewController.tabView.tabViewItems.first?.viewController

        // When: sidebar posts selection for same session
        NotificationCenter.default.post(
            name: .sidebarDidSelectSession,
            object: controller.sidebarViewController,
            userInfo: ["sessionId": "sess-existing", "session": [:]]
        )

        // Then: no new tab created — same tab count
        XCTAssertEqual(controller.tabViewController.tabView.numberOfTabViewItems, 1,
                       "Selecting existing session should not duplicate tabs")
    }

    func test_setWorkDir_refreshes_sidebar() throws {
        // When
        controller.setWorkDir("/Users/test/new-workspace")

        // Then: sidebar workDir is updated
        XCTAssertEqual(controller.sidebarViewController.workDir, "/Users/test/new-workspace")
    }
}
