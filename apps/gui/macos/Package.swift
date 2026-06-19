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
    ]
)
