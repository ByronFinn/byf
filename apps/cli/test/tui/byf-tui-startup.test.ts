import { describe, expect, it, vi } from "vitest";

import { log } from "@byfriends/sdk";

import { ByfTui, type ByfTuiStartupInput, type TUIState } from "#/tui/byf-tui";
import {
  DISABLE_TERMINAL_THEME_REPORTING,
  ENABLE_TERMINAL_THEME_REPORTING,
  OSC11_QUERY,
  QUERY_TERMINAL_THEME,
  TERMINAL_THEME_LIGHT,
} from "#/tui/utils/terminal-theme";

interface StartupDriver {
  state: TUIState;
  init(): Promise<boolean>;
  handleLoginCommand(): Promise<void>;
  handleLogoutCommand(): Promise<void>;
}

interface ThemeTrackingDriver extends StartupDriver {
  refreshTerminalThemeTracking(): void;
}

function makeStartupInput(
  cliOptions: Partial<ByfTuiStartupInput["cliOptions"]> = {},
  tuiConfig: Partial<ByfTuiStartupInput["tuiConfig"]> = {},
  resolvedTheme: ByfTuiStartupInput["resolvedTheme"] = "dark",
): ByfTuiStartupInput {
  return {
    cliOptions: {
      session: undefined,
      continue: false,
      yolo: false,
      plan: false,
      model: undefined,
      outputFormat: undefined,
      prompt: undefined,
      skillsDirs: [],
      ...cliOptions,
    },
    tuiConfig: {
      theme: "dark",
      editorCommand: null,
      notifications: { enabled: true, condition: "unfocused" },
      ...tuiConfig,
    },
    version: "0.0.0-test",
    workDir: "/tmp/proj-a",
    resolvedTheme,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "ses-1",
    model: "k2",
    summary: { title: "Session title" },
    getStatus: vi.fn(async () => ({
      model: "k2",
      thinkingLevel: "off",
      permission: "manual",
      planMode: false,
      contextTokens: 10,
      maxContextTokens: 100,
      contextUsage: 0.1,
    })),
    setApprovalHandler: vi.fn(),
    setQuestionHandler: vi.fn(),
    setModel: vi.fn(async () => {}),
    setThinking: vi.fn(async () => {}),
    setPermission: vi.fn(async () => {}),
    setPlanMode: vi.fn(async () => {}),
    onEvent: vi.fn(() => () => {}),
    listSkills: vi.fn(async () => []),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

function loginRequiredError(): Error & { readonly code: string } {
  return Object.assign(new Error('OAuth provider "test-provider" requires login.'), {
    code: "auth.login_required",
  });
}

function makeHarness(session = makeSession(), overrides: Record<string, unknown> = {}) {
  return {
    getConfig: vi.fn(async () => ({
      models: {
        k2: { model: "byf-v1", maxContextSize: 100 },
      },
    })),
    createSession: vi.fn(async () => session),
    resumeSession: vi.fn(async () => session),
    listSessions: vi.fn(async () => []),
    close: vi.fn(async () => {}),
    track: vi.fn(),
    setTelemetryContext: vi.fn(),
    auth: {
      status: vi.fn(async () => ({ providers: [] })),
      login: vi.fn(async () => {}),
      logout: vi.fn(),
      getManagedUsage: vi.fn(),
    },
    ...overrides,
  };
}

function makeDriver(harness: ReturnType<typeof makeHarness>, input: ByfTuiStartupInput) {
  const driver = new ByfTui(harness as never, input) as unknown as StartupDriver;
  vi.spyOn(driver.state.ui, "requestRender").mockImplementation(() => {});
  vi.spyOn(driver.state.terminal, "setProgress").mockImplementation(() => {});
  return driver;
}

type InputListener = Parameters<TUIState["ui"]["addInputListener"]>[0];
const DARK_OSC11_REPORT = "\u001B]11;rgb:2828/2c2c/3434\u0007";
const LIGHT_OSC11_REPORT = "\u001B]11;rgb:fafa/fbfb/fcfc\u0007";

function captureInputListeners(driver: StartupDriver) {
  const listeners: InputListener[] = [];
  const removeInputListener = vi.fn<() => void>();
  const write = vi.spyOn(driver.state.terminal, "write").mockImplementation(() => {});
  const addInputListener = vi
    .spyOn(driver.state.ui, "addInputListener")
    .mockImplementation((listener: InputListener) => {
      listeners.push(listener);
      return removeInputListener;
    });

  return { listeners, removeInputListener, write, addInputListener };
}

describe("ByfTui startup", () => {
  it("creates a fresh session from startup flags and syncs runtime state", async () => {
    const session = makeSession({
      getStatus: vi.fn(async () => ({
        model: "k2",
        thinkingLevel: "off",
        permission: "yolo",
        planMode: true,
        contextTokens: 25,
        maxContextTokens: 200,
        contextUsage: 0.125,
      })),
    });
    const harness = makeHarness(session);
    const driver = makeDriver(harness, makeStartupInput({ yolo: true, plan: true }));

    await expect(driver.init()).resolves.toBe(false);

    expect(harness.createSession).toHaveBeenCalledWith({
      workDir: "/tmp/proj-a",
      permission: "yolo",
      planMode: true,
    });
    expect(session.setApprovalHandler).toHaveBeenCalledOnce();
    expect(session.setQuestionHandler).toHaveBeenCalledOnce();
    expect(harness.setTelemetryContext).toHaveBeenCalledWith({ sessionId: null });
    expect(harness.setTelemetryContext).toHaveBeenLastCalledWith({ sessionId: "ses-1" });
    expect(driver.state.startupState).toBe("ready");
    expect(driver.state.appState).toMatchObject({
      sessionId: "ses-1",
      model: "k2",
      permissionMode: "yolo",
      yolo: true,
      planMode: true,
      contextTokens: 25,
      maxContextTokens: 200,
      contextUsage: 0.125,
      sessionTitle: "Session title",
    });
  });

  it("resumes the latest session for --continue and marks history for replay", async () => {
    const session = makeSession({ id: "ses-latest" });
    const harness = makeHarness(session, {
      listSessions: vi.fn(async () => [{ id: "ses-latest" }, { id: "ses-old" }]),
    });
    const driver = makeDriver(harness, makeStartupInput({ continue: true }));

    await expect(driver.init()).resolves.toBe(true);

    expect(harness.resumeSession).toHaveBeenCalledWith({ id: "ses-latest" });
    expect(harness.createSession).not.toHaveBeenCalled();
    expect(driver.state.startupState).toBe("ready");
    expect(driver.state.appState.sessionId).toBe("ses-latest");
  });

  it("passes the CLI model override when creating a fresh startup session", async () => {
    const harness = makeHarness();
    const driver = makeDriver(harness, makeStartupInput({ model: "byf/k2.5" }));

    await expect(driver.init()).resolves.toBe(false);

    expect(harness.createSession).toHaveBeenCalledWith({
      workDir: "/tmp/proj-a",
      model: "byf/k2.5",
      permission: undefined,
      planMode: undefined,
    });
  });

  it("applies the CLI model override when resuming a startup session", async () => {
    let model = "k2";
    const session = makeSession({
      setModel: vi.fn(async (nextModel: string) => {
        model = nextModel;
      }),
      getStatus: vi.fn(async () => ({
        model,
        thinkingLevel: "off",
        permission: "manual",
        planMode: false,
        contextTokens: 10,
        maxContextTokens: 100,
        contextUsage: 0.1,
      })),
    });
    const harness = makeHarness(session, {
      listSessions: vi.fn(async () => [{ id: "ses-latest" }]),
    });
    const driver = makeDriver(
      harness,
      makeStartupInput({ continue: true, model: "byf/k2.5" }),
    );

    await expect(driver.init()).resolves.toBe(true);

    expect(session.setModel).toHaveBeenCalledWith("byf/k2.5");
    expect(driver.state.appState.model).toBe("byf/k2.5");
  });

  it("enters picker startup for bare --session without creating a session", async () => {
    const harness = makeHarness();
    const driver = makeDriver(harness, makeStartupInput({ session: "" }));

    await expect(driver.init()).resolves.toBe(false);

    expect(harness.createSession).not.toHaveBeenCalled();
    expect(harness.resumeSession).not.toHaveBeenCalled();
    expect(driver.state.startupState).toBe("picker");
  });

  it("tracks terminal theme reports while auto theme is active", () => {
    const harness = makeHarness();
    const driver = makeDriver(
      harness,
      makeStartupInput({}, { theme: "auto" }, "dark"),
    ) as unknown as ThemeTrackingDriver;
    const { listeners, write, addInputListener } = captureInputListeners(driver);

    driver.refreshTerminalThemeTracking();

    expect(addInputListener).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(ENABLE_TERMINAL_THEME_REPORTING);
    expect(write).toHaveBeenCalledWith(OSC11_QUERY);
    expect(write).toHaveBeenCalledWith(QUERY_TERMINAL_THEME);
    expect(listeners).toHaveLength(1);

    write.mockClear();
    expect(listeners[0]?.(TERMINAL_THEME_LIGHT)).toEqual({ consume: true });
    expect(write).toHaveBeenCalledWith(OSC11_QUERY);
    expect(driver.state.appState.theme).toBe("auto");
    expect(driver.state.theme.resolvedTheme).toBe("dark");
    expect(driver.state.ui.requestRender).not.toHaveBeenCalled();

    expect(listeners[0]?.(DARK_OSC11_REPORT)).toEqual({ consume: true });
    expect(driver.state.appState.theme).toBe("auto");
    expect(driver.state.theme.resolvedTheme).toBe("dark");
    expect(driver.state.ui.requestRender).not.toHaveBeenCalled();

    expect(listeners[0]?.(LIGHT_OSC11_REPORT)).toEqual({ consume: true });
    expect(driver.state.appState.theme).toBe("auto");
    expect(driver.state.theme.resolvedTheme).toBe("light");
    expect(driver.state.ui.requestRender).toHaveBeenCalled();
  });

  it("does not track terminal theme reports for explicit themes", () => {
    const harness = makeHarness();
    const driver = makeDriver(harness, makeStartupInput()) as unknown as ThemeTrackingDriver;
    const { write, addInputListener } = captureInputListeners(driver);

    driver.refreshTerminalThemeTracking();

    expect(addInputListener).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("disables terminal theme reports after leaving auto theme", () => {
    const harness = makeHarness();
    const driver = makeDriver(
      harness,
      makeStartupInput({}, { theme: "auto" }, "dark"),
    ) as unknown as ThemeTrackingDriver;
    const { write, removeInputListener } = captureInputListeners(driver);

    driver.refreshTerminalThemeTracking();
    driver.state.appState.theme = "dark";
    driver.refreshTerminalThemeTracking();

    expect(removeInputListener).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(DISABLE_TERMINAL_THEME_REPORTING);
  });

  it("starts TUI without a session when fresh startup needs provider setup", async () => {
    const harness = makeHarness(makeSession(), {
      createSession: vi.fn(async () => {
        throw loginRequiredError();
      }),
    });
    const driver = makeDriver(harness, makeStartupInput());

    await expect(driver.init()).resolves.toBe(false);

    expect(driver.state.startupState).toBe("ready");
    expect(driver.state.startupNotice).toContain(
      "Authentication required. Use /login or /connect to configure a provider.",
    );
    expect(driver.state.appState).toMatchObject({
      sessionId: "",
      model: "",
      thinkingEffort: "off",
      contextTokens: 0,
      maxContextTokens: 0,
      contextUsage: 0,
      sessionTitle: null,
    });
  });

  it("starts TUI without replaying when --continue needs OAuth login", async () => {
    const harness = makeHarness(makeSession(), {
      listSessions: vi.fn(async () => [{ id: "ses-latest" }]),
      resumeSession: vi.fn(async () => {
        throw loginRequiredError();
      }),
    });
    const driver = makeDriver(harness, makeStartupInput({ continue: true }));

    await expect(driver.init()).resolves.toBe(false);

    expect(harness.resumeSession).toHaveBeenCalledWith({ id: "ses-latest" });
    expect(harness.createSession).not.toHaveBeenCalled();
    expect(driver.state.startupState).toBe("ready");
    expect(driver.state.appState.sessionId).toBe("");
  });

  it("starts TUI without replaying when an explicit resume needs OAuth login", async () => {
    const harness = makeHarness(makeSession(), {
      listSessions: vi.fn(async () => [{ id: "ses-target" }]),
      resumeSession: vi.fn(async () => {
        throw loginRequiredError();
      }),
    });
    const driver = makeDriver(harness, makeStartupInput({ session: "ses-target" }));

    await expect(driver.init()).resolves.toBe(false);

    expect(harness.resumeSession).toHaveBeenCalledWith({ id: "ses-target" });
    expect(driver.state.startupState).toBe("ready");
    expect(driver.state.appState.sessionId).toBe("");
  });

  it("keeps non-login startup session errors fatal", async () => {
    const harness = makeHarness(makeSession(), {
      createSession: vi.fn(async () => {
        throw new Error("provider config is invalid");
      }),
    });
    const driver = makeDriver(harness, makeStartupInput());

    await expect(driver.init()).rejects.toThrow("provider config is invalid");
  });

  it("emits a deprecation warning when defaultThinking is true and maps to effort high", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    const session = makeSession({
      getStatus: vi.fn(async () => ({
        model: "k2",
        thinkingLevel: "on",
        permission: "manual",
        planMode: false,
        contextTokens: 10,
        maxContextTokens: 100,
        contextUsage: 0.1,
      })),
    });
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        defaultModel: "k2",
        defaultThinking: true,
        models: {
          k2: { model: "byf-v1", maxContextSize: 100, capabilities: ["thinking"] },
        },
      })),
    });
    const driver = makeDriver(harness, makeStartupInput());

    await (driver as any).refreshConfigAfterLogin();

    expect(warn).toHaveBeenCalledWith(
      "defaultThinking is deprecated. Use [thinking] mode and effort instead.",
    );
    expect(driver.state.appState.thinkingEffort).toBe("high");

    warn.mockRestore();
  });

  it("emits a deprecation warning when defaultThinking is false and maps to effort off", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    const session = makeSession({
      getStatus: vi.fn(async () => ({
        model: "k2",
        thinkingLevel: "off",
        permission: "manual",
        planMode: false,
        contextTokens: 10,
        maxContextTokens: 100,
        contextUsage: 0.1,
      })),
    });
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        defaultModel: "k2",
        defaultThinking: false,
        models: {
          k2: { model: "byf-v1", maxContextSize: 100 },
        },
      })),
    });
    const driver = makeDriver(harness, makeStartupInput());

    await (driver as any).refreshConfigAfterLogin();

    expect(warn).toHaveBeenCalledWith(
      "defaultThinking is deprecated. Use [thinking] mode and effort instead.",
    );
    expect(driver.state.appState.thinkingEffort).toBe("off");

    warn.mockRestore();
  });

  it("does not emit a deprecation warning when defaultThinking is absent", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        defaultModel: "k2",
        models: {
          k2: { model: "byf-v1", maxContextSize: 100 },
        },
      })),
    });
    const driver = makeDriver(harness, makeStartupInput());

    await (driver as any).refreshConfigAfterLogin();

    expect(warn).not.toHaveBeenCalledWith(
      "defaultThinking is deprecated. Use [thinking] mode and effort instead.",
    );

    warn.mockRestore();
  });
});
