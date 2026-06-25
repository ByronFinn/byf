import { describe, expect, it } from 'vitest';

import { testAgent } from './harness/agent';

describe('btw side query — ContextMemory.getStableSnapshot', () => {
  it('returns a snapshot equivalent to getMessages() when no tool exchange is open', () => {
    const { agent } = testAgent();
    agent.context.appendUserMessage([{ type: 'text', text: 'first user message' }]);
    agent.context.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'first assistant reply' }],
      toolCalls: [],
    });
    agent.context.appendUserMessage([{ type: 'text', text: 'second user message' }]);

    const stable = agent.context.getStableSnapshot();
    const projected = agent.context.getMessages();

    expect(stable).toEqual(projected);
  });

  it('produces an isolated copy that does not mutate when context changes afterwards', () => {
    const { agent } = testAgent();
    agent.context.appendUserMessage([{ type: 'text', text: 'original message' }]);

    const stable = agent.context.getStableSnapshot();
    const lengthAtSnapshot = stable.length;

    agent.context.appendUserMessage([{ type: 'text', text: 'appended later' }]);

    expect(stable).toHaveLength(lengthAtSnapshot);
    expect(stable.at(-1)?.content[0]).toMatchObject({ text: 'original message' });
  });

  it('trims the trailing assistant mid-tool-call back to the last complete step', async () => {
    const { agent } = testAgent();
    agent.context.appendUserMessage([{ type: 'text', text: 'run the tests' }]);

    // Completed first step: assistant text + a finished tool exchange.
    await agent.context.appendLoopEvent({ type: 'step.begin', uuid: 's1', turnId: '0', step: 1 });
    await agent.context.appendLoopEvent({
      type: 'content.part',
      uuid: 'c1',
      turnId: '0',
      step: 1,
      stepUuid: 's1',
      part: { type: 'text', text: 'running' },
    });
    await agent.context.appendLoopEvent({
      type: 'tool.call',
      uuid: 'tc1',
      turnId: '0',
      step: 1,
      stepUuid: 's1',
      toolCallId: 'call-1',
      name: 'Bash',
      args: { command: 'npm test' },
    });
    await agent.context.appendLoopEvent({
      type: 'tool.result',
      parentUuid: 'tc1',
      toolCallId: 'call-1',
      result: { output: 'all passed', isError: false },
    });
    await agent.context.appendLoopEvent({ type: 'step.end', uuid: 's1', turnId: '0', step: 1 });

    // A new step is now in-flight: assistant emitted a tool_call whose
    // result has NOT landed yet — this is the dangling sequence a provider
    // would reject.
    await agent.context.appendLoopEvent({ type: 'step.begin', uuid: 's2', turnId: '0', step: 2 });
    await agent.context.appendLoopEvent({
      type: 'tool.call',
      uuid: 'tc2',
      turnId: '0',
      step: 2,
      stepUuid: 's2',
      toolCallId: 'call-2',
      name: 'Read',
      args: { path: 'foo.ts' },
    });

    const stable = agent.context.getStableSnapshot();
    const lastMessage = stable.at(-1);

    // The snapshot ends at the last complete step (the tool result), never
    // at the dangling assistant tool_call.
    expect(lastMessage?.role).toBe('tool');
    expect(lastMessage?.toolCallId).toBe('call-1');
    expect(stable.some((m) => m.toolCalls.some((c) => c.id === 'call-2'))).toBe(false);
  });
});

describe('btw side query — Agent.askSide', () => {
  it('answers with no tools and streams text deltas as btw events', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.context.appendUserMessage([{ type: 'text', text: 'fix the bug in foo.ts' }]);

    ctx.mockNextResponse({ type: 'text', text: 'config/runtime.toml' });
    await ctx.agent.askSide('what is the config file name?');

    const input = ctx.lastLlmInput();
    expect(input.input.tools).toEqual([]);

    const rpcEvents = ctx.allEvents
      .filter((e) => e.type === '[rpc]')
      .map((e) => ({ event: e.event, args: e.args }));

    const started = rpcEvents.find((e) => e.event === 'btw.started');
    const deltas = rpcEvents.filter((e) => e.event === 'btw.delta');
    const completed = rpcEvents.find((e) => e.event === 'btw.completed');

    expect(started?.args).toMatchObject({ query: 'what is the config file name?' });
    expect(started?.args).toHaveProperty('queryId');
    expect(deltas.map((e) => e.args.delta).join('')).toBe('config/runtime.toml');
    expect(completed?.args).toMatchObject({ text: 'config/runtime.toml' });
    expect(completed?.args).toHaveProperty('usage');
  });

  it('appends the question to a stable snapshot — the LLM sees the full context', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.context.appendUserMessage([{ type: 'text', text: 'fix the bug in foo.ts' }]);

    ctx.mockNextResponse({ type: 'text', text: 'answer' });
    await ctx.agent.askSide('where is it?');

    expect(ctx.lastLlmInput()).toMatchInlineSnapshot(`
      system: <system-prompt>
      tools: []
      messages:
        user: text "fix the bug in foo.ts"
        user: text "where is it?"
    `);
  });

  it('does not write to context history, wire records, or emit turn events', async () => {
    const ctx = testAgent();
    ctx.configure();
    const historyLengthBefore = ctx.agent.context.history.length;
    const recordCountBefore = ctx.allEvents.filter((e) => e.type === '[wire]').length;

    ctx.mockNextResponse({ type: 'text', text: 'answer' });
    await ctx.agent.askSide('quick question');

    // Context untouched.
    expect(ctx.agent.context.history).toHaveLength(historyLengthBefore);

    // No wire records written.
    expect(ctx.allEvents.filter((e) => e.type === '[wire]').length).toBe(recordCountBefore);

    // No turn / assistant.delta events leaked into the main transcript flow.
    const leakedEvents = ctx.allEvents
      .filter((e) => e.type === '[rpc]')
      .map((e) => e.event)
      .filter(
        (name) =>
          name === 'turn.started' ||
          name === 'turn.ended' ||
          name === 'assistant.delta' ||
          name === 'tool.call.started',
      );
    expect(leakedEvents).toEqual([]);
  });

  it('does not record usage into the session usage recorder', async () => {
    const ctx = testAgent();
    ctx.configure();
    const usageBefore = ctx.agent.usage.data();

    ctx.mockNextResponse({ type: 'text', text: 'answer' });
    await ctx.agent.askSide('quick question');

    expect(ctx.agent.usage.data()).toEqual(usageBefore);
  });

  it('does not appear in the wire replay on resume', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'hello' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'main task' }] });
    await ctx.untilTurnEnd();

    ctx.mockNextResponse({ type: 'text', text: 'btw answer' });
    await ctx.agent.askSide('side question');

    // Resume replays wire records — the btw exchange must not be there.
    await ctx.expectResumeMatches();
  });
});
