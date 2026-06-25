import type { ByfSlashCommand, SlashCommandAvailability } from './types';

export const BUILTIN_SLASH_COMMANDS = [
  {
    name: 'yolo',
    aliases: ['yes'],
    description: 'Toggle auto-approve mode',
    priority: 100,
    availability: 'always',
  },
  {
    name: 'btw',
    aliases: [],
    description: 'Ask a side question without affecting the main conversation',
    priority: 100,
    availability: 'always',
  },
  {
    name: 'permission',
    aliases: [],
    description: 'Select permission mode',
    priority: 100,
    availability: 'always',
  },
  {
    name: 'settings',
    aliases: ['config'],
    description: 'Open TUI settings',
    priority: 100,
    availability: 'always',
  },
  {
    name: 'model',
    aliases: [],
    description: 'Switch LLM model',
    priority: 100,
  },
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show available commands and shortcuts',
    priority: 80,
    availability: 'always',
  },
  {
    name: 'new',
    aliases: ['clear'],
    description: 'Start a fresh session in the current workspace',
    priority: 80,
  },
  {
    name: 'sessions',
    aliases: ['resume'],
    description: 'Browse and resume sessions',
    priority: 80,
  },
  {
    name: 'tasks',
    aliases: ['task'],
    description: 'Browse background tasks',
    priority: 80,
    availability: 'always',
  },
  {
    name: 'agent',
    aliases: [],
    description: 'Inspect foreground sub-agents',
    priority: 80,
    availability: 'always',
  },
  {
    name: 'mcp',
    aliases: [],
    description: 'Show MCP server status',
    priority: 60,
    availability: 'always',
  },
  {
    name: 'compact',
    aliases: [],
    description: 'Compact the conversation context',
    priority: 80,
  },
  {
    name: 'init',
    aliases: [],
    description: 'Analyze the codebase and generate AGENTS.md',
  },
  {
    name: 'fork',
    aliases: [],
    description: 'Fork the session, optionally rewinding to an earlier message',
    priority: 80,
  },
  {
    name: 'title',
    aliases: ['rename'],
    description: 'Set or show session title',
    priority: 60,
    availability: 'always',
  },
  {
    name: 'usage',
    aliases: [],
    description: 'Show session tokens + context window + plan quotas',
    priority: 60,
    availability: 'always',
  },
  {
    name: 'status',
    aliases: [],
    description: 'Show current session and runtime status',
    priority: 60,
    availability: 'always',
  },
  {
    name: 'feedback',
    aliases: [],
    description: 'Send feedback to make Byf Code better',
    priority: 60,
    availability: 'always',
  },
  {
    name: 'editor',
    aliases: [],
    description: 'Set the external editor for Ctrl-G',
    priority: 60,
    availability: 'always',
  },
  {
    name: 'theme',
    aliases: [],
    description: 'Set the terminal UI theme',
    priority: 60,
    availability: 'always',
  },
  {
    name: 'logout',
    aliases: ['disconnect'],
    description: 'Open selector to remove a configured provider',
    priority: 40,
  },
  {
    name: 'login',
    aliases: [],
    description: 'Add a custom OpenAI-compatible provider',
    priority: 40,
  },
  {
    name: 'connect',
    aliases: [],
    description: 'Connect a provider from a model catalog',
    priority: 40,
  },
  {
    name: 'exit',
    aliases: ['quit'],
    description: 'Exit the application',
    priority: 20,
  },
  {
    name: 'version',
    aliases: [],
    description: 'Show version information',
    priority: 20,
    availability: 'always',
  },
] as const satisfies readonly ByfSlashCommand[];

export type BuiltinSlashCommand = (typeof BUILTIN_SLASH_COMMANDS)[number];
export type BuiltinSlashCommandName = BuiltinSlashCommand['name'];
export interface AutocompleteSlashCommand {
  name: string;
  description: string;
}

export function findBuiltInSlashCommand(commandName: string): BuiltinSlashCommand | undefined {
  const commands = BUILTIN_SLASH_COMMANDS as readonly ByfSlashCommand<BuiltinSlashCommandName>[];
  return commands.find(
    (command) => command.name === commandName || command.aliases.includes(commandName),
  ) as BuiltinSlashCommand | undefined;
}

export function resolveSlashCommandAvailability(
  command: ByfSlashCommand,
  args: string,
): SlashCommandAvailability {
  const availability = command.availability ?? 'idle-only';
  return typeof availability === 'function' ? availability(args) : availability;
}

export function sortSlashCommands(commands: readonly ByfSlashCommand[]): ByfSlashCommand[] {
  return [...commands].toSorted(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name),
  );
}

export function buildAutocompleteSlashCommands(
  commands: readonly ByfSlashCommand[],
): AutocompleteSlashCommand[] {
  const entries: AutocompleteSlashCommand[] = [];
  const seenNames = new Set<string>();
  const append = (name: string, description: string): void => {
    if (seenNames.has(name)) return;
    seenNames.add(name);
    entries.push({ name, description });
  };

  for (const command of commands) {
    const aliasHint = command.aliases.length > 0 ? ` (${command.aliases.join(', ')})` : '';
    append(command.name, `${command.description}${aliasHint}`);
    for (const alias of command.aliases) {
      append(alias, `${command.description} (alias of /${command.name})`);
    }
  }

  return entries;
}
