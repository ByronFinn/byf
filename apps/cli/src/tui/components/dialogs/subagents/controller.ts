/**
 * SubagentsController — manages the /agent full-screen lifecycle.
 */

import type { Terminal } from '@earendil-works/pi-tui';

import type { ColorPalette } from '#/tui/theme/colors';
import type { FullscreenHost } from '#/tui/types';
import type { ToolCallComponent } from '#/tui/components/messages/tool-call';
import { sanitizeForDisplay } from '#/tui/utils/sanitize-text';

import { SubagentsListApp, type SubagentListEntry, type SubagentDetailPane, type SubagentPreviewPane } from './list-app';
import { SubagentLiveViewer } from './live-viewer';

/**
 * Coalesce window for live-viewer snapshot updates. Foreground sub-agents
 * stream `assistant.delta` / `tool.call.delta` at high frequency (often one
 * event per token). Re-rendering the viewer (which re-renders the entire
 * activity trail + text via ANSI-styled `renderLines`) on every delta
 * overwhelms the terminal diff renderer and produces freeze + garbled
 * output. We coalesce bursts into a single render at most every
 * {@link VIEWER_COALESCE_MS}. Aligned in spirit with
 * `AgentGroupComponent.THROTTLE_MS` (200ms), but tighter so the viewer
 * stays responsive for streaming output. User-initiated `setProps` (e.g.
 * `t` to toggle thinking) bypass this window and flush immediately.
 */
const VIEWER_COALESCE_MS = 80;

export interface SubagentsEnv {
  readonly host: FullscreenHost;
  getTerminal(): Terminal;
  getColors(): ColorPalette;
  showError(message: string): void;
  collectItems(): SubagentListEntry[];
  getComponentById(toolCallId: string): ToolCallComponent | undefined;
}

// ── Controller ──────────────────────────────────────────────────────

export class SubagentsController {
  private listState:
    | {
        readonly savedChildren: readonly import('@earendil-works/pi-tui').Component[];
        readonly listApp: SubagentsListApp;
        readonly pollTimer: ReturnType<typeof setInterval>;
      }
    | undefined;

  private viewerState:
    | {
        readonly viewer: SubagentLiveViewer;
        readonly viewerSavedChildren: readonly import('@earendil-works/pi-tui').Component[];
        readonly tc: ToolCallComponent;
        /** Unsubscribes this viewer's snapshot listener without touching others. */
        unsubscribe: () => void;
        /** Coalesce timer for streaming snapshot updates (see VIEWER_COALESCE_MS). */
        pendingRenderTimer: ReturnType<typeof setTimeout> | undefined;
      }
    | undefined;

  constructor(private readonly env: SubagentsEnv) {}

  get isOpen(): boolean {
    return this.listState !== undefined || this.viewerState !== undefined;
  }

  show(): void {
    if (this.listState !== undefined || this.viewerState !== undefined) return;

    const items = this.env.collectItems();
    const listApp = new SubagentsListApp(
      {
        entries: items,
        colors: this.env.getColors(),
        onClose: () => { this.close(); },
        onSelect: (id) => { this.openViewer(id); },
        onSelectionChange: (index) => { this.pushListProps(listApp, index); },
      },
      this.env.getTerminal(),
    );

    const savedChildren = this.env.host.showFullscreen(listApp);
    // Push initial detail/preview for selected entry
    this.pushListProps(listApp);

    const pollTimer = setInterval(() => {
      if (this.viewerState !== undefined) return; // viewer is open, skip poll
      this.pushListProps(listApp);
    }, 1000);

    this.listState = { savedChildren, listApp, pollTimer };
  }

  /**
   * Re-fetches entries and pushes updated props (detail/preview for selected) to
   * the list app. `selectedIndex` is optional; when omitted the list app's
   * current selection is used.
   */
  private pushListProps(listApp: SubagentsListApp, selectedIndex?: number): void {
    const nextItems = this.env.collectItems();

    // Build detail/preview for the selected entry
    const index = selectedIndex ?? listApp.selectedIndex;
    const selectedEntry = nextItems[index];
    let selectedDetail: SubagentDetailPane | undefined;
    let selectedPreview: SubagentPreviewPane | undefined;

    if (selectedEntry !== undefined) {
      const tc = this.env.getComponentById(selectedEntry.toolCallId);
      if (tc !== undefined) {
        const snap = tc.getSubagentSnapshot();
        const detail = tc.getSubagentActivityDetail();
        selectedDetail = {
          latestActivity: snap.latestActivity,
          toolList: detail.activities.map((a) =>
            a.phase === 'failed' ? `✗ ${a.name}`
            : a.phase === 'ongoing' ? `… ${a.name}`
            : `• ${a.name}`,
          ),
          errorText: snap.errorText !== undefined ? sanitizeForDisplay(snap.errorText) : undefined,
        };
        selectedPreview = {
          lines: sanitizeForDisplay(detail.text).split('\n').slice(-10),
          resultSummary: detail.resultSummary !== undefined
            ? sanitizeForDisplay(detail.resultSummary)
            : undefined,
          toolOutputs: detail.activities
            .filter((a) => a.phase === 'done' && a.output !== undefined && a.output.length > 0)
            .map((a) => `[${a.name}] ${sanitizeForDisplay(a.output!).split('\n').slice(0, 3).join('\n')}`),
          activityLines: detail.activities.map((a) =>
            formatPreviewActivityLine(a.name, a.args, a.phase),
          ),
        };
      }
    }

    listApp.setProps({
      entries: nextItems,
      selectedDetail,
      selectedPreview,
      colors: this.env.getColors(),
      onClose: () => { this.close(); },
      onSelect: (id) => { this.openViewer(id); },
      onSelectionChange: (idx) => { this.pushListProps(listApp, idx); },
    });

    // setProps only marks the component dirty; we must ask the host to render.
    this.env.host.requestRender();
  }

  close(): void {
    if (this.viewerState !== undefined) this.closeViewer();
    const ls = this.listState;
    if (ls === undefined) return;
    clearInterval(ls.pollTimer);
    this.env.host.closeFullscreen(ls.savedChildren);
    this.listState = undefined;
  }

  private openViewer(toolCallId: string): void {
    if (this.viewerState !== undefined) return;

    const tc = this.env.getComponentById(toolCallId);
    if (tc === undefined) {
      this.env.showError(`Sub-agent ${toolCallId} no longer available`);
      return;
    }

    const detail = tc.getSubagentActivityDetail();
    const viewer = new SubagentLiveViewer(
      { data: detail, colors: this.env.getColors(), onClose: () => { this.closeViewer(); } },
      this.env.getTerminal(),
    );

    const viewerSavedChildren = this.env.host.showFullscreen(viewer);

    const vs: NonNullable<SubagentsController['viewerState']> = {
      viewer,
      viewerSavedChildren,
      tc,
      unsubscribe: () => {},
      pendingRenderTimer: undefined,
    };
    this.viewerState = vs;

    // Subscribe to live updates. Foreground sub-agents stream deltas at high
    // frequency; coalesce bursts into one render every VIEWER_COALESCE_MS to
    // avoid overwhelming the terminal diff renderer (freeze + garbled output).
    // Uses `addSnapshotListener` (not the deprecated `setSnapshotListener`,
    // which clears ALL listeners including AgentGroup/ReadGroup subscriptions)
    // so the viewer coexists with grouped-card listeners. The first callback
    // (fired synchronously on registration) is let through immediately so the
    // viewer shows its initial state without delay.
    //
    // Errors are swallowed (not re-thrown) because this listener runs from a
    // high-frequency streaming path and from a setTimeout handler. Re-throwing
    // from the synchronous first callback would leak the listener
    // (`addSnapshotListener` adds to the Set before calling back) and from the
    // timer would surface as an uncaught exception that can tear down the TUI.
    let firstCallback = true;
    const listener = (): void => {
      if (this.viewerState !== vs) return; // viewer already closed
      const run = (): void => {
        if (firstCallback) {
          firstCallback = false;
          this.flushViewerUpdate(vs);
          return;
        }
        if (vs.pendingRenderTimer !== undefined) return; // already scheduled
        vs.pendingRenderTimer = setTimeout(() => {
          vs.pendingRenderTimer = undefined;
          if (this.viewerState !== vs) return;
          try {
            this.flushViewerUpdate(vs);
          } catch {
            // Swallow: a throw here would be an uncaught exception in the
            // timer. The viewer will refresh on the next snapshot tick.
          }
        }, VIEWER_COALESCE_MS);
      };
      try {
        run();
      } catch {
        // Swallow: see note above. The snapshot fan-out in
        // ToolCallComponent.notifySnapshotChange iterates listeners; a throw
        // here would otherwise silence sibling AgentGroup/ReadGroup listeners.
      }
    };
    vs.unsubscribe = tc.addSnapshotListener(listener);
  }

  /** Pushes a fresh snapshot into the viewer and asks the host to render. */
  private flushViewerUpdate(vs: { readonly viewer: SubagentLiveViewer; readonly tc: ToolCallComponent }): void {
    vs.viewer.setProps({
      data: vs.tc.getSubagentActivityDetail(),
      colors: this.env.getColors(),
      onClose: () => { this.closeViewer(); },
    });
    this.env.host.requestRender();
  }

  private closeViewer(): void {
    const vs = this.viewerState;
    if (vs === undefined) return;
    if (vs.pendingRenderTimer !== undefined) {
      clearTimeout(vs.pendingRenderTimer);
      vs.pendingRenderTimer = undefined;
    }
    vs.unsubscribe();
    this.viewerState = undefined;

    // Restore the list layer (viewerSavedChildren contains the list app).
    // closeFullscreen focuses the editor by default, so re-focus listApp.
    if (this.listState !== undefined) {
      this.env.host.closeFullscreen(vs.viewerSavedChildren);
      this.env.host.focus(this.listState.listApp);
      this.env.host.requestRender(true);
    }
  }
}

// ── Preview helpers ─────────────────────────────────────────────────

/** Formats a single activity line for the list preview pane. */
function formatPreviewActivityLine(
  name: string,
  args: Record<string, unknown>,
  phase: import('#/tui/components/messages/tool-call').SubagentActivityLine['phase'],
): string {
  const verb = phase === 'ongoing' ? 'Using' : phase === 'failed' ? 'Used' : 'Used';
  const arg = previewKeyArg(name, args);
  return arg ? `${verb} ${name} (${arg})` : `${verb} ${name}`;
}

/** Extracts a concise key argument for the preview activity line. */
function previewKeyArg(name: string, args: Record<string, unknown>): string | undefined {
  const keyMap: Record<string, string[]> = {
    Bash: ['command'],
    Read: ['path', 'file_path'],
    Write: ['path', 'file_path'],
    Edit: ['path', 'file_path'],
    Grep: ['pattern'],
    Glob: ['pattern'],
    WebSearch: ['query'],
    Agent: ['description', 'prompt'],
  };
  const candidates = keyMap[name] ?? Object.keys(args);
  for (const key of candidates) {
    const val = args[key];
    if (typeof val === 'string' && val.length > 0) {
      const firstLine = sanitizeForDisplay(val).split('\n')[0] ?? val;
      return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
    }
  }
  return undefined;
}
