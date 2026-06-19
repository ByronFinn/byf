import Cocoa

/// Renders markdown text as an NSAttributedString using AttributedString(markdown:).
///
/// Falls back to plain text if markdown parsing fails.
final class MarkdownRenderer {
    /// Render markdown string to NSAttributedString (dark-mode aware).
    /// - Parameter markdown: Markdown-formatted text
    /// - Returns: NSAttributedString suitable for NSTextView display
    static func render(_ markdown: String) -> NSAttributedString {
        guard !markdown.isEmpty else {
            return NSAttributedString()
        }

        do {
            let attributed = try AttributedString(markdown: markdown)
            // Convert Foundation AttributedString → AppKit NSAttributedString
            return NSAttributedString(attributed)
        } catch {
            // Fallback: plain text
            return NSAttributedString(string: markdown)
        }
    }
}
