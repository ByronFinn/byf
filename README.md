# BYF (Be Your Friend)

An AI coding agent that runs in your terminal

BYF is a terminal-first coding agent for exploring repositories, editing files, running shell commands, and helping with day-to-day development work. It is an independent project focused on local workflows, GitHub-native distribution, and user-controlled configuration.

## Installation
### npm (recommended)
```sh
npm install -g @byfriends/cli
```

### Quick install
```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

## Platform Support

BYF is built and tested primarily on **macOS** and **Linux**. Windows is supported but on a best-effort basis.

## Usage
Start BYF in the current project:

```sh
cd your-project
byf
```

You can also start with an inline prompt:

```sh
byf "Explain the main directories in this repository"
```

BYF can inspect code, edit files, run shell commands, and help you iterate on development tasks from the terminal.

## Configuration
BYF stores its user config at `~/.byf/config.toml`.

Set `BYF_HOME` to move BYF's home directory to a custom location:

```sh
export BYF_HOME="$HOME/.config/byf"
```

Use your own provider credentials or API key in your local configuration, and keep secrets out of your repository.

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and contribution guidelines.

## License
BYF is distributed under the proprietary [BYF license](LICENSE).
