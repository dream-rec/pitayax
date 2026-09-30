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

`pitaya` 不替代 Trellis。它在 Trellis 之上安装项目级的个人 workflow 约束和 PRD 澄清 skill，也可以安装 Pi 及配套扩展（代码检索用 AFT，联网检索用 pi-web-access）。

- 平台选择：Pi / Cursor / Claude Code / OpenCode / Codex
- Skill 安装：`pitaya-grill-prd`（Trellis patch · grill-me 风格 PRD）
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
3. 选择要安装的 skill（默认选中；上一步跳过 Trellis 时不再询问）
4. enter 确认安装

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

`-p` 是必填参数。默认安装范围是项目级，默认模式是 `strict`，默认安装 PRD skill。

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
--skip-skills                                 # 不安装任何 skill
--pi-plugins <id,id,...>                      # 指定 Pi 插件 id，默认全部（仅 -p pi）
--skip-pi-plugins                             # 不安装任何 Pi 插件
--clean                                       # 先 pi remove 再重装选中的 Pi 插件（仅 -p pi）
--install-deps --developer <name>            # 自动初始化 Trellis
```

Skill ids：

- `trellis-pitaya-patch`（pitaya-grill-prd）

## 平台支持

| 平台 | 入口规则 | Skills 目录 | Hook 类型 |
|------|---------|------------|----------|
| Cursor | `.cursor/rules/pitaya.mdc` | `.cursor/skills/` | `preToolUse` (python) |
| Claude Code | `CLAUDE.md` | `.claude/skills/` | `PreToolUse` (python) |
| OpenCode | `AGENTS.md` | `.opencode/skills/` | `tool.execute.before` plugin (js) |
| Codex | `AGENTS.md` | `.codex/skills/` | `PreToolUse` (python, hooks.json) |
| Pi | `AGENTS.md` + Trellis 原生 `.pi/extensions/trellis/` | `.agents/skills/` | Pi extension events |

- Pi：可选的终端编码代理安装，以及当前验证过的扩展组合（TUI 里可多选，默认全选）。安装器使用 Node.js 内置跨平台 API，支持 Windows、macOS 和 Ubuntu/Linux；Windows 使用 `%USERPROFILE%/.pi/agent`，macOS/Linux 使用 `$HOME/.pi/agent`，也可用 `PI_CODING_AGENT_DIR` 或 `PI_CODING_AGENT_HOME` 覆盖：

| id | 包 | 作用 |
|----|----|------|
| `tool-display` | `pi-tool-display@0.5.0` | 辅助显示层：`find`/`ls`、用户消息框和 thinking 标签 |
| `nano-context` | `pi-nano-context@0.1.1` | 上下文用量显示 |
| `footer` | `pi-footer@0.5.1` | 可配置的底部状态栏（`/footer` 面板） |
| `provider-manager` | `@arcaneorion/pi-provider-manager@0.4.3` | `/providers` 面板 + roundrobin 故障转移 |
| `magic-context` | `@cortexkit/pi-magic-context@0.44.1` | 本地 embedding 上下文检索（配置缺失时 `init`/`update` 拉起上游 setup 向导） |
| `aft` | `@cortexkit/aft-pi@0.58.0` | 接管 `read`/`write`/`edit`/`grep`/`bash`，并提供索引搜索、结构导航、诊断和安全恢复 |
| `plugin-manager` | `pi-plugin-manager@0.2.3` | `/plugins` 面板：搜索、安装、禁用扩展 |
| `web-access` | `pi-web-access@0.33.0` | `web_search` / `fetch_content` 工具，多搜索后端与网页正文提取 |
| `advisor` | `@juicesharp/rpiv-advisor@2.11.0` | 执行模型主动向更强的顾问模型征求第二意见，顾问模型用 `/advisor` 选，写在 `~/.config/rpiv-advisor/advisor.json` |

## Pi 安装

```bash
npx pitayax init -p pi
```

只装其中一部分：

```bash
npx pitayax init -p pi --pi-plugins nano-context,footer
npx pitayax init -p pi --skip-pi-plugins
```

该命令会：

1. 按本机实测组合安装 Pi 0.87.1 和选中的扩展；已是对应版本则跳过；
2. 通过 `pi install` 安装选中的 Pi 扩展，并卸载登记在 `settings.json` 里的退役扩展（含 `pi-mcp-adapter`）；
3. 将扩展依赖范围收紧为精确版本并重新解析；
4. 应用扩展适配，包括 footer overlay 和 tok/s 扩展；
5. 补全 `~/.pi/agent/settings.json` 的缺省行为项，安装 `APPEND_SYSTEM.md`；
6. 使用 Trellis 原生 `trellis init ... --pi --yes` 初始化项目级 Pi extension、prompts、agents 和共享 skills；
7. 只清理 Pitaya 旧版写入的两个 MCP server 条目及旧策略 skill，不改动其它 server；
8. 执行检查：

```bash
npx pitayax doctor -p pi
```

重复执行是幂等的：没有变化时 install report 全是 `unchanged`，不会产生多余的 npm 写入。

### 清理式更新

```bash
npx pitayax update -p pi --clean
```

`--clean` 会先对 `settings.json` 里已登记的清单内插件逐个执行 `pi remove npm:<name>`（同时删掉 settings 条目和 `~/.pi/agent/npm` 里的依赖），再走一遍完整的安装、钉版本和扩展适配。`pi-footer.json` 和 `pi-tool-display/config.json` 也会重置回模板，原文件备份成 `*.bak.<时间戳>`。适用于依赖树漂移、`pi update` 冲掉补丁、或 `doctor` 报版本不一致而普通 `update` 修不好的情况。

不会被清掉的东西：用户自行安装、不在清单内的扩展；`providers.ts`；Pi CLI 本身；`settings.json` 里的 provider、模型、代理等账号配置。

### 版本钉死

`pi install npm:foo@1.2.3` 只会把 `^1.2.3` 写进 `~/.pi/agent/npm/package.json`，npm 实际解析的是该范围内的**最新**版本。`settings.json` 里的钉版本只能阻止 `pi update`，管不住 npm 解析。

所以 `pitaya` 会把选中扩展的依赖范围改写成精确版本再重新解析，这样换机器装出来的才是同一组合。`doctor` 会逐个比对实际版本，漂移时报错并提示 `pitaya update -p pi` 修复。用户自行安装、不在清单内的扩展不受影响。

钉死有代价：某台机器上的 registry 视野并不总是公共 registry——npm 缓存过期（`prefer-offline`）、镜像同步滞后、企业代理都可能让一个已发布版本在本机“不存在”，`pi install` 会直接以 `ETARGET` 失败。所以安装某个插件时，失败会先按 registry 复核一次（`npm view --prefer-online`，顺带刷新本机缓存）并重试原版本；若本机 registry 确实看不到该版本，才退到同一条 minor 线里可用的最高版本，并在安装报告里写明替换原因。registry 完全不可用时不静默换版本，直接报错。

### 扩展适配

扩展组合中有若干上游兼容问题需要适配，`init` 和 `update` 都会自动应用，`doctor` 会逐项校验：

**`pi-tool-display` 与 AFT 的工具归属** —— AFT 默认接管 `read`、`write`、`edit`、`grep` 和 `bash` 的执行及渲染；`pi-tool-display` 不重复覆盖这些工具，只保留 `find`、`ls`、用户消息框和 thinking 标签。看到 `edit` 使用 AFT 样式是预期行为。安装器只在配置文件不存在时写入这套默认归属，不覆盖用户已有配置。

**`pi-nano-context` 的 footer 冲突** —— 它会注册自己的 footer，与 `pi-footer` 抢占底部状态栏。安装后剥掉它的 footer 注册。这是直接改 `node_modules` 内的文件，任何一次 `pi install`/`pi update` 都会还原，重跑 `pitaya update -p pi` 即可。

**`pi-footer` 的渐变色 widget** —— 上游 0.5.1 没有 `fg: "gradient"`，模板里模型段用了它，不打补丁就退成白字。安装器把 `templates/pi/overlays/pi-footer/0.5.1/` 下的源文件原样盖进包目录（新增 `gradient.ts`、`advisor.ts`，改 `colors.ts`、`index.ts`、`widgets/instance.ts` 等），让 widget 支持逐字符动画渐变。色板除历史写法 `gradient`（retro）外还有 `gradient:ice`、`gradient:mint`、`gradient:ember`、`gradient:violet`，都在 `/footer` 的颜色列表里，用同一个 `fg` 选项切换；`hasAnimatedColor` 识别全部色板，换色板不会让动画定时器停摆。覆盖层按包版本分目录，上游升版后自动失配并由 `doctor` 报出，不会把旧补丁盖到新代码上。这是直接改 `node_modules`，`pi update` 会还原，重跑 `pitaya update -p pi` 即可。

**已退役的扩展** —— `pi-cometix-footer`（与 `pi-footer` 抢底部）、`pi-btw`、`pi-advisor-flow`（已被 `@juicesharp/rpiv-advisor` 取代）、`pi-mcp-adapter`（MCP 已退役）。只要还登记在 `settings.json`，`init`/`update` 都会 `pi remove`；`doctor` 会报告残留。

**`pi-footer` 的状态栏布局与 tok/s** —— 上游预设把模型、目录、git 挤在一行。安装器在 `~/.pi/agent/extensions/pi-footer.json` 不存在时写入三行布局，已有配置只补齐托管的五个 widget（执行模型、思考强度、advisor 两个 event widget、`tps`）的图标与配色，其余 widget、行和配置项保持用户原样，改动前先备份；同时安装 `~/.pi/agent/extensions/tps.ts`，将生成速率实时推送给 footer 的 `tps` event widget：

```
  zuoyebang/deepseek-v4.1-flash | 󰧑 xhigh
  zuoyebang/claude-opus-5-5 | 󰧑 high
  myrepo |  feature/footer-lines |  a1b2c3d |  (+12,-4) | 󱐋 83 tok/s
```

- 第一行是执行模型：`model-provider` 与 `thinking-level`。模型段关掉 `raw`（`raw: true` 会把 `icon` 一起吞掉）并把图标换成 nerd-fonts 的 `nf-oct-star`（U+F41E）；思考强度段的图标用 `icon` 选项换成 `md-brain`（U+F09D1），替代上游默认的 `md-eye`；
- 第二行是顾问模型：两个 `event` widget，widgetId 分别是 `advisor-model`、`advisor-effort`。值由覆盖层的 `advisor.ts` 给出——它读 `~/.config/rpiv-advisor/advisor.json`（XDG 优先、`~/.config` 回落，与上游 `rpiv-config` 同规则；`~/.pi/agent/advisor.json` 是退役扩展的旧文件，字段不同，不读），渲染前写进这两个 widget，未配置顾问时清空、整行自动隐藏。模型段图标 `nf-oct-moon`（U+F4EE），色板用 `gradient:ice` 与首行的 retro 区分；
- 第三行放 `cwd-basename`、`git-branch`、`git-sha`、`git-diff`、`tps`；`git-status` 与 `git-ahead-behind` 默认关闭，可在 `/footer` 打开。tok/s 自首个输出 delta 起算（不含 TTFT），流式期间按 300ms 更新，结束后优先以 `usage.output` 修正；
- `extensionStatusRow.hiddenKeys` 隐藏 `magic-context`；不再登记 MCP 状态项。

布局本身走 `pi-footer` 自己配置文件里的 widget 选项，`pi update` 不会丢；模型段的流光色和顾问行依赖上面的源码覆盖层。`advisor-model` 与 `advisor-effort` 是覆盖层保留的 event widget id，其它扩展不要复用。

手工编辑 `pi-footer.json` 后要先 `/reload` 再进 `/footer`：配置界面用的是会话启动时读进内存的那一份，在没重新加载的会话里按保存（Ctrl+S）会把旧内存配置写回磁盘，盖掉手改的内容。

**`@arcaneorion/pi-provider-manager` 的多实例问题** —— 该发布包的 `package.json` 没有 `pi` 字段，Pi 于是按约定扫描包内 `extensions/` 目录，把 6 个子模块当成 6 个独立扩展分别加载。各子模块拿到的 `ExtensionAPI` 实例互不相同，`pi.events` 无法互通，面板保存配置后触发不了轮询引擎热重载。修复分两步：

- `settings.json` 中该包的条目写成 `{ "source": ..., "extensions": [] }`，关掉包内的约定扫描；
- 写入 `~/.pi/agent/extensions/providers.ts`，单点转发到包的 `index.ts`。

补丁都在包外，`npm install` / `pi update` 覆盖不掉。

**`magic-context` 的配置向导** —— 插件拿不到必要配置时（historian / dreamer 模型、embedding）会故障安全地保持关闭。`doctor` 按插件的实际读取顺序（项目 `.cortexkit/magic-context.jsonc` 覆盖用户 `~/.config/cortexkit/magic-context.jsonc`，跟随 `XDG_CONFIG_HOME`）解析两层配置并检查这几项；缺配置时 `init`/`update` 会拉起上游的交互式向导 `npx --yes npm:@cortexkit/magic-context@0.44.3 setup --harness pi`，由它挑模型、写配置，安装器不自己编配置。非交互终端下跳过并提示命令，`doctor` 继续报缺。

**已退役的 Intel Mac onnxruntime 降版** —— 旧版安装器在 `darwin/x64` 上往 `~/.pi/agent/npm/package.json` 写入 `@huggingface/transformers → onnxruntime-node@1.21.0` 的 overrides，因为 1.22 之后的 `onnxruntime-node` 只带 `darwin/arm64` 二进制，没有 `darwin/x64`。`@cortexkit/pi-magic-context@0.42` 起不再依赖 `@huggingface/transformers`，改用 `onnxruntime-web`——它的 `onnxruntime-node` 是可选依赖，加载不到时回退到 WASM（上游自带这条检测）。于是这个 overrides 键成了死配置：留着不生效，但上游哪天重新引入 `transformers`，它会把 `onnxruntime-node` 悄悄压回 1.21.0。`init`/`update` 会清掉它，`doctor` 也会报出来。

对于 Windows 的 hook，安装器不依赖 Unix 可执行权限，并使用 `python`/`python3` 和 npm 的 `.cmd` shim 自动解析。走 shell 的命令行（需要 `.cmd` shim 的 Windows 场景）会自行给含空格的参数加引号，因此 `C:\Users\John Smith\...` 这类带空格的用户目录不会把命令拼坏。

### 模型配置

`pitaya` **不管** `~/.pi/agent/models.json`，也不写 `defaultProvider` / `defaultModel` / `httpProxy` —— 这些属于账号和机器特有配置。API key 不写入安装器或 Git。装完后用 Pi 的 `/providers` 面板自行配置 provider 和模型。

升级 Pi 及扩展时执行：

```bash
npx pitayax update -p pi
```

## 平台前置条件

各平台的使用环境需要：

- Node.js >= 18（建议使用当前 LTS）
- npm
- Pi 使用 `npx pitayax init -p pi` 时，会自动安装固定版本 Pi CLI
- 若使用 Trellis 自动初始化，需要 Python >= 3.9；Windows 请在安装 Python 时勾选加入 PATH

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

## 生成文件

Cursor：

- `.cursor/rules/pitaya.mdc`
- `.cursor/skills/pitaya-grill-prd/SKILL.md`
- `.cursor/hooks/pitaya-guard.py`
- `.cursor/hooks.json`

Claude Code：

- `CLAUDE.md` pitaya entry block
- `.claude/skills/pitaya-grill-prd/SKILL.md`
- `.claude/hooks/pitaya-guard.py`
- `.claude/settings.json`

OpenCode：

- `AGENTS.md` pitaya entry block
- `.opencode/skills/pitaya-grill-prd/SKILL.md`
- `.opencode/plugins/pitaya-guard.js`

Codex：

- `AGENTS.md` pitaya entry block
- `.codex/skills/pitaya-grill-prd/SKILL.md`
- `.codex/hooks/pitaya-guard.py`
- `.codex/hooks.json`
- `.codex/config.toml`（含 `[features] hooks = true`）

Trellis：

- 向 `.trellis/workflow.md` 追加 `Pitaya Profile` 区块。
- 安装 `.trellis/spec/guides/pitaya-prd-policy.md`。

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

- 必需二进制（node、trellis；Pi 另需 pi，其他平台需 python）
- Trellis 项目目录和 workflow.md
- 平台对应的规则、skills、hook 文件
- 已退役的 MCP server 配置、策略 skill 和 Pi 插件是否残留
- 项目文件中的密钥泄露扫描
