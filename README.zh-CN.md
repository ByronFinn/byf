# BYF (Be Your Friend)

一个运行在终端里的 AI 编程 Agent

BYF 是一个面向终端工作流的编程 Agent，可以帮助你浏览仓库、编辑文件、执行 shell 命令，并完成日常开发任务。它已经作为独立项目运行，重点关注本地优先、基于 GitHub Releases 的分发方式，以及由用户自行掌控的配置。

## 安装
### npm（推荐）
```sh
npm install -g @byfriends/cli
```

### 脚本安装
```sh
curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash
```

## 平台支持

BYF 主要在 **macOS** 和 **Linux** 上构建和测试。Windows 可用，但精力有限，不保证完全支持。

## 使用
在当前项目中启动 BYF：

```sh
cd your-project
byf
```

也可以直接附带一条提示词启动：

```sh
byf "解释一下这个仓库的主要目录结构"
```

BYF 可以在终端里读取代码、编辑文件、执行命令，并协助你推进开发任务。

## 配置
BYF 的用户配置文件位于 `~/.byf/config.toml`。

如果你想自定义 BYF 的主目录，可以设置 `BYF_HOME`：

```sh
export BYF_HOME="$HOME/.config/byf"
```

请在本地配置中提供你自己的模型服务凭据或 API Key，并避免把密钥提交到仓库中。

## 参与贡献
开发流程与贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证
BYF 使用专有 [BYF 许可证](LICENSE) 分发。
