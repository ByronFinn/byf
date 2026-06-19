// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ByfDesktop",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "ByfDesktop", targets: ["ByfDesktop"]),
    ],
    targets: [
        .target(
            name: "ByfDesktop",
            path: ".",
            exclude: [
                "Package.swift",
                "Tests",
            ],
            sources: [
                "App/",
                "Services/",
                "UI/",
                "Models/",
            ]
        ),
        // Test target requires Xcode (XCTest framework). Not buildable with CLI-only tools.
        // Run `swift test` from Xcode or with `xcodebuild` after opening the project.
        .testTarget(
            name: "ByfDesktopTests",
            dependencies: ["ByfDesktop"],
            path: "Tests",
            sources: [
                "MainWindowControllerTests.swift",
                "SidebarViewControllerTests.swift",
                "TabViewControllerTests.swift",
                "ChatViewControllerTests.swift",
                "MessageStoreTests.swift",
                "DeltaCoalescerTests.swift",
                "MockRpcClient.swift",
            ]
        ),
    ]
)
