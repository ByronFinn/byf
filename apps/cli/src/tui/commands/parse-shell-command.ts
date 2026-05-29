const SHELL_PREFIX = /^!\s+([\s\S]+)$/;

export function parseShellCommand(input: string): string | null {
  const matched = SHELL_PREFIX.exec(input);
  if (matched === null) return null;
  const command = matched[1]?.trim() ?? '';
  return command.length > 0 ? command : null;
}
