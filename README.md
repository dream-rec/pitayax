<p align="center">
  <img src="https://raw.githubusercontent.com/dream-rec/pitayax/main/icon/pitaya.png" width="112" alt="pitayax logo">
</p>

<h1 align="center">pitayax</h1>

<p align="center"><strong>一条命令，把磨合好的 Pi 工作流带到下一台机器。</strong></p>

---

## 安装

只支持 Pi，需要 Node.js 18+。Pi CLI 和插件按 [`src/pi/catalog.js`](src/pi/catalog.js) 的钉死版本安装。

```bash
npx pitayax          # 交互式选择插件后安装
npx pitayax init     # 默认安装全部插件
npx pitayax update   # 更新并恢复补丁
npx pitayax doctor   # 只读检查，不改任何文件
```

全局安装后可用 `pitaya` 代替 `npx pitayax`：

```bash
npm install -g pitayax
```

### 交互式

1. 选择 Pi 插件（默认全选）
2. 确认安装

`↑/↓` 移动，`space` 切换，`a` 全选/全不选，`enter` 确认，`ctrl+c` 退出。

CI、管道等非交互环境改用：

```bash
npx pitayax init --pi-plugins footer,aft,ssh
npx pitayax init --skip-pi-plugins
```

### 命令选项

| 选项 | 说明 |
| --- | --- |
| `--pi-plugins <id,id,...>` | 只安装指定插件 |
| `--skip-pi-plugins` | 只装 Pi CLI 和提示词，不装插件 |
| `--clean` | 先 `pi remove` 选中插件再重装，并重置托管配置 |
| `-p, --platform pi` | 兼容旧命令，可省略 |
| `--yes`, `-y` | 兼容旧脚本，无实际作用 |

---

## 会话栈

`--ssh` 决定这次启动加载哪一套，一次启动内不会中途切换：

| 启动方式 | 上下文 | 工具 |
| --- | --- | --- |
| `pi` | magic-context | AFT |
| `pi --ssh user@host[:path]` | billion-context | pi-ssh：read/write/edit/bash/grep/find/ls 全部在远端 |

两套上下文压缩器互斥，由 `extensions/context-backend.ts` 按启动参数单点加载；工具后端同理由 `extensions/tool-backend.ts` 切换。

`billion-context` 钉在 `0.1.208`，安装时在 `~/.config/billion-context/billion-context.json` 写入 `autoUpdate=false`、`advisoryCheck=false`、`pi.subagents=false`：它的自更新和 critical 公告会绕过版本钉死，内置子代理工具也不在本工作流范围内。

---

## 插件清单

插件 id 与钉死版本见 [`src/pi/catalog.js`](src/pi/catalog.js)：

| 插件 | 作用 |
| --- | --- |
| `pi-tool-display` | 渲染 find/ls、用户消息框和 thinking 标签 |
| `pi-nano-context` | 上下文占用显示 |
| `pi-footer` | 三行状态栏：执行模型 / 顾问模型 / 目录与 tok/s |
| `@arcaneorion/pi-provider-manager` | `/providers` 面板、健康统计与轮询 |
| `@cortexkit/pi-magic-context` | 本地会话的语义上下文检索 |
| `billion-context` | `--ssh` 会话的本地代理上下文压缩（与 magic-context 互斥） |
| `@cortexkit/aft-pi` | 本地代码工具后端：索引搜索、结构导航、诊断 |
| `pi-ssh` | `--ssh` 时 read/write/edit/bash/grep/find/ls 全部走远端 |
| `pi-plugin-manager` | `/plugins` 插件管理面板 |
| `pi-web-access` | 联网检索与网页正文提取 |
| `@juicesharp/rpiv-advisor` | 顾问模型第二意见 |
| `pi-paster` | 粘贴图片路径转成图片附件 |
| `@dietrichgebert/ponytail` | 最小改动模式，自带 ponytail 系列 skill |

---

## 写入位置

全部落在 Pi agent 目录（`$PI_CODING_AGENT_DIR`，默认 `~/.pi/agent`）：

| 路径 | 内容 |
| --- | --- |
| `settings.json` | 只补 `theme`、`defaultProjectTrust`、`defaultThinkingLevel`、`retry` 的缺省值 |
| `APPEND_SYSTEM.md` | `<!-- PITAYA:START -->` / `<!-- PITAYA:END -->` 标记块内的个人开发偏好 |
| `extensions/providers.ts` | provider-manager 单入口 |
| `extensions/tool-backend.ts` | AFT / pi-ssh 按启动参数二选一 |
| `extensions/context-backend.ts` | magic-context / billion-context 按启动参数二选一 |
| `extensions/remote-tools.ts` | `--ssh` 会话的远端 grep/find/ls |
| `extensions/tps.ts` | 把 tok/s 送进 footer 事件槽 |
| `extensions/pi-footer.json` | 状态栏三行布局 |
| `extensions/pi-tool-display/config.json` | 工具显示配置 |
| `npm/` | 插件按精确版本安装 |

不写 `auth.json`、`models.json`、`httpProxy`、`defaultProvider`、`defaultModel`，也不动你自装的其它扩展。唯一落在 agent 目录外的是 `billion-context` 的钉版开关，路径跟随 `XDG_CONFIG_HOME` 或 `BILI_CONFIG_FILE`。

---

## 补丁

`init` / `update` 每次都会校验并重放，`doctor` 报告被还原的部分。

| 补丁 | 作用 |
| --- | --- |
| `footer-gradient` | 给 pi-footer 加 `fg: "gradient"` 支持 |
| `footer-config` | 三行状态栏，保留用户其它 widget；`--ssh` 下第三行目录位显示远端 `host:path`，状态行只留 ponytail |
| `footer-tps` | tok/s 接入 footer 事件槽 |
| `nano-context-footer` | 剥掉 pi-nano-context 自带 footer，避免与 pi-footer 抢占 |
| `provider-manager-single-entry` | 6 个子模块改由 `providers.ts` 单入口加载 |
| `tool-backend` | AFT 与 pi-ssh 都注册 read/write/edit/bash，按 `--ssh` 只加载一个 |
| `context-backend` | magic-context 与 billion-context 都压缩上下文，按 `--ssh` 只加载一个 |
| `billion-context-config` | 关闭 bili 自更新、强制公告和内置子代理工具 |
| `remote-tools` | pi-ssh 只替换四个工具，补齐远端 grep/find/ls |
| `tool-display-ssh` | `--ssh` 会话让出 grep/find/ls，避免与 remote-tools 重名 |
| `tool-display-config` | pi-tool-display 显示配置 |
| `retired-onnx-override` | 清掉旧安装器写下的 onnxruntime 降版覆盖 |
| `magic-context-setup` | 缺配置时拉起上游 setup 向导，安装器不自己写配置 |

---

## 扩展检查

每次 `init` / `update` 先读 `settings.json` 再动手：

- **版本冲突**：与钉死版本不一致时自动对齐。装完复核包内 `package.json`，仍不一致就先 `pi remove` 再装，报告记为 `aligned` 并写出 `旧版本 → 新版本`；`settings.json` 的 source 也会收紧成精确版本。
- **清单外扩展**：已登记但不在 `src/pi/catalog.js` 里的包。交互式终端会列出名称和版本，让你选「卸载 / 保留」；非交互终端一律保留并在报告里注明。
- **已退役扩展**：`pi-cometix-footer`、`pi-btw`、`pi-advisor-flow`、`pi-mcp-adapter` 直接卸载；`.mcp.json` / `mcp-adapter.json` 里对应的退役 server 一并清掉，其它 MCP 条目不动。
- **billion-context 钉版**：doctor 校验 `autoUpdate=false`、`advisoryCheck=false`、`pi.subagents=false`，任一被改回去都会报出来。

---

## 许可协议

本项目采用 **MIT** 协议许可。
