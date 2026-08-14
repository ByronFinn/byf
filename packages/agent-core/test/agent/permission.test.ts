import type { Kaos } from '@byfriends/kaos';
import type { ToolCall } from '@byfriends/kosong';
import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '../../src/agent';
import { PermissionModeInjector } from '../../src/agent/injection/permission-mode';
import {
  PermissionManager,
  type ApprovalResponse,
  type PermissionMode,
  type PermissionRule,
} from '../../src/agent/permission';
import {
  actionToRulePattern,
  describeApprovalAction,
} from '../../src/agent/permission/action-label';
import { checkMatchingRules } from '../../src/agent/permission/check-rules';
import { matchesRule } from '../../src/agent/permission/matches-rule';
import { parsePattern } from '../../src/agent/permission/parse-pattern';
import type { PermissionPolicy, PermissionPolicyResult } from '../../src/agent/permission/policy';
import type { ToolExecutionHookContext } from '../../src/loop';
import type { ToolInputDisplay } from '../../src/tools/display';
import { createFakeKaos } from '../tools/fixtures/fake-kaos';
import { createCommandKaos, testAgent } from './harness/agent';
import { formatHarnessSnapshot } from './harness/snapshots';

describe('Agent permission', () => {
  it('auto mode bypasses approval for ordinary builtin tools', async () => {
    const ctx = testAgent({ kaos: createCommandKaos('auto-output') });
    ctx.configure({ tools: ['Bash'] });
    await ctx.rpc.setPermission({ mode: 'auto' });

    ctx.mockNextResponse({ type: 'text', text: 'Running without asking.' }, bashCall());
    ctx.mockNextResponse({ type: 'text', text: 'The command printed auto-output.' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Run Bash in auto mode' }] });

    expect(formatHarnessSnapshot(await ctx.untilTurnEnd())).toMatchInlineSnapshot(`
      "[wire] permission.set_mode         { "mode": "auto", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 0, "maxContextTokens": 1000000, "contextUsage": 0, "permission": "auto" }
      [wire] turn.prompt                 { "input": [ { "type": "text", "text": "Run Bash in auto mode" } ], "origin": { "kind": "user" }, "time": "<time>" }
      [emit] turn.started                { "turnId": 0, "origin": { "kind": "user" } }
      [wire] context.append_message      { "message": { "role": "user", "content": [ { "type": "text", "text": "Run Bash in auto mode" } ], "toolCalls": [], "origin": { "kind": "user" } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "step.begin", "uuid": "<uuid-1>", "turnId": "0", "step": 1 }, "time": "<time>" }
      [emit] turn.step.started           { "turnId": 0, "step": 1, "stepId": "<uuid-1>" }
      [emit] assistant.delta             { "turnId": 0, "delta": "Running without asking." }
      [emit] tool.call.delta             { "turnId": 0, "toolCallId": "call_bash", "name": "Bash", "argumentsPart": "{\\"command\\":\\"printf permission-output\\",\\"timeout\\":60}" }
      [wire] context.append_loop_event   { "event": { "type": "content.part", "uuid": "<uuid-2>", "turnId": "0", "step": 1, "stepUuid": "<uuid-1>", "part": { "type": "text", "text": "Running without asking." } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "tool.call", "uuid": "call_bash", "turnId": "0", "step": 1, "stepUuid": "<uuid-1>", "toolCallId": "call_bash", "name": "Bash", "args": { "command": "printf permission-output", "timeout": 60 }, "description": "Running: printf permission-output" }, "time": "<time>" }
      [emit] tool.call.started           { "turnId": 0, "toolCallId": "call_bash", "name": "Bash", "args": { "command": "printf permission-output", "timeout": 60 }, "description": "Running: printf permission-output" }
      [wire] context.append_loop_event   { "event": { "type": "tool.result", "parentUuid": "call_bash", "toolCallId": "call_bash", "result": { "output": "auto-output" } }, "time": "<time>" }
      [emit] tool.result                 { "turnId": 0, "toolCallId": "call_bash", "output": "auto-output" }
      [wire] context.append_loop_event   { "event": { "type": "step.end", "uuid": "<uuid-1>", "turnId": "0", "step": 1, "usage": { "inputOther": 91, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "tool_use" }, "time": "<time>" }
      [emit] turn.step.completed         { "turnId": 0, "step": 1, "stepId": "<uuid-1>", "usage": { "inputOther": 91, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "tool_use" }
      [wire] usage.record                { "model": "mock-model", "usage": { "inputOther": 91, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "usageScope": "turn", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 116, "maxContextTokens": 1000000, "contextUsage": 0.000116, "permission": "auto", "usage": { "byModel": { "mock-model": { "inputOther": 91, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 91, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "currentTurn": { "inputOther": 91, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [wire] context.append_loop_event   { "event": { "type": "step.begin", "uuid": "<uuid-3>", "turnId": "0", "step": 2 }, "time": "<time>" }
      [emit] turn.step.started           { "turnId": 0, "step": 2, "stepId": "<uuid-3>" }
      [emit] assistant.delta             { "turnId": 0, "delta": "The command printed auto-output." }
      [wire] context.append_loop_event   { "event": { "type": "content.part", "uuid": "<uuid-4>", "turnId": "0", "step": 2, "stepUuid": "<uuid-3>", "part": { "type": "text", "text": "The command printed auto-output." } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "step.end", "uuid": "<uuid-3>", "turnId": "0", "step": 2, "usage": { "inputOther": 120, "output": 11, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }, "time": "<time>" }
      [emit] turn.step.completed         { "turnId": 0, "step": 2, "stepId": "<uuid-3>", "usage": { "inputOther": 120, "output": 11, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }
      [wire] usage.record                { "model": "mock-model", "usage": { "inputOther": 120, "output": 11, "inputCacheRead": 0, "inputCacheCreation": 0 }, "usageScope": "turn", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 131, "maxContextTokens": 1000000, "contextUsage": 0.000131, "permission": "auto", "usage": { "byModel": { "mock-model": { "inputOther": 211, "output": 36, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 211, "output": 36, "inputCacheRead": 0, "inputCacheCreation": 0 }, "currentTurn": { "inputOther": 211, "output": 36, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [emit] turn.ended                  { "turnId": 0, "reason": "completed" }"
    `);
    expect(formatHarnessSnapshot(ctx.llmInputs())).toMatchInlineSnapshot(`
      "call 1:
        system: <system-prompt>
        tools: Bash
        messages:
          user: text "Run Bash in auto mode"
          user: text <auto-mode-enter-reminder>

      call 2:
        messages:
          user: text "Run Bash in auto mode"
          assistant: text "Running without asking."  calls call_bash:Bash { "command": "printf permission-output", "timeout": 60 }
          tool[call_bash]: text "auto-output"
          user: text <auto-mode-enter-reminder>"
    `);
    await ctx.expectResumeMatches();
  });

  it('yolo mode bypasses approval for ordinary builtin tools', async () => {
    const ctx = testAgent({ kaos: createCommandKaos('yolo-output') });
    ctx.configure({ tools: ['Bash'] });
    await ctx.rpc.setPermission({ mode: 'yolo' });

    ctx.mockNextResponse({ type: 'text', text: 'Running in yolo mode.' }, bashCall());
    ctx.mockNextResponse({ type: 'text', text: 'The command printed yolo-output.' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Run Bash in yolo mode' }] });

    expect(formatHarnessSnapshot(await ctx.untilTurnEnd())).toMatchInlineSnapshot(`
      "[wire] permission.set_mode         { "mode": "yolo", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 0, "maxContextTokens": 1000000, "contextUsage": 0, "permission": "yolo" }
      [wire] turn.prompt                 { "input": [ { "type": "text", "text": "Run Bash in yolo mode" } ], "origin": { "kind": "user" }, "time": "<time>" }
      [emit] turn.started                { "turnId": 0, "origin": { "kind": "user" } }
      [wire] context.append_message      { "message": { "role": "user", "content": [ { "type": "text", "text": "Run Bash in yolo mode" } ], "toolCalls": [], "origin": { "kind": "user" } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "step.begin", "uuid": "<uuid-1>", "turnId": "0", "step": 1 }, "time": "<time>" }
      [emit] turn.step.started           { "turnId": 0, "step": 1, "stepId": "<uuid-1>" }
      [emit] assistant.delta             { "turnId": 0, "delta": "Running in yolo mode." }
      [emit] tool.call.delta             { "turnId": 0, "toolCallId": "call_bash", "name": "Bash", "argumentsPart": "{\\"command\\":\\"printf permission-output\\",\\"timeout\\":60}" }
      [wire] context.append_loop_event   { "event": { "type": "content.part", "uuid": "<uuid-2>", "turnId": "0", "step": 1, "stepUuid": "<uuid-1>", "part": { "type": "text", "text": "Running in yolo mode." } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "tool.call", "uuid": "call_bash", "turnId": "0", "step": 1, "stepUuid": "<uuid-1>", "toolCallId": "call_bash", "name": "Bash", "args": { "command": "printf permission-output", "timeout": 60 }, "description": "Running: printf permission-output" }, "time": "<time>" }
      [emit] tool.call.started           { "turnId": 0, "toolCallId": "call_bash", "name": "Bash", "args": { "command": "printf permission-output", "timeout": 60 }, "description": "Running: printf permission-output" }
      [wire] context.append_loop_event   { "event": { "type": "tool.result", "parentUuid": "call_bash", "toolCallId": "call_bash", "result": { "output": "yolo-output" } }, "time": "<time>" }
      [emit] tool.result                 { "turnId": 0, "toolCallId": "call_bash", "output": "yolo-output" }
      [wire] context.append_loop_event   { "event": { "type": "step.end", "uuid": "<uuid-1>", "turnId": "0", "step": 1, "usage": { "inputOther": 7, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "tool_use" }, "time": "<time>" }
      [emit] turn.step.completed         { "turnId": 0, "step": 1, "stepId": "<uuid-1>", "usage": { "inputOther": 7, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "tool_use" }
      [wire] usage.record                { "model": "mock-model", "usage": { "inputOther": 7, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "usageScope": "turn", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 32, "maxContextTokens": 1000000, "contextUsage": 0.000032, "permission": "yolo", "usage": { "byModel": { "mock-model": { "inputOther": 7, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 7, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "currentTurn": { "inputOther": 7, "output": 25, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [wire] context.append_loop_event   { "event": { "type": "step.begin", "uuid": "<uuid-3>", "turnId": "0", "step": 2 }, "time": "<time>" }
      [emit] turn.step.started           { "turnId": 0, "step": 2, "stepId": "<uuid-3>" }
      [emit] assistant.delta             { "turnId": 0, "delta": "The command printed yolo-output." }
      [wire] context.append_loop_event   { "event": { "type": "content.part", "uuid": "<uuid-4>", "turnId": "0", "step": 2, "stepUuid": "<uuid-3>", "part": { "type": "text", "text": "The command printed yolo-output." } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "step.end", "uuid": "<uuid-3>", "turnId": "0", "step": 2, "usage": { "inputOther": 36, "output": 11, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }, "time": "<time>" }
      [emit] turn.step.completed         { "turnId": 0, "step": 2, "stepId": "<uuid-3>", "usage": { "inputOther": 36, "output": 11, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }
      [wire] usage.record                { "model": "mock-model", "usage": { "inputOther": 36, "output": 11, "inputCacheRead": 0, "inputCacheCreation": 0 }, "usageScope": "turn", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 47, "maxContextTokens": 1000000, "contextUsage": 0.000047, "permission": "yolo", "usage": { "byModel": { "mock-model": { "inputOther": 43, "output": 36, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 43, "output": 36, "inputCacheRead": 0, "inputCacheCreation": 0 }, "currentTurn": { "inputOther": 43, "output": 36, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [emit] turn.ended                  { "turnId": 0, "reason": "completed" }"
    `);
    expect(formatHarnessSnapshot(ctx.llmInputs())).toMatchInlineSnapshot(`
      "call 1:
        system: <system-prompt>
        tools: Bash
        messages:
          user: text "Run Bash in yolo mode"

      call 2:
        messages:
          <last>
          assistant: text "Running in yolo mode."  calls call_bash:Bash { "command": "printf permission-output", "timeout": 60 }
          tool[call_bash]: text "yolo-output""
    `);
    await ctx.expectResumeMatches();
  });
  it('transitions from auto to manual mode without persistent injection', async () => {
    const ctx = testAgent();
    ctx.configure();
    await ctx.rpc.setPermission({ mode: 'auto' });

    ctx.mockNextResponse({ type: 'text', text: 'Auto turn done.' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Use auto first' }] });
    await ctx.untilTurnEnd();

    await ctx.rpc.setPermission({ mode: 'manual' });
    ctx.mockNextResponse({ type: 'text', text: 'Manual turn done.' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Back to manual' }] });

    expect(formatHarnessSnapshot(await ctx.untilTurnEnd())).toMatchInlineSnapshot(`
      "[wire] permission.set_mode         { "mode": "manual", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 96, "maxContextTokens": 1000000, "contextUsage": 0.000096, "permission": "manual", "usage": { "byModel": { "mock-model": { "inputOther": 89, "output": 7, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 89, "output": 7, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [wire] turn.prompt                 { "input": [ { "type": "text", "text": "Back to manual" } ], "origin": { "kind": "user" }, "time": "<time>" }
      [emit] turn.started                { "turnId": 1, "origin": { "kind": "user" } }
      [wire] context.append_message      { "message": { "role": "user", "content": [ { "type": "text", "text": "Back to manual" } ], "toolCalls": [], "origin": { "kind": "user" } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "step.begin", "uuid": "<uuid-3>", "turnId": "1", "step": 1 }, "time": "<time>" }
      [emit] turn.step.started           { "turnId": 1, "step": 1, "stepId": "<uuid-3>" }
      [emit] assistant.delta             { "turnId": 1, "delta": "Manual turn done." }
      [wire] context.append_loop_event   { "event": { "type": "content.part", "uuid": "<uuid-4>", "turnId": "1", "step": 1, "stepUuid": "<uuid-3>", "part": { "type": "text", "text": "Manual turn done." } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "step.end", "uuid": "<uuid-3>", "turnId": "1", "step": 1, "usage": { "inputOther": 17, "output": 8, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }, "time": "<time>" }
      [emit] turn.step.completed         { "turnId": 1, "step": 1, "stepId": "<uuid-3>", "usage": { "inputOther": 17, "output": 8, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }
      [wire] usage.record                { "model": "mock-model", "usage": { "inputOther": 17, "output": 8, "inputCacheRead": 0, "inputCacheCreation": 0 }, "usageScope": "turn", "time": "<time>" }
      [emit] agent.status.updated        { "model": "mock-model", "contextTokens": 25, "maxContextTokens": 1000000, "contextUsage": 0.000025, "permission": "manual", "usage": { "byModel": { "mock-model": { "inputOther": 106, "output": 15, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 106, "output": 15, "inputCacheRead": 0, "inputCacheCreation": 0 }, "currentTurn": { "inputOther": 17, "output": 8, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [emit] turn.ended                  { "turnId": 1, "reason": "completed" }"
    `);
    expect(formatHarnessSnapshot(ctx.llmInputs())).toMatchInlineSnapshot(`
      "call 1:
        system: <system-prompt>
        tools: []
        messages:
          user: text "Use auto first"
          user: text <auto-mode-enter-reminder>

      call 2:
        messages:
          user: text "Use auto first"
          assistant: text "Auto turn done."
          user: text "Back to manual""
    `);
    await ctx.expectResumeMatches();
  });

  it('does not execute rejected builtin tools and feeds the rejection back to the LLM', async () => {
    const execWithEnv = vi.fn().mockRejectedValue(new Error('Bash should not execute'));
    const bashCall: ToolCall = {
      type: 'function',
      id: 'call_bash',
      name: 'Bash',
      arguments: '{"command":"printf should-not-run","timeout":60}',
    };
    const ctx = testAgent({
      kaos: createFakeKaos({ execWithEnv }),
    });
    ctx.configure({ tools: ['Bash'] });

    ctx.mockNextResponse({ type: 'text', text: 'I will try Bash.' }, bashCall);
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Try to run Bash' }] });
    expect(formatHarnessSnapshot(await ctx.untilApproval(false))).toMatchInlineSnapshot(`
      "[wire] turn.prompt                 { "input": [ { "type": "text", "text": "Try to run Bash" } ], "origin": { "kind": "user" }, "time": "<time>" }
      [emit] turn.started                { "turnId": 0, "origin": { "kind": "user" } }
      [wire] context.append_message      { "message": { "role": "user", "content": [ { "type": "text", "text": "Try to run Bash" } ], "toolCalls": [], "origin": { "kind": "user" } }, "time": "<time>" }
      [wire] context.append_loop_event   { "event": { "type": "step.begin", "uuid": "<uuid-1>", "turnId": "0", "step": 1 }, "time": "<time>" }
      [emit] turn.step.started           { "turnId": 0, "step": 1, "stepId": "<uuid-1>" }
      [emit] assistant.delta             { "turnId": 0, "delta": "I will try Bash." }
      [emit] tool.call.delta             { "turnId": 0, "toolCallId": "call_bash", "name": "Bash", "argumentsPart": "{\\"command\\":\\"printf should-not-run\\",\\"timeout\\":60}" }
      [wire] context.append_loop_event   { "event": { "type": "content.part", "uuid": "<uuid-2>", "turnId": "0", "step": 1, "stepUuid": "<uuid-1>", "part": { "type": "text", "text": "I will try Bash." } }, "time": "<time>" }
      [emit] requestApproval             { "turnId": 0, "toolCallId": "call_bash", "toolName": "Bash", "action": "run command: printf should-not-run", "display": { "kind": "generic", "summary": "Approve Bash", "detail": { "command": "printf should-not-run", "timeout": 60 } } }"
    `);
    expect(formatHarnessSnapshot(ctx.lastLlmInput())).toMatchInlineSnapshot(`
      "system: <system-prompt>
      tools: Bash
      messages:
        user: text "Try to run Bash""
    `);

    ctx.mockNextResponse({ type: 'text', text: 'I will not run the command.' });
    expect(formatHarnessSnapshot(await ctx.untilTurnEnd())).toMatchInlineSnapshot(`
      "[wire] permission.record_approval_result   { "turnId": 0, "toolCallId": "call_bash", "toolName": "Bash", "action": "run command: printf should-not-run", "result": { "decision": "rejected", "selectedLabel": "reject" }, "time": "<time>" }
      [wire] context.append_loop_event           { "event": { "type": "tool.call", "uuid": "call_bash", "turnId": "0", "step": 1, "stepUuid": "<uuid-1>", "toolCallId": "call_bash", "name": "Bash", "args": { "command": "printf should-not-run", "timeout": 60 } }, "time": "<time>" }
      [emit] tool.call.started                   { "turnId": 0, "toolCallId": "call_bash", "name": "Bash", "args": { "command": "printf should-not-run", "timeout": 60 } }
      [wire] context.append_loop_event           { "event": { "type": "tool.result", "parentUuid": "call_bash", "toolCallId": "call_bash", "result": { "output": "Tool \\"Bash\\" was not run because the user rejected the approval request.", "isError": true } }, "time": "<time>" }
      [emit] tool.result                         { "turnId": 0, "toolCallId": "call_bash", "output": "Tool \\"Bash\\" was not run because the user rejected the approval request.", "isError": true }
      [wire] context.append_loop_event           { "event": { "type": "step.end", "uuid": "<uuid-1>", "turnId": "0", "step": 1, "usage": { "inputOther": 5, "output": 22, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "tool_use" }, "time": "<time>" }
      [emit] turn.step.completed                 { "turnId": 0, "step": 1, "stepId": "<uuid-1>", "usage": { "inputOther": 5, "output": 22, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "tool_use" }
      [wire] usage.record                        { "model": "mock-model", "usage": { "inputOther": 5, "output": 22, "inputCacheRead": 0, "inputCacheCreation": 0 }, "usageScope": "turn", "time": "<time>" }
      [emit] agent.status.updated                { "model": "mock-model", "contextTokens": 27, "maxContextTokens": 1000000, "contextUsage": 0.000027, "permission": "manual", "usage": { "byModel": { "mock-model": { "inputOther": 5, "output": 22, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 5, "output": 22, "inputCacheRead": 0, "inputCacheCreation": 0 }, "currentTurn": { "inputOther": 5, "output": 22, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [wire] context.append_loop_event           { "event": { "type": "step.begin", "uuid": "<uuid-3>", "turnId": "0", "step": 2 }, "time": "<time>" }
      [emit] turn.step.started                   { "turnId": 0, "step": 2, "stepId": "<uuid-3>" }
      [emit] assistant.delta                     { "turnId": 0, "delta": "I will not run the command." }
      [wire] context.append_loop_event           { "event": { "type": "content.part", "uuid": "<uuid-4>", "turnId": "0", "step": 2, "stepUuid": "<uuid-3>", "part": { "type": "text", "text": "I will not run the command." } }, "time": "<time>" }
      [wire] context.append_loop_event           { "event": { "type": "step.end", "uuid": "<uuid-3>", "turnId": "0", "step": 2, "usage": { "inputOther": 58, "output": 10, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }, "time": "<time>" }
      [emit] turn.step.completed                 { "turnId": 0, "step": 2, "stepId": "<uuid-3>", "usage": { "inputOther": 58, "output": 10, "inputCacheRead": 0, "inputCacheCreation": 0 }, "finishReason": "end_turn" }
      [wire] usage.record                        { "model": "mock-model", "usage": { "inputOther": 58, "output": 10, "inputCacheRead": 0, "inputCacheCreation": 0 }, "usageScope": "turn", "time": "<time>" }
      [emit] agent.status.updated                { "model": "mock-model", "contextTokens": 68, "maxContextTokens": 1000000, "contextUsage": 0.000068, "permission": "manual", "usage": { "byModel": { "mock-model": { "inputOther": 63, "output": 32, "inputCacheRead": 0, "inputCacheCreation": 0 } }, "total": { "inputOther": 63, "output": 32, "inputCacheRead": 0, "inputCacheCreation": 0 }, "currentTurn": { "inputOther": 63, "output": 32, "inputCacheRead": 0, "inputCacheCreation": 0 }, "cacheHitRate": 0 } }
      [emit] turn.ended                          { "turnId": 0, "reason": "completed" }"
    `);
    expect(execWithEnv).not.toHaveBeenCalled();
    expect(formatHarnessSnapshot(ctx.lastLlmInput())).toMatchInlineSnapshot(`
      "messages:
        <last>
        assistant: text "I will try Bash."  calls call_bash:Bash { "command": "printf should-not-run", "timeout": 60 }
        tool[call_bash]: text "<system>ERROR: Tool execution failed.</system>\\nTool \\"Bash\\" was not run because the user rejected the approval request.""
    `);
    await ctx.expectResumeMatches();
  });
});

describe('Permission auto mode', () => {
  it('tells the agent not to ask questions in auto mode', () => {
    const agent = {
      permission: { mode: 'auto' },
    } as unknown as Agent;
    const injector = new PermissionModeInjector(agent);

    const result = injector.getEphemeral();

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('system_reminder');
    expect(result[0].content).toContain('Do NOT call AskUserQuestion while auto mode is active');
    expect(result[0].position).toBe('before_user');
  });

  it('blocks AskUserQuestion in auto mode before execution', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.setMode('auto');

    await expect(
      manager.beforeToolCall(
        hookContext({
          id: 'call_question',
          toolName: 'AskUserQuestion',
          args: { questions: [] },
        }),
      ),
    ).resolves.toMatchObject({
      block: true,
      reason: expect.stringContaining(
        'AskUserQuestion is disabled while auto permission mode is active',
      ),
    });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('allows AskUserQuestion in yolo mode so it can reach question rpc', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.setMode('yolo');

    await expect(
      manager.beforeToolCall(
        hookContext({
          id: 'call_question',
          toolName: 'AskUserQuestion',
          args: { questions: [] },
        }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it.each(['auto', 'yolo'] as const)('applies deny rules before %s mode bypass', async (mode) => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.setMode(mode);
    manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'Bash',
      reason: 'blocked by test',
    });

    await expect(manager.beforeToolCall(hookContext({ id: 'call_1' }))).resolves.toMatchObject({
      block: true,
      reason: 'Tool "Bash" was denied by permission rule. Reason: blocked by test',
    });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it.each([
    ['auto', 'afk'],
    ['yolo', 'yolo'],
  ] as const)('tracks %s mode bypass as approval_mode=%s', async (mode, approvalMode) => {
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.setMode(mode);

    await expect(manager.beforeToolCall(hookContext({ id: 'call_1' }))).resolves.toBeUndefined();

    expect(requestApproval).not.toHaveBeenCalled();
    expect(telemetryTrack).toHaveBeenCalledWith('tool_approved', {
      tool_name: 'Bash',
      approval_mode: approvalMode,
    });
  });

  it.each(['auto', 'yolo'] as const)(
    'does not track approval for default-allowed tools in %s mode',
    async (mode) => {
      const { manager, requestApproval, telemetryTrack } = makePermissionManager(async () => ({
        decision: 'approved',
      }));
      manager.setMode(mode);

      await expect(
        manager.beforeToolCall(
          hookContext({
            id: 'call_read',
            toolName: 'Read',
            args: { path: '/workspace/notes.md' },
          }),
        ),
      ).resolves.toBeUndefined();

      expect(requestApproval).not.toHaveBeenCalled();
      expect(telemetryTrack).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['Write', { path: '/tmp/notes.md', content: 'x' }, 'write'],
    ['Edit', { path: '/tmp/notes.md', old_string: 'a', new_string: 'b' }, 'edit'],
  ] as const)(
    'requests approval for %s outside the workspace in yolo mode (non-auto_allow tools)',
    async (toolName, args, operation) => {
      const { manager, requestApproval } = makePermissionManager(async () => ({
        decision: 'approved',
      }));
      manager.setMode('yolo');

      await expect(
        manager.beforeToolCall(hookContext({ id: `call_${toolName}`, toolName, args })),
      ).resolves.toBeUndefined();

      expect(requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName,
          display: {
            kind: 'file_io',
            operation,
            path: args.path,
            detail: 'Outside workspace: /workspace',
          },
        }),
        expect.any(Object),
      );
    },
  );

  it.each([
    ['Read', { path: '/tmp/notes.md' }],
    ['ReadMediaFile', { path: '/tmp/image.png' }],
    ['Grep', { pattern: 'TODO', path: '/tmp' }],
  ] as const)(
    'does not request approval for auto_allow %s outside the workspace in yolo mode',
    async (toolName, args) => {
      const { manager, requestApproval } = makePermissionManager(async () => ({
        decision: 'approved',
      }));
      manager.setMode('yolo');

      await expect(
        manager.beforeToolCall(hookContext({ id: `call_${toolName}`, toolName, args })),
      ).resolves.toBeUndefined();

      expect(requestApproval).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['Read', { path: '/workspace/notes.md' }],
    ['ReadMediaFile', { path: '/workspace/image.png' }],
    ['Write', { path: '/workspace/notes.md', content: 'x' }],
    ['Edit', { path: '/workspace/notes.md', old_string: 'a', new_string: 'b' }],
    ['Grep', { pattern: 'TODO', path: '/workspace' }],
  ] as const)(
    'does not request approval for %s inside the workspace in yolo mode',
    async (toolName, args) => {
      const { manager, requestApproval } = makePermissionManager(async () => ({
        decision: 'approved',
      }));
      manager.setMode('yolo');

      await expect(
        manager.beforeToolCall(hookContext({ id: `call_${toolName}`, toolName, args })),
      ).resolves.toBeUndefined();

      expect(requestApproval).not.toHaveBeenCalled();
    },
  );

  it.each(['manual', 'auto'] as const)(
    'does not apply the outside-workspace yolo policy in %s mode',
    async (mode) => {
      const { manager, requestApproval } = makePermissionManager(async () => ({
        decision: 'approved',
      }));
      manager.setMode(mode);

      await expect(
        manager.beforeToolCall(
          hookContext({
            id: `call_read_${mode}`,
            toolName: 'Read',
            args: { path: '/tmp/notes.md' },
          }),
        ),
      ).resolves.toBeUndefined();

      expect(requestApproval).not.toHaveBeenCalled();
    },
  );

  it('keeps explicit deny rules higher priority than yolo outside-workspace approval', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.setMode('yolo');
    manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'Read',
      reason: 'reads disabled',
    });

    await expect(
      manager.beforeToolCall(
        hookContext({
          id: 'call_read_denied',
          toolName: 'Read',
          args: { path: '/tmp/notes.md' },
        }),
      ),
    ).resolves.toMatchObject({
      block: true,
      reason: 'Tool "Read" was denied by permission rule. Reason: reads disabled',
    });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('reuses approve-for-session for repeated outside-workspace writes in yolo mode', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
      scope: 'session',
      selectedLabel: 'Approve for this session',
    }));
    manager.setMode('yolo');
    const call = () =>
      manager.beforeToolCall(
        hookContext({
          id: 'call_write_session',
          toolName: 'Write',
          args: { path: '/tmp/notes.md', content: 'x' },
        }),
      );

    await expect(call()).resolves.toBeUndefined();
    await expect(call()).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(manager.data().rules).toContainEqual({
      decision: 'allow',
      scope: 'session-runtime',
      pattern: 'Write',
      reason: 'approve_for_session: write file',
    });
  });
});

describe('Permission policy chain', () => {
  it('runs custom policies after deny rules and before generic approval', async () => {
    const policy: PermissionPolicy = {
      name: 'test.block-bash',
      evaluate: vi.fn(
        async (): Promise<PermissionPolicyResult> => ({
          kind: 'result',
          result: {
            block: true,
            reason: 'blocked by custom policy',
          },
        }),
      ),
    };
    const { manager, requestApproval } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { policies: [policy] },
    );

    await expect(manager.beforeToolCall(hookContext({ id: 'call_policy' }))).resolves.toEqual({
      block: true,
      reason: 'blocked by custom policy',
    });
    expect(policy.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.any(Object),
        mode: 'manual',
        toolCallContext: expect.objectContaining({
          toolCall: expect.objectContaining({ id: 'call_policy' }),
        }),
      }),
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('keeps explicit deny rules higher priority than custom policies', async () => {
    const policy: PermissionPolicy = {
      name: 'test.allow-bash',
      evaluate: vi.fn(async (): Promise<PermissionPolicyResult> => ({ kind: 'allow' })),
    };
    const { manager, requestApproval } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { policies: [policy] },
    );
    manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'Bash',
      reason: 'blocked before policy',
    });

    await expect(manager.beforeToolCall(hookContext({ id: 'call_deny' }))).resolves.toMatchObject({
      block: true,
      reason: 'Tool "Bash" was denied by permission rule. Reason: blocked before policy',
    });
    expect(policy.evaluate).not.toHaveBeenCalled();
    expect(requestApproval).not.toHaveBeenCalled();
  });
});

describe('Permission live derive', () => {
  it('derives parent mode until the child records a local mode', () => {
    const parent = makePermissionManager(async () => ({ decision: 'approved' }));
    const child = makePermissionManager(async () => ({ decision: 'approved' }), {
      parent: parent.manager,
    });

    expect(child.manager.mode).toBe('manual');
    parent.manager.setMode('yolo');
    expect(child.manager.mode).toBe('yolo');
    expect(child.manager.data().mode).toBe('yolo');

    child.manager.setMode('manual');
    parent.manager.setMode('auto');
    expect(child.manager.mode).toBe('manual');
  });

  it('uses child matching rules before parent rules', async () => {
    const parent = makePermissionManager(async () => ({ decision: 'approved' }));
    parent.manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'Bash',
      reason: 'parent deny',
    });
    const child = makePermissionManager(async () => ({ decision: 'approved' }), {
      parent: parent.manager,
    });
    child.manager.rules.push({
      decision: 'allow',
      scope: 'session-runtime',
      pattern: 'Bash',
      reason: 'child allow',
    });

    await expect(
      child.manager.beforeToolCall(hookContext({ id: 'call_allow' })),
    ).resolves.toBeUndefined();
    expect(child.requestApproval).not.toHaveBeenCalled();

    const parentAllow = makePermissionManager(async () => ({ decision: 'approved' }));
    parentAllow.manager.rules.push({
      decision: 'allow',
      scope: 'user',
      pattern: 'Bash',
      reason: 'parent allow',
    });
    const childDeny = makePermissionManager(async () => ({ decision: 'approved' }), {
      parent: parentAllow.manager,
    });
    childDeny.manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'Bash',
      reason: 'child deny',
    });

    await expect(
      childDeny.manager.beforeToolCall(hookContext({ id: 'call_deny' })),
    ).resolves.toMatchObject({
      block: true,
      reason: 'Tool "Bash" was denied by permission rule. Reason: child deny',
    });
    expect(childDeny.requestApproval).not.toHaveBeenCalled();
  });

  it('falls back to parent rules and session approvals when no child rule matches', async () => {
    const parent = makePermissionManager(async () => ({ decision: 'approved' }));
    parent.manager.recordApprovalResult({
      turnId: 0,
      toolCallId: 'call_parent',
      toolName: 'Bash',
      action: 'run command',
      result: {
        decision: 'approved',
        scope: 'session',
        selectedLabel: 'Approve for this session',
      },
    });
    const child = makePermissionManager(async () => ({ decision: 'approved' }), {
      parent: parent.manager,
    });

    await expect(
      child.manager.beforeToolCall(hookContext({ id: 'call_child' })),
    ).resolves.toBeUndefined();

    expect(child.requestApproval).not.toHaveBeenCalled();
    expect(child.manager.rules).toEqual([]);
    expect(child.manager.data().rules).toContainEqual(sessionAllowRule());
  });

  it('uses child local mode for inherited non-deny decisions', async () => {
    const parent = makePermissionManager(async () => ({ decision: 'approved' }));
    parent.manager.setMode('yolo');
    const child = makePermissionManager(async () => ({ decision: 'approved' }), {
      parent: parent.manager,
    });

    await expect(
      child.manager.beforeToolCall(hookContext({ id: 'call_inherited_yolo' })),
    ).resolves.toBeUndefined();
    expect(child.requestApproval).not.toHaveBeenCalled();

    child.manager.setMode('manual');
    await expect(
      child.manager.beforeToolCall(hookContext({ id: 'call_local_manual' })),
    ).resolves.toBeUndefined();
    expect(child.requestApproval).toHaveBeenCalledTimes(1);
  });
});

describe('Agent-local approve for session', () => {
  it('turns approved session-scoped responses into an agent-local allow cache', async () => {
    const { manager, record, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({
        decision: 'approved',
        scope: 'session',
        selectedLabel: 'Approve for this session',
      }),
    );

    await expect(manager.beforeToolCall(hookContext({ id: 'call_1' }))).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).toHaveBeenNthCalledWith(1, 'tool_approved', {
      tool_name: 'Bash',
      approval_mode: 'manual',
      scope: 'session',
    });
    expect(record).toHaveBeenCalledWith({
      type: 'permission.record_approval_result',
      payload: {
        turnId: 0,
        toolCallId: 'call_1',
        toolName: 'Bash',
        action: 'run command: printf first',
        result: {
          decision: 'approved',
          scope: 'session',
          selectedLabel: 'Approve for this session',
        },
      },
      descriptor: expect.anything(),
    });
    // 0b（PRD-0031）：规则为精确命令模式，非裸 Bash
    expect(manager.data().rules).toContainEqual({
      decision: 'allow',
      scope: 'session-runtime',
      pattern: 'Bash(printf first)',
      reason: 'approve_for_session: run command: printf first',
    });

    // 同命令经精确规则放行
    await expect(
      manager.beforeToolCall(
        hookContext({ id: 'call_1b', args: { command: 'printf first', timeout: 60 } }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).toHaveBeenCalledTimes(1);

    // 不同命令不再被裸 Bash 放行（0b：精确规则不匹配 → 仍需审批）
    await expect(
      manager.beforeToolCall(
        hookContext({
          id: 'call_2',
          args: { command: 'printf second', timeout: 60 },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(2);
    expect(telemetryTrack).toHaveBeenNthCalledWith(2, 'tool_approved', {
      tool_name: 'Bash',
      approval_mode: 'auto_session',
      scope: 'session',
    });
  });

  it('keeps approved once responses one-shot', async () => {
    const { manager, record, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));

    await expect(manager.beforeToolCall(hookContext({ id: 'call_1' }))).resolves.toBeUndefined();
    await expect(manager.beforeToolCall(hookContext({ id: 'call_2' }))).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenNthCalledWith(1, {
      type: 'permission.record_approval_result',
      payload: {
        turnId: 0,
        toolCallId: 'call_1',
        toolName: 'Bash',
        action: 'run command: printf first',
        result: {
          decision: 'approved',
        },
      },
      descriptor: expect.anything(),
    });
    expect(record).toHaveBeenNthCalledWith(2, {
      type: 'permission.record_approval_result',
      payload: {
        turnId: 0,
        toolCallId: 'call_2',
        toolName: 'Bash',
        action: 'run command: printf first',
        result: {
          decision: 'approved',
        },
      },
      descriptor: expect.anything(),
    });
    expect(manager.data().rules).toEqual([]);
  });

  it('does not let session approval override an explicit deny rule', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.recordApprovalResult({
      turnId: 0,
      toolCallId: 'call_session',
      toolName: 'Bash',
      action: 'run command',
      result: {
        decision: 'approved',
        scope: 'session',
      },
    });
    manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'Bash',
      reason: 'blocked by test',
    });

    const result = await manager.beforeToolCall(hookContext({ id: 'call_1' }));

    expect(result).toMatchObject({
      block: true,
      reason: 'Tool "Bash" was denied by permission rule. Reason: blocked by test',
    });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('replays session approval wire events into agent permission state', () => {
    const ctx = testAgent();
    const rule = sessionAllowRule();

    ctx.dispatch({
      type: 'permission.record_approval_result',
      turnId: 0,
      toolCallId: 'call_replay',
      toolName: 'Bash',
      action: 'run command',
      result: {
        decision: 'approved',
        scope: 'session',
        selectedLabel: 'Approve for this session',
      },
    });

    expect(ctx.agent.permission.data().rules).toContainEqual(rule);
  });

  it('replays one-shot approval wire events without adding session rules', () => {
    const ctx = testAgent();
    const event = {
      type: 'permission.record_approval_result',
      turnId: 0,
      toolCallId: 'call_replay',
      toolName: 'Bash',
      action: 'run command',
      result: {
        decision: 'approved',
        selectedLabel: 'Approve once',
      },
    } as const;

    ctx.dispatch(event);

    // Phase 3：permission 走纯 reducer，approval_result 不再推 replayBuilder（TUI
    // 视为 no-op）；断言状态语义 —— one-shot 审批不进 sessionApproved、不加规则。
    expect(ctx.agent.permission.data().rules).toEqual([]);
    expect(ctx.agent.permission.data().mode).toBe('manual');
  });
});

describe('Approval telemetry', () => {
  it('tracks cancelled approval requests with approval_mode=cancelled', async () => {
    const { manager, telemetryTrack } = makePermissionManager(async () => ({
      decision: 'cancelled',
      feedback: 'request closed',
    }));

    await expect(manager.beforeToolCall(hookContext({ id: 'call_1' }))).resolves.toMatchObject({
      block: true,
      reason: expect.stringContaining('approval request was cancelled'),
    });

    expect(telemetryTrack).toHaveBeenCalledWith('tool_rejected', {
      tool_name: 'Bash',
      approval_mode: 'cancelled',
      decision: 'cancelled',
      has_feedback: true,
    });
  });
});

describe('Default git CWD Write/Edit permission', () => {
  const DIR_MODE = 0o040_755;
  const FILE_MODE = 0o100_644;
  const SYMLINK_MODE = 0o120_777;

  function statResult(mode: number): Awaited<ReturnType<Kaos['stat']>> {
    return {
      stMode: mode,
      stIno: 1,
      stDev: 1,
      stNlink: 1,
      stUid: 1000,
      stGid: 1000,
      stSize: 0,
      stAtime: 0,
      stMtime: 0,
      stCtime: 0,
    };
  }

  function notFound(path: string): Error {
    return Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' });
  }

  function sshNotFound(path: string): Error {
    const error = Object.assign(new Error(`No such file: ${path}`), { code: 2 });
    error.name = 'KaosFileNotFoundError';
    return error;
  }

  function gitKaos(
    options: {
      readonly markerPath?: string;
      readonly markerMode?: number;
      readonly statModes?: Readonly<Record<string, number>>;
      readonly readText?: Kaos['readText'];
      readonly missingError?: (path: string) => Error;
    } = {},
  ): { kaos: Kaos; stat: ReturnType<typeof vi.fn<Kaos['stat']>> } {
    const markerPath = options.markerPath ?? '/workspace/.git';
    const statModes: Readonly<Record<string, number>> = {
      '/workspace': DIR_MODE,
      '/workspace/src': DIR_MODE,
      [markerPath]: options.markerMode ?? DIR_MODE,
      ...options.statModes,
    };
    const stat = vi.fn<Kaos['stat']>().mockImplementation(async (path) => {
      const mode = statModes[path];
      if (mode !== undefined) return statResult(mode);
      throw options.missingError?.(path) ?? notFound(path);
    });
    return {
      kaos: createFakeKaos({ stat, readText: options.readText }),
      stat,
    };
  }

  function nonGitKaos(): Kaos {
    return createFakeKaos({
      stat: vi.fn<Kaos['stat']>().mockRejectedValue(new Error('ENOENT')),
    });
  }

  function writeHook(args: Record<string, unknown>, id = 'call_write'): ToolExecutionHookContext {
    return hookContext({ id, toolName: 'Write', args });
  }

  function editHook(args: Record<string, unknown>, id = 'call_edit'): ToolExecutionHookContext {
    return hookContext({ id, toolName: 'Edit', args });
  }

  it('still requests approval for Bash inside a git cwd in manual mode', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(hookContext({ id: 'call_bash_git_cwd' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'Bash',
        action: 'run command: printf first',
      }),
      expect.any(Object),
    );
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('bypasses approval for Write to a relative path inside a git cwd', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).not.toHaveBeenCalled();
    expect(telemetryTrack).toHaveBeenCalledWith('tool_approved', {
      tool_name: 'Write',
      approval_mode: 'manual',
      auto_reason: 'default_git_cwd_write',
    });
  });

  it('bypasses approval for Edit on an absolute path inside the git cwd', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(
        editHook({ path: '/workspace/src/a.ts', old_string: 'A', new_string: 'B' }),
      ),
    ).resolves.toBeUndefined();

    expect(requestApproval).not.toHaveBeenCalled();
    expect(telemetryTrack).toHaveBeenCalledWith('tool_approved', {
      tool_name: 'Edit',
      approval_mode: 'manual',
      auto_reason: 'default_git_cwd_write',
    });
  });

  it('still requests approval when cwd is not inside a git work tree', async () => {
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos: nonGitKaos() },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('still requests approval when a relative path escapes cwd via ..', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: '../outside.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
  });

  it('still requests approval for an absolute path outside the cwd', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: '/tmp/outside.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
  });

  it('still requests approval for a path inside the git root but outside the cwd', async () => {
    const { kaos } = gitKaos({ markerPath: '/a/.git' });
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { cwd: '/a/b/c', kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: '/a/x.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it.each(['.git/config', '.git/hooks/pre-commit'])(
    'still requests approval for git control file %s',
    async (path) => {
      const { kaos } = gitKaos();
      const { manager, requestApproval, telemetryTrack } = makePermissionManager(
        async () => ({ decision: 'approved' }),
        { kaos },
      );

      await expect(
        manager.beforeToolCall(writeHook({ path, content: 'x' })),
      ).resolves.toBeUndefined();

      expect(requestApproval).toHaveBeenCalledTimes(1);
      expect(telemetryTrack).not.toHaveBeenCalledWith(
        'tool_approved',
        expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
      );
    },
  );

  it('still requests approval for case-variant git control files', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: '.GIT/config', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('still requests approval for a linked-worktree gitdir inside cwd', async () => {
    const { kaos } = gitKaos({
      markerMode: FILE_MODE,
      statModes: { '/workspace/.gitdir': DIR_MODE },
      readText: vi.fn<Kaos['readText']>(async (path) => {
        if (path === '/workspace/.git') return 'gitdir: .gitdir\n';
        throw notFound(path);
      }),
    });
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: '/workspace/.gitdir/config', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('still requests approval when a parent path segment is a symlink', async () => {
    const { kaos } = gitKaos({
      statModes: { '/workspace/out': SYMLINK_MODE },
    });
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: 'out/hosts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('still requests approval when the target file is a symlink', async () => {
    const { kaos } = gitKaos({
      statModes: { '/workspace/link.txt': SYMLINK_MODE },
    });
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: 'link.txt', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('still requests approval for a sensitive file inside the git cwd', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: '.env', content: 'SECRET=1' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
  });

  it.each(['.ENV', '.Aws/credentials'])(
    'still requests approval for case-variant sensitive file %s',
    async (path) => {
      const { kaos } = gitKaos({
        statModes: path.includes('/') ? { '/workspace/.Aws': DIR_MODE } : {},
      });
      const { manager, requestApproval, telemetryTrack } = makePermissionManager(
        async () => ({ decision: 'approved' }),
        { kaos },
      );

      await expect(
        manager.beforeToolCall(writeHook({ path, content: 'secret' })),
      ).resolves.toBeUndefined();

      expect(requestApproval).toHaveBeenCalledTimes(1);
      expect(telemetryTrack).not.toHaveBeenCalledWith(
        'tool_approved',
        expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
      );
    },
  );

  it('bypasses approval for new files when SSH Kaos reports numeric no-such-file', async () => {
    const { kaos } = gitKaos({ missingError: sshNotFound });
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/new.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).not.toHaveBeenCalled();
    expect(telemetryTrack).toHaveBeenCalledWith('tool_approved', {
      tool_name: 'Write',
      approval_mode: 'manual',
      auto_reason: 'default_git_cwd_write',
    });
  });

  it('lets an explicit `ask` rule keep the approval prompt for Write', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );
    manager.rules.push({
      decision: 'ask',
      scope: 'user',
      pattern: 'Write',
      reason: 'user requested manual confirmation',
    });

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('lets an explicit `allow` rule take the original allow path without auto_reason telemetry', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );
    manager.rules.push({
      decision: 'allow',
      scope: 'user',
      pattern: 'Write',
    });

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).not.toHaveBeenCalled();
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('keeps explicit `deny` rules higher priority than the bypass', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );
    manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'Write',
      reason: 'no writes here',
    });

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' })),
    ).resolves.toMatchObject({
      block: true,
      reason: expect.stringContaining('no writes here'),
    });

    expect(requestApproval).not.toHaveBeenCalled();
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('does not fire in auto mode — existing afk telemetry path takes over', async () => {
    const { kaos } = gitKaos();
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );
    manager.setMode('auto');

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).not.toHaveBeenCalled();
    expect(telemetryTrack).toHaveBeenCalledWith('tool_approved', {
      tool_name: 'Write',
      approval_mode: 'afk',
    });
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('does not fire on Windows path semantics (Windows stMode unverified)', async () => {
    const stat = vi
      .fn<Kaos['stat']>()
      .mockImplementation(async (path) =>
        path === '/workspace/.git' ? statResult(0o040_755) : Promise.reject(new Error('ENOENT')),
      );
    const kaos = createFakeKaos({ stat, pathClass: () => 'win32' });
    const { manager, requestApproval, telemetryTrack } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' })),
    ).resolves.toBeUndefined();

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(telemetryTrack).not.toHaveBeenCalledWith(
      'tool_approved',
      expect.objectContaining({ auto_reason: 'default_git_cwd_write' }),
    );
  });

  it('caches the git marker check across repeated Write/Edit calls in the same cwd', async () => {
    const { kaos, stat } = gitKaos();
    const { manager, requestApproval } = makePermissionManager(
      async () => ({ decision: 'approved' }),
      { kaos },
    );

    await expect(
      manager.beforeToolCall(writeHook({ path: 'src/a.ts', content: 'x' }, 'call_1')),
    ).resolves.toBeUndefined();
    await expect(
      manager.beforeToolCall(
        editHook({ path: 'src/b.ts', old_string: 'A', new_string: 'B' }, 'call_2'),
      ),
    ).resolves.toBeUndefined();

    expect(requestApproval).not.toHaveBeenCalled();
    const markerCalls = stat.mock.calls.filter(([path]) => path === '/workspace/.git');
    expect(markerCalls).toHaveLength(1);
  });
});

describe('敏感文件读 = 审批事件（#298）', () => {
  it('manual：Read .env → ask（action payload-scoped，含路径）', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    await manager.beforeToolCall(
      hookContext({ id: 'c1', toolName: 'Read', args: { path: '/workspace/.env' } }),
    );
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'read sensitive file: /workspace/.env' }),
      expect.anything(),
    );
  });

  it('manual：Read 敏感读批准后同路径会话内免问（payload-scoped 缓存）', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
      scope: 'session',
    }));
    await manager.beforeToolCall(
      hookContext({ id: 'c1', toolName: 'Read', args: { path: '/workspace/.env' } }),
    );
    expect(requestApproval).toHaveBeenCalledTimes(1);
    // 同路径再次 → sessionApprovedActions 命中，不再问
    await manager.beforeToolCall(
      hookContext({ id: 'c2', toolName: 'Read', args: { path: '/workspace/.env' } }),
    );
    expect(requestApproval).toHaveBeenCalledTimes(1);
    // 不同路径 → 仍问
    await manager.beforeToolCall(
      hookContext({ id: 'c3', toolName: 'Read', args: { path: '/workspace/.env.local' } }),
    );
    expect(requestApproval).toHaveBeenCalledTimes(2);
    // 不生成宽泛 PermissionRule（payload-scoped）
    expect(manager.data().rules).toEqual([]);
  });

  it('manual：Bash cat .env → ask（命令解析出的读路径）', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    await manager.beforeToolCall(hookContext({ id: 'c1', args: { command: 'cat .env' } }));
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'read sensitive file: .env' }),
      expect.anything(),
    );
  });

  it('manual：豁免与不匹配不触发敏感 ask（Bash/Write 默认 ask 为既有行为）', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    // .env.example 豁免（Read auto_allow，策略不拦 → 无任何 ask）
    await manager.beforeToolCall(
      hookContext({ id: 'c1', toolName: 'Read', args: { path: '/workspace/.env.example' } }),
    );
    // 普通文件
    await manager.beforeToolCall(
      hookContext({ id: 'c2', toolName: 'Read', args: { path: '/workspace/foo.txt' } }),
    );
    // Bash 非敏感命令 / 无路径命令（有 Bash 默认 ask，但非敏感 action）
    await manager.beforeToolCall(hookContext({ id: 'c3', args: { command: 'cat foo.txt' } }));
    await manager.beforeToolCall(hookContext({ id: 'c4', args: { command: 'git status' } }));
    // Write（写由工具层硬拒，策略不拦——有 Write 默认 ask，但非敏感 action）
    await manager.beforeToolCall(
      hookContext({ id: 'c5', toolName: 'Write', args: { path: '/workspace/.env' } }),
    );
    const sensitiveCalls = requestApproval.mock.calls.filter((call) =>
      String((call[0] as { action?: string }).action).startsWith('read sensitive file: '),
    );
    expect(sensitiveCalls).toHaveLength(0);
  });

  it('yolo：敏感读仍强制 ask（kimi-code 先例，yolo 不放行敏感读）', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.setMode('yolo');
    await manager.beforeToolCall(
      hookContext({ id: 'c1', toolName: 'Read', args: { path: '/workspace/.env' } }),
    );
    expect(requestApproval).toHaveBeenCalledTimes(1);
  });

  it('auto（AFK 信任模型）：敏感读不拦', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.setMode('auto');
    await manager.beforeToolCall(
      hookContext({ id: 'c1', toolName: 'Read', args: { path: '/workspace/.env' } }),
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('actionToRulePattern 对敏感读 action 返回 undefined（不生成宽泛规则）', () => {
    expect(actionToRulePattern('read sensitive file: /workspace/.env', 'Read')).toBeUndefined();
  });
});

describe('Permission rule helpers', () => {
  it('parses permission patterns used by rule matching', () => {
    expect(parsePattern('Write')).toEqual({ toolName: 'Write' });
    expect(parsePattern('Read(/etc/**)')).toEqual({
      toolName: 'Read',
      argPattern: '/etc/**',
    });
    expect(parsePattern('Edit(!./src/**)')).toEqual({
      toolName: 'Edit',
      argPattern: '!./src/**',
    });
    expect(parsePattern('  mcp__github__*  ')).toEqual({ toolName: 'mcp__github__*' });
    expect(parsePattern('Read()')).toEqual({ toolName: 'Read' });
    expect(() => parsePattern('Read(/etc/**')).toThrow(/missing closing paren/);
    expect(() => parsePattern('')).toThrow(/empty string/);
  });

  it('matches rules against the tool-specific argument fields', () => {
    expect(matchesRule(permissionRule('Bash(git *)'), 'Bash', { command: 'git status' })).toBe(
      true,
    );
    expect(matchesRule(permissionRule('Bash(git *)'), 'Bash', { command: 'npm test' })).toBe(false);
    expect(matchesRule(permissionRule('Read(/etc/**)'), 'Read', { path: '/etc/passwd' })).toBe(
      true,
    );
    expect(
      matchesRule(permissionRule('Edit(!./src/**)', 'deny'), 'Edit', { path: './tests/foo.ts' }),
    ).toBe(true);
    expect(
      matchesRule(permissionRule('Edit(!./src/**)', 'deny'), 'Edit', { path: './src/foo.ts' }),
    ).toBe(false);
    expect(
      matchesRule(permissionRule('Agent(review-*)'), 'Agent', { subagent_type: 'review-code' }),
    ).toBe(true);
    expect(matchesRule(permissionRule('mcp__github__*'), 'mcp__github__list_issues', {})).toBe(
      true,
    );
    expect(matchesRule(permissionRule('Bash(git *)'), 'Bash', { command: 42 })).toBe(false);
    expect(matchesRule(permissionRule('Bad(unclosed'), 'Bad', {})).toBe(false);
  });

  it('2a（PRD-0031）：Resource(op:glob) 规则与调度层共享 (operation, path) 抽象', () => {
    // Bash 经命令解析提取资源（cat .env → read:.env）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:**/.env*)', 'deny')],
        'Bash',
        { command: 'cat .env' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
    // 复合命令同样命中（逐子命令解析）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:**/.env*)', 'deny')],
        'Bash',
        { command: 'echo hi; cat .env' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
    // 文件工具共享同一抽象：Write 的 path 就是资源
    expect(
      checkMatchingRules(
        [permissionRule('Resource(write:**/.env*)', 'deny')],
        'Write',
        { path: '.env' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
    expect(
      checkMatchingRules(
        [permissionRule('Resource(write:**/*.env)', 'deny')],
        'Edit',
        { path: 'src/x.env' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
    // 路径 glob（** 跨目录）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:**/credentials*)', 'deny')],
        'Read',
        { path: '/x/credentials.json' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
    // 搜索资源
    expect(
      checkMatchingRules(
        [permissionRule('Resource(search:**/src/**)', 'deny')],
        'Grep',
        { pattern: 'src/foo.ts' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
  });

  it('2a（PRD-0031）：Resource 规则不匹配时行为不变；无资源可提取时不生效', () => {
    // 不匹配的路径 → 无规则命中 → 默认表
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:**/.env*)', 'deny')],
        'Bash',
        { command: 'cat foo.txt' },
        'manual',
      ),
    ).toBeUndefined();
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:**/.env*)', 'deny')],
        'Read',
        { path: 'foo.txt' },
        'manual',
      ),
    ).toBeUndefined();
    // 点文件 glob 语义：`*.env` 不匹配 `.env`（与 shell 一致）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:*.env)', 'deny')],
        'Bash',
        { command: 'cat .env' },
        'manual',
      ),
    ).toBeUndefined();
    // broad（bun test 无具体路径）与 indirect（eval）无资源可提取 → 规则不生效
    // （已知局限：无法静态解析时资源规则无法匹配）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:*)', 'deny')],
        'Bash',
        { command: 'bun test' },
        'manual',
      ),
    ).toBeUndefined();
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:*)', 'deny')],
        'Bash',
        { command: 'eval "$CMD"' },
        'manual',
      ),
    ).toBeUndefined();
    // 裸 Resource 无语义 → 不匹配
    expect(
      checkMatchingRules(
        [permissionRule('Resource', 'deny')],
        'Bash',
        { command: 'cat .env' },
        'manual',
      ),
    ).toBeUndefined();
    // 畸形 op/glob → 不匹配（规则保持 total）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(write:)', 'deny')],
        'Write',
        { path: '.env' },
        'manual',
      ),
    ).toBeUndefined();
  });

  it('2a（PRD-0031）：Resource 规则遵循 deny 优先与模式覆盖', () => {
    // yolo 模式下 deny 仍生效（deny wins in every mode）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:**/.env*)', 'deny')],
        'Bash',
        { command: 'cat .env' },
        'yolo',
      ),
    ).toMatchObject({ decision: 'deny' });
    // yolo 下 allow 被模式覆盖（非 deny → allow）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:**/.env*)', 'allow')],
        'Bash',
        { command: 'cat .env' },
        'yolo',
      ),
    ).toMatchObject({ decision: 'allow' });
    // allow + deny 并存：deny 优先
    expect(
      checkMatchingRules(
        [
          permissionRule('Resource(read:**/.env*)', 'allow'),
          permissionRule('Resource(read:**/.env*)', 'deny'),
        ],
        'Bash',
        { command: 'cat .env' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
  });

  it('2a（PRD-0031）：Resource 规则 ! 否定——无资源命中时生效', () => {
    // `!` 否定：无资源命中 `read:*.env` 才生效
    expect(
      checkMatchingRules(
        [permissionRule('Resource(!read:**/.env*)', 'deny')],
        'Bash',
        { command: 'cat foo.txt' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
    expect(
      checkMatchingRules(
        [permissionRule('Resource(!read:**/.env*)', 'deny')],
        'Bash',
        { command: 'cat .env' },
        'manual',
      ),
    ).toBeUndefined();
  });

  it('2a review 修复：Resource 规则跟踪 cd 累计 cwd（目录作用域不可被 cd 绕过）', () => {
    const pathOptions = { cwd: '/workspace', pathClass: 'posix' as const };
    // cd src && cat foo.txt → 读的是 /workspace/src/foo.txt
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:/workspace/src/**)', 'deny')],
        'Bash',
        { command: 'cd src && cat foo.txt' },
        'manual',
        pathOptions,
      ),
    ).toMatchObject({ decision: 'deny' });
    // 无 cd 时 foo.txt 是 /workspace/foo.txt → 不命中
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:/workspace/src/**)', 'deny')],
        'Bash',
        { command: 'cat foo.txt' },
        'manual',
        pathOptions,
      ),
    ).toBeUndefined();
    // cd src/.. 回到 /workspace：foo.txt 解析为 /workspace/foo.txt（`..` 归一化）
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:/workspace/foo.txt)', 'deny')],
        'Bash',
        { command: 'cd src/.. && cat foo.txt' },
        'manual',
        pathOptions,
      ),
    ).toMatchObject({ decision: 'deny' });
    // 规则为 /workspace/src/** 时不命中（文件在 /workspace 下）→ 默认 ask，非 deny
    expect(
      checkMatchingRules(
        [permissionRule('Resource(read:/workspace/src/**)', 'deny')],
        'Bash',
        { command: 'cd src/.. && cat foo.txt' },
        'manual',
        pathOptions,
      ),
    ).toMatchObject({ decision: 'ask' });
  });

  it('matches path rules against lexical variants of the same absolute file', () => {
    const secret = '/workspace/project/secret.txt';
    const rule = permissionRule(`Read(${secret})`, 'deny');

    expect(matchesRule(rule, 'Read', { path: secret })).toBe(true);
    expect(matchesRule(rule, 'Read', { path: '/workspace/project/./secret.txt' })).toBe(true);
    expect(matchesRule(rule, 'Read', { path: '/workspace/project/tmp/../secret.txt' })).toBe(true);
    expect(matchesRule(rule, 'Read', { path: '/workspace/project/SECRET.txt' })).toBe(true);
    expect(
      matchesRule(permissionRule(`Read(${secret})`, 'allow'), 'Read', {
        path: '/workspace/project/SECRET.txt',
      }),
    ).toBe(false);
  });

  it('matches path rules against relative tool paths using the active cwd', () => {
    expect(
      checkMatchingRules(
        [permissionRule('Read(/workspace/project/secret.txt)', 'deny')],
        'Read',
        { path: './secret.txt' },
        'manual',
        { cwd: '/workspace/project', pathClass: 'posix' },
      ),
    ).toMatchObject({ decision: 'deny' });
  });

  it('matches win32 path rules across separators, dot segments, and case variants', () => {
    const secret = 'C:\\workspace\\project\\secret.txt';
    const denyRule = permissionRule(`Read(${secret})`, 'deny');
    const allowRule = permissionRule(`Read(${secret})`, 'allow');
    const context = { pathClass: 'win32' as const };

    expect(
      matchesRule(denyRule, 'Read', { path: 'C:\\workspace\\project\\.\\secret.txt' }, context),
    ).toBe(true);
    expect(
      matchesRule(
        denyRule,
        'Read',
        { path: 'C:\\workspace\\project\\tmp\\..\\SECRET.txt' },
        context,
      ),
    ).toBe(true);
    expect(
      matchesRule(denyRule, 'Read', { path: 'C:/workspace/project/secret.txt' }, context),
    ).toBe(true);
    expect(
      matchesRule(denyRule, 'Read', { path: 'C:/workspace\\project/tmp\\..\\SECRET.txt' }, context),
    ).toBe(true);
    expect(
      matchesRule(allowRule, 'Read', { path: 'C:\\workspace\\project\\SECRET.txt' }, context),
    ).toBe(true);
  });

  it('matches win32 path rules against relative tool paths using the active cwd', () => {
    expect(
      checkMatchingRules(
        [permissionRule('Read(C:\\workspace\\project\\secret.txt)', 'deny')],
        'Read',
        { path: '.\\SECRET.txt' },
        'manual',
        { cwd: 'C:\\workspace\\project', pathClass: 'win32' },
      ),
    ).toMatchObject({ decision: 'deny' });
  });

  it('applies explicit rule priority and mode overlay in order', () => {
    expect(checkMatchingRules([], 'Write', { path: '/tmp/a' }, 'manual')).toBeUndefined();
    expect(
      checkMatchingRules([permissionRule('Write', 'allow')], 'Write', { path: '/tmp/a' }, 'manual'),
    ).toMatchObject({
      decision: 'allow',
    });
    expect(
      checkMatchingRules(
        [permissionRule('Write', 'allow'), permissionRule('Write', 'ask')],
        'Write',
        {},
        'manual',
      ),
    ).toMatchObject({ decision: 'ask' });
    expect(
      checkMatchingRules(
        [permissionRule('Write', 'allow'), permissionRule('Write', 'deny')],
        'Write',
        {},
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
    expect(
      checkMatchingRules([permissionRule('Write', 'ask')], 'Write', { path: '/tmp/a' }, 'yolo'),
    ).toMatchObject({
      decision: 'allow',
    });
    expect(
      checkMatchingRules([permissionRule('Write', 'deny')], 'Write', { path: '/tmp/a' }, 'yolo'),
    ).toMatchObject({
      decision: 'deny',
    });
  });

  it('Bash 逐子命令匹配（PRD-0031 grill Q1）：复合命令中的 deny 不再被整串匹配绕过', () => {
    // 旧行为：`Bash(rm *)` deny 对 `echo hi; rm x` 整串不匹配 → rm 逃逸。
    // 新行为：`rm x` 是独立子命令 → 命中 deny → 整条 deny。
    expect(
      checkMatchingRules(
        [permissionRule('Bash(rm *)', 'deny')],
        'Bash',
        { command: 'echo hi; rm x' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
  });

  it('Bash 逐子命令匹配：任一子命令 ask（无 deny）→ 整条 ask', () => {
    // `git status` 命中 allow，`echo hi` 无规则命中 → manual 默认 ask
    expect(
      checkMatchingRules(
        [permissionRule('Bash(git *)', 'allow')],
        'Bash',
        { command: 'git status; echo hi' },
        'manual',
      ),
    ).toMatchObject({ decision: 'ask' });
  });

  it('Bash 逐子命令匹配：全部子命令命中 allow → allow', () => {
    expect(
      checkMatchingRules(
        [permissionRule('Bash(git *)', 'allow')],
        'Bash',
        { command: 'git status; git log' },
        'manual',
      ),
    ).toMatchObject({ decision: 'allow' });
  });

  it('Bash 逐子命令匹配：! 否定语义从整串不匹配变为无子命令匹配', () => {
    // `Bash(!rm *)` allow（放行非 rm 命令）：`echo hi; rm x` 含 rm 子命令 →
    // 不再整串放行（修掉绕过：旧行为整串不匹配 `rm *` → 取反 → 整条放行）
    expect(
      checkMatchingRules(
        [permissionRule('Bash(!rm *)', 'allow')],
        'Bash',
        { command: 'echo hi; rm x' },
        'manual',
      ),
    ).toMatchObject({ decision: 'ask' });
    // 纯非 rm 命令仍放行
    expect(
      checkMatchingRules(
        [permissionRule('Bash(!rm *)', 'allow')],
        'Bash',
        { command: 'echo hi' },
        'manual',
      ),
    ).toMatchObject({ decision: 'allow' });
  });

  it('Bash 逐子命令匹配：单子命令命令与旧行为一致（零回归）', () => {
    expect(
      checkMatchingRules(
        [permissionRule('Bash(git *)', 'allow')],
        'Bash',
        { command: 'git status' },
        'manual',
      ),
    ).toMatchObject({ decision: 'allow' });
    expect(
      checkMatchingRules(
        [permissionRule('Bash(git *)', 'allow')],
        'Bash',
        { command: 'npm test' },
        'manual',
      ),
    ).toBeUndefined();
    expect(
      checkMatchingRules(
        [permissionRule('Bash(rm *)', 'deny')],
        'Bash',
        { command: 'rm x' },
        'manual',
      ),
    ).toMatchObject({ decision: 'deny' });
  });

  it('Bash 逐子命令匹配：yolo 模式覆盖仍有效', () => {
    expect(
      checkMatchingRules(
        [permissionRule('Bash(git *)', 'allow')],
        'Bash',
        { command: 'git status; echo hi' },
        'yolo',
      ),
    ).toMatchObject({ decision: 'allow' });
    expect(
      checkMatchingRules(
        [permissionRule('Bash(rm *)', 'deny')],
        'Bash',
        { command: 'echo hi; rm x' },
        'yolo',
      ),
    ).toMatchObject({ decision: 'deny' });
  });

  it('Bash 逐子命令匹配：bash -c 剥壳后按内层叶节点匹配', () => {
    expect(
      checkMatchingRules(
        [permissionRule('Bash(git *)', 'allow')],
        'Bash',
        { command: 'bash -c "git status && git log"' },
        'manual',
      ),
    ).toMatchObject({ decision: 'allow' });
  });

  it('derives approval action labels from display semantics and MCP names', () => {
    // 0b（PRD-0031）：Bash 命令标签携带命令信息（构建类→前缀，其余→精确）
    expect(describeApprovalAction('Bash', {}, { kind: 'command', command: 'git status' })).toBe(
      'run command: git status',
    );
    expect(
      describeApprovalAction(
        'Bash',
        { command: 'git push origin main' },
        { kind: 'generic', summary: 'Approve Bash', detail: {} },
      ),
    ).toBe('run command: git push');
    expect(
      describeApprovalAction(
        'Bash',
        { command: 'curl https://x.com' },
        { kind: 'generic', summary: 'Approve Bash', detail: {} },
      ),
    ).toBe('run command: curl https://x.com');
    expect(
      describeApprovalAction('Write', {}, { kind: 'file_io', operation: 'write', path: 'x' }),
    ).toBe('write file');
    expect(
      describeApprovalAction(
        'Agent',
        {},
        { kind: 'agent_call', agent_name: 'review', prompt: 'x' },
      ),
    ).toBe('spawn agent');
    expect(describeApprovalAction('Skill', {}, { kind: 'skill_call', skill_name: 'commit' })).toBe(
      'invoke skill',
    );
    expect(describeApprovalAction('mcp__files__get_files', {}, genericDisplay())).toBe(
      'call MCP tool: files:get_files',
    );
    expect(actionToRulePattern('edit file outside of working directory', 'Edit')).toBe('Write');
    expect(actionToRulePattern('call CustomTool', 'CustomTool')).toBe('CustomTool');
  });

  it('0b（PRD-0031 grill Q3）：approve-for-session 生成 per-prefix/精确规则而非裸 Bash', () => {
    // 构建类动词 → 前 2 token 前缀规则
    expect(actionToRulePattern('run command: git push', 'Bash')).toBe('Bash(git push*)');
    expect(actionToRulePattern('run command: git status', 'Bash')).toBe('Bash(git status*)');
    expect(actionToRulePattern('run command: bun test', 'Bash')).toBe('Bash(bun test*)');
    expect(actionToRulePattern('run command: make', 'Bash')).toBe('Bash(make*)');
    // 网络/破坏/解释器/未知 → 精确匹配（payload-scoped）
    expect(actionToRulePattern('run command: curl https://x.com', 'Bash')).toBe(
      'Bash(curl https://x.com)',
    );
    expect(actionToRulePattern('run command: rm -rf dist', 'Bash')).toBe('Bash(rm -rf dist)');
    expect(actionToRulePattern('run command: python -c "print(1)"', 'Bash')).toBe(
      'Bash(python -c "print(1)")',
    );
    // 空命令回退工具名
    expect(actionToRulePattern('run command: ', 'Bash')).toBe('Bash');
    // CronCreate 负载作用域不变
    expect(actionToRulePattern('call CronCreate {}', 'CronCreate')).toBeUndefined();
  });

  it('0b 会话批准端到端：git status 放行 git status --short，git log 仍需审批', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
      scope: 'session',
    }));
    manager.recordApprovalResult({
      turnId: 0,
      toolCallId: 'call_1',
      toolName: 'Bash',
      action: 'run command: git status',
      result: { decision: 'approved', scope: 'session' },
    });

    // 规则为 per-prefix，非裸 Bash
    expect(manager.data().rules).toContainEqual({
      decision: 'allow',
      scope: 'session-runtime',
      pattern: 'Bash(git status*)',
      reason: 'approve_for_session: run command: git status',
    });
    // git status --short 经规则放行（无审批请求）
    await expect(
      manager.beforeToolCall(
        hookContext({
          id: 'call_status_short',
          args: { command: 'git status --short', timeout: 60 },
        }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).not.toHaveBeenCalled();
    // git log 不匹配规则 → 仍需审批
    await expect(
      manager.beforeToolCall(
        hookContext({ id: 'call_log', args: { command: 'git log', timeout: 60 } }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'run command: git log' }),
      expect.anything(),
    );
  });

  it('0b 会话批准端到端：curl 精确规则——其他 URL 仍需审批', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
      scope: 'session',
    }));
    manager.recordApprovalResult({
      turnId: 0,
      toolCallId: 'call_1',
      toolName: 'Bash',
      action: 'run command: curl https://x.com',
      result: { decision: 'approved', scope: 'session' },
    });
    expect(manager.data().rules).toContainEqual({
      decision: 'allow',
      scope: 'session-runtime',
      pattern: 'Bash(curl https://x.com)',
      reason: 'approve_for_session: run command: curl https://x.com',
    });
    await expect(
      manager.beforeToolCall(
        hookContext({ id: 'call_same', args: { command: 'curl https://x.com', timeout: 60 } }),
      ),
    ).resolves.toBeUndefined();
    // 其他 URL 不匹配精确规则 → 仍需审批
    await expect(
      manager.beforeToolCall(
        hookContext({ id: 'call_other', args: { command: 'curl https://y.com', timeout: 60 } }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'run command: curl https://y.com' }),
      expect.anything(),
    );
  });

  it('scopes CronCreate session approval to the full create payload (PRD-0023 #244)', () => {
    // Without payload encoding, every CronCreate would share action
    // `call CronCreate` and a broad rule pattern `CronCreate` — one
    // scope:session approval would auto-authorize any future schedule.
    const payloadA = { cron: '*/5 * * * *', prompt: 'A', recurring: true };
    const payloadB = { cron: '*/5 * * * *', prompt: 'B', recurring: true };
    const payloadSameA = { cron: '*/5 * * * *', prompt: 'A', recurring: true };
    const payloadDifferentCron = { cron: '0 9 * * *', prompt: 'A', recurring: true };

    const actionA = describeApprovalAction('CronCreate', payloadA, genericDisplay());
    const actionB = describeApprovalAction('CronCreate', payloadB, genericDisplay());
    const actionSameA = describeApprovalAction('CronCreate', payloadSameA, genericDisplay());
    const actionDiffCron = describeApprovalAction(
      'CronCreate',
      payloadDifferentCron,
      genericDisplay(),
    );

    expect(actionA).not.toBe(actionB);
    expect(actionA).not.toBe(actionDiffCron);
    expect(actionA).toBe(actionSameA);
    expect(actionA.startsWith('call CronCreate ')).toBe(true);
    expect(actionA).toContain('"prompt":"A"');

    // Must NOT create a bare CronCreate PermissionRule (would match all creates).
    expect(actionToRulePattern(actionA, 'CronCreate')).toBeUndefined();
    // Non-payload tools still get a name fallback rule.
    expect(actionToRulePattern('call CustomTool', 'CustomTool')).toBe('CustomTool');
  });

  it('denies CronCreate when an explicit deny rule matches (permission reject path)', async () => {
    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
    }));
    manager.rules.push({
      decision: 'deny',
      scope: 'user',
      pattern: 'CronCreate',
      reason: 'cron disabled by policy',
    });
    await expect(
      manager.beforeToolCall(
        hookContext({
          id: 'call_cron',
          toolName: 'CronCreate',
          args: { cron: '* * * * *', prompt: 'x', recurring: true },
        }),
      ),
    ).resolves.toMatchObject({
      block: true,
      reason: 'Tool "CronCreate" was denied by permission rule. Reason: cron disabled by policy',
    });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('session-approving CronCreate payload A does not auto-approve payload B (PRD-0023 #244)', async () => {
    // Integration through PermissionManager: approve_for_session on one
    // create payload must not unlock a different (cron, prompt, recurring) tuple.
    const payloadA = { cron: '*/5 * * * *', prompt: 'A', recurring: true };
    const payloadB = { cron: '*/5 * * * *', prompt: 'B', recurring: true };
    const actionA = describeApprovalAction('CronCreate', payloadA, genericDisplay());

    const { manager, requestApproval } = makePermissionManager(async () => ({
      decision: 'approved',
      scope: 'session',
      selectedLabel: 'Approve for this session',
    }));

    // First create with payload A → asks once, records session approval for A only.
    await expect(
      manager.beforeToolCall(
        hookContext({ id: 'call_a1', toolName: 'CronCreate', args: payloadA }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval.mock.calls[0]![0]).toMatchObject({
      toolName: 'CronCreate',
      action: actionA,
    });
    // No bare CronCreate allow rule (would match every payload).
    expect(manager.data().rules.some((r) => r.pattern === 'CronCreate')).toBe(false);

    // Same payload A again → sessionApprovedActions auto-allows without a new prompt.
    await expect(
      manager.beforeToolCall(
        hookContext({ id: 'call_a2', toolName: 'CronCreate', args: payloadA }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).toHaveBeenCalledTimes(1);

    // Different payload B → must ask again (not auto-approved by A's session grant).
    await expect(
      manager.beforeToolCall(
        hookContext({ id: 'call_b1', toolName: 'CronCreate', args: payloadB }),
      ),
    ).resolves.toBeUndefined();
    expect(requestApproval).toHaveBeenCalledTimes(2);
    expect(requestApproval.mock.calls[1]![0]).toMatchObject({
      toolName: 'CronCreate',
      action: describeApprovalAction('CronCreate', payloadB, genericDisplay()),
    });
  });
});

function bashCall(): ToolCall {
  return {
    type: 'function',
    id: 'call_bash',
    name: 'Bash',
    arguments: '{"command":"printf permission-output","timeout":60}',
  };
}

function makePermissionManager(
  handleApproval: (request: unknown) => Promise<ApprovalResponse>,
  options: {
    readonly policies?: readonly PermissionPolicy[];
    readonly parent?: PermissionManager;
    readonly kaos?: Kaos;
    readonly cwd?: string;
  } = {},
): {
  manager: PermissionManager;
  record: ReturnType<typeof vi.fn>;
  requestApproval: ReturnType<typeof vi.fn>;
  telemetryTrack: ReturnType<typeof vi.fn>;
} {
  let manager!: PermissionManager;
  const requestApproval = vi.fn(handleApproval);
  const record = vi.fn();
  const telemetryTrack = vi.fn();
  const agent = {
    type: 'main',
    config: { cwd: options.cwd ?? '/workspace' },
    runtime: { kaos: options.kaos ?? createFakeKaos() },
    emitStatusUpdated: vi.fn(),
    wire: { dispatch: record },
    replayBuilder: { push: vi.fn() },
    rpc: { requestApproval },
    telemetry: { track: telemetryTrack },
  } as unknown as Agent;
  manager = new PermissionManager(agent, options);
  return { manager, record, requestApproval, telemetryTrack };
}

function hookContext(input: {
  readonly id: string;
  readonly toolName?: string;
  readonly args?: Record<string, unknown>;
}): ToolExecutionHookContext {
  const toolName = input.toolName ?? 'Bash';
  const args = input.args ?? { command: 'printf first', timeout: 60 };
  const toolCall: ToolCall = {
    type: 'function',
    id: input.id,
    name: toolName,
    arguments: JSON.stringify(args),
  };
  return {
    turnId: '0',
    stepNumber: 1,
    signal: new AbortController().signal,
    llm: {} as ToolExecutionHookContext['llm'],
    toolCall,
    args,
  };
}

function sessionAllowRule(): PermissionRule {
  return {
    decision: 'allow',
    scope: 'session-runtime',
    pattern: 'Bash',
    reason: 'approve_for_session: run command',
  };
}

function permissionRule(
  pattern: string,
  decision: PermissionRule['decision'] = 'allow',
): PermissionRule {
  return {
    decision,
    scope: 'turn-override',
    pattern,
  };
}

function genericDisplay(): ToolInputDisplay {
  return { kind: 'generic', summary: 'Approve tool', detail: {} };
}
