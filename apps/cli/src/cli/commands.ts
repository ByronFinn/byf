import { Command, Option } from 'commander';

import { CLI_COMMAND_NAME } from '#/constant/app';

import type { CLIOptions } from './options';
import { registerExportCommand } from './sub/export';
import { registerVisCommand } from './sub/vis';

export type MainCommandHandler = (opts: CLIOptions) => void;

export function createProgram(version: string, onMain: MainCommandHandler): Command {
  const program = new Command(CLI_COMMAND_NAME)
    .description('The Starting Point for Next-Gen Agents')
    .version(version, '-V, --version')
    .allowUnknownOption(false)
    .allowExcessArguments(true)
    .configureHelp({ helpWidth: 100 })
    .helpOption('-h, --help', 'Show help.')
    .addHelpText('after', '\nDocumentation:        https://github.com/ByronFinn/byf\n');

  program
    .addOption(
      new Option(
        '-S, --session [id]',
        'Resume a session. With ID: resume that session. Without ID: interactively pick.',
      ).argParser((val: string | boolean) => (val === true ? '' : (val as string))),
    )
    .addOption(
      new Option('-r, --resume [id]')
        .hideHelp()
        .argParser((val: string | boolean) => (val === true ? '' : (val as string))),
    )
    .option('-C, --continue', 'Continue the previous session for the working directory.', false)
    .option('-y, --yolo', 'Automatically approve all actions.', false)
    .addOption(
      new Option(
        '-m, --model <model>',
        'LLM model alias to use for this invocation. Defaults to default_model in config.toml.',
      ),
    )
    .addOption(
      new Option(
        '-p, --prompt <prompt>',
        'Run one prompt non-interactively and print the response.',
      ),
    )
    .addOption(
      new Option(
        '--output-format <format>',
        'Output format for prompt mode. Defaults to text.',
      ).choices(['text', 'stream-json']),
    )
    .addOption(
      new Option(
        '--skills-dir <dir>',
        'Load skills from this directory instead of auto-discovered user and project directories. Can be repeated.',
      )
        .argParser((value: string, previous: string[] | undefined) => [...(previous ?? []), value])
        .default([]),
    )
    .addOption(new Option('--yes').hideHelp().default(false))
    .addOption(new Option('--auto-approve').hideHelp().default(false));

  registerExportCommand(program);
  registerVisCommand(program);

  program.action(() => {
    // When the user types a positional arg that is not a known subcommand
    // (e.g. `byf foo`), Commander routes to this action handler instead of
    // producing "unknown command" because the root command has an action handler.
    // We allow excess arguments so Commander does not emit "too many arguments"
    // first, and detect the case here to produce the expected error.
    const operands = program.args;
    if (operands.length > 0) {
      const unknownName = operands[0]!;
      program.error(`error: unknown command '${unknownName}'`, {
        code: 'commander.unknownCommand',
      });
    }

    const raw = program.opts<Record<string, unknown>>();

    const rawSession = raw['session'] ?? raw['resume'];
    const sessionValue = rawSession === true ? '' : (rawSession as string | undefined);
    const yoloValue = raw['yolo'] === true || raw['yes'] === true || raw['autoApprove'] === true;

    const opts: CLIOptions = {
      session: sessionValue,
      continue: raw['continue'] as boolean,
      yolo: yoloValue,
      model: raw['model'] as string | undefined,
      outputFormat: raw['outputFormat'] as CLIOptions['outputFormat'],
      prompt: raw['prompt'] as string | undefined,
      skillsDirs: raw['skillsDir'] as string[],
    };

    onMain(opts);
  });

  return program;
}
