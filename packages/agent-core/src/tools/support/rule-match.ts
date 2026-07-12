/**
 * Helpers for constructing permission approval rule patterns that pin a
 * tool call to a specific subject (command, path, cron payload, …).
 *
 * BYF permission matching uses `matchesRule` on tool name + args; the
 * string returned here is stored as `approvalRule` when the ToolExecution
 * type supports it. Even without that field, tools may keep calling these
 * helpers for display/action labels that mirror kimi's payload-scoped
 * approval convention.
 */

const GLOB_LITERAL_SPECIAL = /[\\*?[\]{}()!+@|]/g;

export function literalRulePattern(toolName: string, subject: string): string {
  return `${toolName}(${escapeRuleSubjectLiteral(subject)})`;
}

export function escapeRuleSubjectLiteral(subject: string): string {
  return subject.replace(GLOB_LITERAL_SPECIAL, '\\$&');
}
