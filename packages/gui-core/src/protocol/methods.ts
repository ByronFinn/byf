import type { JsonRpcRequest } from './frames';
import {
  METHOD_CORE_CREATE_SESSION,
  METHOD_CORE_RESUME_SESSION,
  METHOD_CORE_LIST_SESSIONS,
  METHOD_CORE_CLOSE_SESSION,
  METHOD_CORE_GET_BYF_CONFIG,
  METHOD_CORE_SET_BYF_CONFIG,
  METHOD_CORE_LIST_MCP_SERVERS,
  METHOD_CORE_RECONNECT_MCP_SERVER,
  METHOD_SESSION_PROMPT,
  METHOD_SESSION_STEER,
  METHOD_SESSION_CANCEL,
  METHOD_SESSION_SET_MODEL,
  METHOD_SESSION_SET_THINKING,
  METHOD_SESSION_SET_PERMISSION,
  METHOD_SESSION_COMPACT,
  METHOD_AGENT_GET_CONTEXT,
  METHOD_AGENT_GET_CONFIG,
  METHOD_AGENT_GET_PERMISSION,
  METHOD_AGENT_GET_USAGE,
  METHOD_AGENT_GET_TOOLS,
  METHOD_AGENT_LIST_SKILLS,
  METHOD_AGENT_ACTIVATE_SKILL,
  METHOD_AGENT_GET_BACKGROUND,
  METHOD_AGENT_STOP_BACKGROUND,
  METHOD_EVENT,
  METHOD_REQUEST_APPROVAL,
  METHOD_REQUEST_QUESTION,
  METHOD_TOOL_CALL,
} from './frames';

export type MethodHandler = (params: unknown, requestId: number | string) => Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown } }>;

export class MethodRouter {
  private readonly handlers = new Map<string, MethodHandler>();

  /** Method names that are never registered (removed per ADR 0008). */
  private static readonly DISABLED_METHODS = new Set([
    'agent.getPlan',
    'agent.clearPlan',
    'agent.enterPlan',
    'agent.cancelPlan',
    'session.getPlan',
    'session.clearPlan',
    'session.enterPlan',
    'session.cancelPlan',
    'core.getPlan',
    'core.clearPlan',
    'core.enterPlan',
    'core.cancelPlan',
  ]);

  register(method: string, handler: MethodHandler): void {
    if (MethodRouter.DISABLED_METHODS.has(method)) {
      return; // Silently skip disabled methods
    }
    this.handlers.set(method, handler);
  }

  dispatch(request: JsonRpcRequest): ReturnType<MethodHandler> {
    const handler = this.handlers.get(request.method);
    if (handler === undefined) {
      return Promise.resolve({
        error: { code: -32601, message: `Method not found: ${request.method}` },
      });
    }
    return handler(request.params, request.id);
  }

  /** Return the list of registered method names (for healthcheck/diagnostics). */
  getRegisteredMethods(): string[] {
    return [...this.handlers.keys()];
  }
}