# Interaction and Input

BYF runs as an interactive TUI with an input box, conversation view, and status bar. This page covers basic operations, mode switches, the approval flow, and shortcuts. The full list is available via `/help`.

## Input box basics

The input box accepts free-form text; pressing `Enter` sends, and `Shift-Enter` inserts a line break. When the input box is empty, press `↑` / `↓` to browse history for the current directory.

Press `Ctrl-D` twice to exit the CLI. `Ctrl-C` interrupts the current turn while streaming; press it twice in the idle state to exit. `Esc` closes dialogs and also interrupts a turn while streaming.

## Slash commands and `@` mentions

Anything starting with `/` is recognized as a slash command, covering session management, mode switching, configuration, and more — such as `/help`, `/new`, `/sessions`, and `/model`. See the [slash command reference](../reference/slash-commands.md) for the full list.

Type `/` to open the command completion menu, which also includes commands from [Agent Skills](../customization/skills.md). If a skill name collides with a built-in command, use the full `/skill:<name>` form. Press `Esc` to dismiss.

Some commands are only available while the agent is idle; interrupt the current turn first if the agent is streaming. Mode-switch and query commands such as `/yolo` and `/help` are always available.

Type `@` to trigger file-path completion. Selecting an entry inserts the relative path, and the agent can read the file directly. Dot-prefixed directories are hidden by default; write `@.github/` to include them explicitly.

## YOLO mode

YOLO mode automatically approves most tool calls, skipping the approval step. Enter `/yolo` (or `/yes`) to toggle; available both idle and streaming.

## Approval flow

When the agent invokes a tool with side effects (such as modifying a file or running a command), an approval panel pops up for your confirmation. This is skipped in YOLO mode.

Use arrow keys to select an option and `Enter` to confirm; press `1` / `2` / `3` to select by position directly. `Esc`, `Ctrl-C`, and `Ctrl-D` all reject the request. The panel usually also offers an "Approve for this session" option to auto-allow similar calls going forward.

## Working while output is streaming

While the agent is thinking or making tool calls ("streaming output"), the input box is still usable:

- `Esc` — interrupt the current turn.
- `Ctrl-C` — also interrupts; press twice in the idle state to exit.
- `Ctrl-S` — insert the current input-box content as an additional message into the in-progress turn.
- `Ctrl-O` — globally toggle the collapsed state of all tool output.

## External editor

Press `Ctrl-G` to open the current input in an external editor; saved content is loaded back when the editor closes.

Editor priority: `/editor` config > `$VISUAL` > `$EDITOR`. Run `/editor` first if none is configured.

## Pasting images and videos

Paste images or videos from the clipboard directly into the input box for multimodal models:

- Unix (macOS / Linux): `Ctrl-V`
- Windows: `Alt-V`

Placeholders appear in the input box and behave like ordinary text; they are replaced with the actual content when sent. Plain text falls back to a normal paste. Media attachments are kept in the current session only.

## Viewing all shortcuts

Enter `/help` to open a panel listing all shortcuts and slash commands. Scroll with `↑` / `↓`, page with `PageUp` / `PageDown`, and close with `Esc`, `Enter`, or `q`.
