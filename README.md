# Pitaya

```text
    ▄▄██████▄▄
 ◤▄██░░░░•░░░██▄◥
 ▐██░░•░░░░•░░██▌
 ▐██░░░░•░░░•░██▌
 ◣▀██░░•░░░░░██▀◢
    ▀▀██████▀▀
```

面向 Pi、Codex、Claude Code、OpenCode 和 Cursor 的 Workflow patch 安装聚合器。npm 包名是 `pitayax`，命令名是 `pitaya`：用 `npx pitayax ...` 直接运行，或 `npm install -g pitayax` 后直接输入 `pitaya ...`。

`pitaya` 不替代 Trellis。它是在 Trellis 之上安装一组项目级个人 workflow 约束，同时聚合配置 MCP servers 和 skills；也可以安装 Pi 及配套扩展：

- 平台选择：Pi / Cursor / Claude Code / OpenCode / Codex
- Skill 安装：`pitaya-grill-prd`（Trellis patch · grill-me 风格 PRD）、`pitaya-mcp-policy`（MCP 优先级策略）
- MCP 配置：`fast-context-mcp`（代码语义检索）、`grok-search-mcp`（外部文档/实时网络检索）
- 交互式 TUI：上下选择、space 选中、enter 下一步/安装
- PRD 澄清自动采用 grill-me 风格，用户不需要显式提到 `pitaya`
- Trellis 原生的任务生命周期、spec、hooks、skills、sub-agents、checks 和 finish-work 保持不变
- strict 模式会阻止无活跃任务或 PRD 未确认时的实现类操作

## 安装

### 交互式 TUI（推荐）

```bash
npx pitayax
```

无参数时自动进入 TUI：

1. 选择平台（claude code / codex / opencode / cursor / pi）
2. 选择 Pi 插件（仅选了 Pi 时出现，默认全选）
3. 选择要安装的 skills（默认全选）
4. 选择要配置的 MCP servers（默认全选）
5. enter 确认安装

操作键：

- `↑/↓` 移动光标
- `space` 切换选中
- `a` 全选/全不选
- `enter` 下一步/确认
- `ctrl+c` 退出

### 命令行模式

```bash
npx pitayax init -p cursor
npx pitayax init -p claude
npx pitayax init -p opencode
npx pitayax init -p codex
npx pitayax init -p pi
```

`-p` 是必填参数。默认安装范围是项目级，默认模式是 `strict`，默认安装全部 skills 和 MCPs。

## 命令

```bash
npx pitayax                                  # 交互式 TUI
npx pitayax interactive                      # 同上
npx pitayax init -p <platform> [options]
npx pitayax doctor -p <platform>
npx pitayax update -p <platform>
```

参数：

```bash
-p cursor|claude|opencode|codex|pi           # 必填
--mode strict|advisory                        # 默认 strict
--skills <id,id,...>                          # 指定 skill id，默认全部
--mcps <id,id,...>                            # 指定 mcp id，默认全部
--skip-skills                                 # 不安装任何 skill
--skip-mcps                                   # 不配置任何 mcp
--pi-plugins <id,id,...>                      # 指定 Pi 插件 id，默认全部（仅 -p pi）
--skip-pi-plugins                             # 不安装任何 Pi 插件
--clean                                       # 先 pi remove 再重装选中的 Pi 插件（仅 -p pi）
--install-deps --developer <name>            # 自动初始化 Trellis
```

Skill ids：

- `trellis-pitaya-patch`（pitaya-grill-prd）
- `pitaya-mcp-policy`

MCP ids：

- `fast-context`（fast-context-mcp）
- `grok-search`（grok-search-mcp）

## 平台支持

| 平台 | 入口规则 | Skills 目录 | Hook 类型 | MCP 配置文件 |
|------|---------|------------|----------|-------------|
| Cursor | `.cursor/rules/pitaya.mdc` | `.cursor/skills/` | `preToolUse` (python) | `.cursor/mcp.json` |
| Claude Code | `CLAUDE.md` | `.claude/skills/` | `PreToolUse` (python) | `.mcp.json` |
| OpenCode | `AGENTS.md` | `.opencode/skills/` | `tool.execute.before` plugin (js) | `opencode.json` |
| Codex | `AGENTS.md` | `.codex/skills/` | `PreToolUse` (python, hooks.json) | `.codex/config.toml` |
| Pi | `AGENTS.md` + Trellis 原生 `.pi/extensions/trellis/` | `.agents/skills/` | Pi extension events | `.mcp.json`（`pi-mcp-adapter`） |

- Pi：可选的终端编码代理安装，以及当前验证过的扩展组合（TUI 里可多选，默认全选）。安装器使用 Node.js 内置跨平台 API，支持 Windows、macOS 和 Ubuntu/Linux；Windows 使用 `%USERPROFILE%/.pi/agent`，macOS/Linux 使用 `$HOME/.pi/agent`，也可用 `PI_CODING_AGENT_DIR` 或 `PI_CODING_AGENT_HOME` 覆盖：

| id | 包 | 作用 |
|----|----|------|
| `tool-display` | `pi-tool-display@0.5.0` | 辅助显示层：`find`/`ls`、MCP 输出、用户消息框和 thinking 标签 |
| `nano-context` | `pi-nano-context@0.1.1` | 上下文用量显示 |
| `footer` | `pi-footer@0.5.1` | 可配置的底部状态栏（`/footer` 面板） |
| `mcp-adapter` | `pi-mcp-adapter@2.15.0` | MCP 适配器，原生读取 `.mcp.json` |
| `provider-manager` | `@arcaneorion/pi-provider-manager@0.3.9` | `/providers` 面板 + roundrobin 故障转移 |
| `btw` | `pi-btw@0.4.1` | 生成过程中追加提示 |
| `magic-context` | `@cortexkit/pi-magic-context@0.40.1` | 本地 embedding 上下文检索 |
| `aft` | `@cortexkit/aft-pi@0.53.0` | 接管 `read`/`write`/`edit`/`grep`/`bash`，并提供索引搜索、结构导航、诊断和安全恢复 |
| `plugin-manager` | `pi-plugin-manager@0.2.3` | `/plugins` 面板：搜索、安装、禁用扩展与 MCP server |
| `web-access` | `pi-web-access@0.28.0` | `web_search` / `web_fetch` 工具，多搜索后端与网页正文提取 |
| `advisor-flow` | `pi-advisor-flow@0.6.0` | 顾问模型 + 执行模型分工，配置在 `~/.pi/agent/advisor.json` |

## Pi 安装

```bash
npx pitayax init -p pi
```

只装其中一部分：

```bash
npx pitayax init -p pi --pi-plugins nano-context,mcp-adapter
npx pitayax init -p pi --skip-pi-plugins
```

该命令会：

1. 使用 npm 全局安装固定版本的 `@earendil-works/pi-coding-agent`（产品名称统一简称 **Pi**）；已是该版本则跳过；
2. 通过 `pi install` 安装选中的 Pi 扩展，其中 `pi-mcp-adapter` 负责 MCP；
3. 把 `~/.pi/agent/npm/package.json` 里这些扩展的依赖范围收紧成精确版本，再重新解析（见下方“版本钉死”）；
4. 应用扩展适配（见下方“扩展适配”）；
5. 补全 `~/.pi/agent/settings.json` 的缺省行为项，并安装 `APPEND_SYSTEM.md`；
6. 使用 Trellis 原生的 `trellis init ... --pi --yes` 初始化项目级 Pi extension、prompts、agents 和共享 skills；
7. 将选中的 MCP servers 写入项目根 `.mcp.json`，由 `pi-mcp-adapter` 自动读取；
8. 执行检查：

```bash
npx pitayax doctor -p pi
```

重复执行是幂等的：没有变化时 install report 全是 `unchanged`，不会产生多余的 npm 写入。

### 清理式更新

```bash
npx pitayax update -p pi --clean
```

`--clean` 会先对 `settings.json` 里已登记的清单内插件逐个执行 `pi remove npm:<name>`（同时删掉 settings 条目和 `~/.pi/agent/npm` 里的依赖），再走一遍完整的安装、钉版本和扩展适配。适用于依赖树漂移、`pi update` 冲掉补丁、或 `doctor` 报版本不一致而普通 `update` 修不好的情况。

不会被清掉的东西：用户自行安装、不在清单内的扩展；`~/.pi/agent/extensions/` 下的配置文件（`pi-footer.json`、`pi-tool-display/config.json`、`providers.ts`）；Pi CLI 本身；`settings.json` 里的 provider、模型、代理等账号配置。

### 版本钉死

`pi install npm:foo@1.2.3` 只会把 `^1.2.3` 写进 `~/.pi/agent/npm/package.json`，npm 实际解析的是该范围内的**最新**版本（实测 `pi-mcp-adapter@2.15.0` 会装成 `2.31.0`）。`settings.json` 里的钉版本只能阻止 `pi update`，管不住 npm 解析。

所以 `pitaya` 会把选中扩展的依赖范围改写成精确版本再重新解析，这样换机器装出来的才是同一组合。`doctor` 会逐个比对实际版本，漂移时报错并提示 `pitaya update -p pi` 修复。用户自行安装、不在清单内的扩展不受影响。

### 扩展适配

扩展组合中有若干上游兼容问题需要适配，`init` 和 `update` 都会自动应用，`doctor` 会逐项校验：

**`pi-tool-display` 与 AFT 的工具归属** —— AFT 默认接管 `read`、`write`、`edit`、`grep` 和 `bash` 的执行及渲染；`pi-tool-display` 不重复覆盖这些工具，只保留 `find`、`ls`、MCP 输出、用户消息框和 thinking 标签。看到 `edit` 使用 AFT 样式是预期行为，并不表示 `pi-tool-display` 失效。安装器只在配置文件不存在时写入这套默认归属，不覆盖用户已有配置。

**`pi-nano-context` 的 footer 冲突** —— 它会注册自己的 footer，与 `pi-footer` 抢占底部状态栏。安装后剥掉它的 footer 注册。这是直接改 `node_modules` 内的文件，任何一次 `pi install`/`pi update` 都会还原，重跑 `pitaya update -p pi` 即可。

**`pi-footer` 的状态栏布局** —— 上游默认预设把模型、目录、git 挤在一行，窄窗口下会被截断。安装器只在 `~/.pi/agent/extensions/pi-footer.json` 不存在时写入一份三行布局，已存在（用户在 `/footer` 里调过）就不覆盖：

```
 zuoyebang/deepseek-v4.1-flash | 󰧑 xhigh
  myrepo |  feature/footer-lines |  a1b2c3d |  (+12,-4)
 󰚥 MCP: 2 servers enabled
```

- 第一行只放 `model-provider` 与 `thinking-level`。模型段用 widget 自带的 `raw: true` 去掉机器人图标；推理段的图标用 `icon` 选项换成 nerd-fonts 的 `md-brain`（U+F09D1），替代上游默认的 `md-eye`；
- 第二行放 `cwd-basename`、`git-branch`、`git-sha`、`git-diff`，`git-status` 与 `git-ahead-behind` 同在这一行但默认关闭，在 `/footer` 里打开即可；
- 第三行不用配：`pi-footer` 会把扩展状态行追加在配置行之后。`extensionStatusRow.hiddenKeys` 隐藏了 `magic-context`，所以这一行只剩 MCP。

这些全部走 `pi-footer` 自己的配置文件与 widget 选项，不改包源码，`pi update` 不会丢。

**`@arcaneorion/pi-provider-manager` 的多实例问题** —— 该发布包的 `package.json` 没有 `pi` 字段，Pi 于是按约定扫描包内 `extensions/` 目录，把 6 个子模块当成 6 个独立扩展分别加载。各子模块拿到的 `ExtensionAPI` 实例互不相同，`pi.events` 无法互通，面板保存配置后触发不了轮询引擎热重载。修复分两步：

- `settings.json` 中该包的条目写成 `{ "source": ..., "extensions": [] }`，关掉包内的约定扫描；
- 写入 `~/.pi/agent/extensions/providers.ts`，单点转发到包的 `index.ts`。

补丁都在包外，`npm install` / `pi update` 覆盖不掉。

**Intel Mac 的 onnxruntime** —— 仅在 `darwin/x64` 且选装了 `magic-context` 时生效。`@huggingface/transformers@4.2.0` 依赖 `onnxruntime-node@1.24.3`，而 1.22 之后的发布包只带 `darwin/arm64` 二进制，没有 `darwin/x64`。安装器会在 `~/.pi/agent/npm/package.json` 写入 overrides 把它压回 `1.21.0`。Apple Silicon 和 Linux 上不写这条。Windows 不需要这条兼容性降级。对于 Windows 的 hook，安装器不依赖 Unix 可执行权限，并使用 `python`/`python3` 和 npm 的 `.cmd` shim 自动解析。

### 模型配置

`pitaya` **不管** `~/.pi/agent/models.json`，也不写 `defaultProvider` / `defaultModel` / `httpProxy` —— 这些属于账号和机器特有配置。API key 不写入安装器或 Git。装完后用 Pi 的 `/providers` 面板自行配置 provider 和模型。

升级 Pi 及扩展时执行：

```bash
npx pitayax update -p pi
```

## 平台前置条件

三种平台都需要：

- Node.js >= 18（建议使用当前 LTS）
- npm
- Pi 使用 `npx pitayax init -p pi` 时，会自动安装固定版本 Pi CLI
- 若使用 Trellis 自动初始化，需要 Python >= 3.9；Windows 请在安装 Python 时勾选加入 PATH
- 使用 `grok-search-mcp` 需要 `uvx`；Windows、macOS、Ubuntu 都应按官方文档安装 uv

无 TTY 的 CI 或脚本环境不要调用无参数 TUI，改用显式 CLI，例如：

```bash
npx pitayax init -p pi --yes
```

## Trellis

来源：https://github.com/mindfold-ai/trellis

```bash
npm install -g @mindfoldhq/trellis@latest
```

先初始化 Trellis，或者让 `pitaya` 输出对应的初始化命令：

```bash
trellis init -u your-name --cursor --yes
trellis init -u your-name --claude --yes
trellis init -u your-name --opencode --yes
trellis init -u your-name --codex --yes
trellis init -u your-name --pi --yes
```

## Grill Me 

来源：https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md

`pitaya` 会安装项目级 `pitaya-grill-prd` skill，用于复用 grill-me 的交互风格：

- 一次只问一个问题。
- 给出选项和推荐答案。
- 尽可能先检查代码再提问。
- 用户回答后更新 `prd.md`。
- 实现开始前必须获得明确的 PRD 确认。

## Fast Context MCP

来源：https://github.com/SammySnake-d/fast-context-mcp

```bash
npm install @sammysnake/fast-context-mcp
```

MCP server 配置示例：

```json
{
  "fast-context": {
    "command": "npx",
    "args": [
      "-y",
      "--prefer-online",
      "fast-context-mcp@latest"
    ],
    "env": {
      "WINDSURF_API_KEY": "devin-session-xx"
    }
  }
}
```

## Grok Search MCP

来源：https://github.com/GuDaStudio/GrokSearch

需要 Python 3.10+ 和 `uv` / `uvx`。

```json
{
  "grok-search": {
    "type": "stdio",
    "command": "uvx",
    "args": [
      "--from",
      "git+https://github.com/GuDaStudio/GrokSearch@grok-with-tavily",
      "grok-search"
    ],
    "env": {
      "GROK_API_URL": "https://your-api-endpoint.com/v1",
      "GROK_API_KEY": "your-grok-api-key",
      "GROK_MODEL":"your-model",
      "TAVILY_API_KEY": "optional-tavily-key",
      "TAVILY_API_URL": "https://api.tavily.com"
    }
  }
}
```

## 生成文件

Cursor：

- `.cursor/rules/pitaya.mdc`
- `.cursor/skills/pitaya-grill-prd/SKILL.md`
- `.cursor/skills/pitaya-mcp-policy/SKILL.md`
- `.cursor/hooks/pitaya-guard.py`
- `.cursor/hooks.json`
- `.cursor/mcp.json`

Claude Code：

- `CLAUDE.md` pitaya entry block
- `.claude/skills/pitaya-grill-prd/SKILL.md`
- `.claude/skills/pitaya-mcp-policy/SKILL.md`
- `.claude/hooks/pitaya-guard.py`
- `.claude/settings.json`
- `.mcp.json`

OpenCode：

- `AGENTS.md` pitaya entry block
- `.opencode/skills/pitaya-grill-prd/SKILL.md`
- `.opencode/skills/pitaya-mcp-policy/SKILL.md`
- `.opencode/plugins/pitaya-guard.js`
- `opencode.json`

Codex：

- `AGENTS.md` pitaya entry block
- `.codex/skills/pitaya-grill-prd/SKILL.md`
- `.codex/skills/pitaya-mcp-policy/SKILL.md`
- `.codex/hooks/pitaya-guard.py`
- `.codex/hooks.json`
- `.codex/config.toml`（含 `[features] hooks = true` 和 `[mcp_servers.*]`）

Trellis：

- 向 `.trellis/workflow.md` 追加 `Pitaya Profile` 区块。
- 安装 `.trellis/spec/guides/pitaya-prd-policy.md`。
- 安装 `.trellis/spec/guides/pitaya-mcp-policy.md`。

## Strict 模式

strict 模式会阻止以下变更类操作：

- 当前没有活跃 Trellis task。
- task 仍处于 `planning` 状态，且 `prd.md` 尚未确认。

可以在 `prd.md` 中使用以下任一标记表示 PRD 已确认：

```markdown
PRD confirmed
confirmed: true
status: confirmed
```

## 从 dream-wf 迁移

产品由 `dream-wf` 更名为 `pitaya`。在已经装过 `dream-wf` 的项目里执行 `npx pitayax update -p <platform>`，安装器会自动：

- 把 `CLAUDE.md` / `AGENTS.md` / `~/.pi/agent/APPEND_SYSTEM.md` 里的 `<!-- DREAM-WF:START -->` 区块原位替换为 `<!-- PITAYA:START -->` 区块；
- 把 `.trellis/workflow.md` 里的 `dream-wf:profile:v1` 区块原位替换为 `pitaya:profile:v1` 区块；
- 把 `.claude/settings.json`、`.codex/hooks.json`、`.cursor/hooks.json` 里指向 `dream-wf-guard.py` 的 hook 命令改为 `pitaya-guard.py`。

下面这些旧文件不会自动删除，请手动清理，否则会和新文件同时生效：

- `.cursor/rules/dream-wf.mdc`、`.cursor/hooks/dream-wf-guard.py`
- `.claude/hooks/dream-wf-guard.py`、`.codex/hooks/dream-wf-guard.py`
- `.opencode/plugins/dream-wf-guard.js`
- 各平台 skills 目录下的 `dream-wf-grill-prd/`、`dream-wf-mcp-policy/`
- `.trellis/spec/guides/dream-wf-prd-policy.md`、`.trellis/spec/guides/dream-wf-mcp-policy.md`

strict 模式的逃生舱环境变量由 `DREAM_WF_MODE=advisory` 改为 `PITAYA_MODE=advisory`。

## 安全检查

提交前运行 doctor：

```bash
npx pitayax doctor -p cursor
npx pitayax doctor -p codex
```

doctor 会检查：

- 必需二进制（node、python3、trellis、uvx）
- Trellis 项目目录和 workflow.md
- 平台对应的规则、skills、hook 文件
- MCP 配置文件存在性和默认 MCP 条目完整性
- 项目文件中的密钥泄露扫描
