/**
 * 工具后端切换 —— 由 pitaya 安装，请勿手工改动。
 *
 * 本地会话只加载 AFT。`--ssh` 会话只加载 pi-ssh：read/write/edit/bash 由 pi-ssh
 * 映射到远端；ls/find/grep 仍是 pi 的本机工具，会看到错误的目录，必须禁用。
 * 远端列目录与搜索统一走 bash。
 *
 * 配套修复在 settings.json：两个包的条目都写成 { source, extensions: [] }，
 * 关掉包自身的加载；真正的加载由本文件按启动参数单点完成。
 * 补丁写在包外，npm install / pi update 覆盖不掉。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SSH_BACKEND = "../npm/node_modules/pi-ssh/index.ts";
const LOCAL_BACKEND = "../npm/node_modules/@cortexkit/aft-pi/dist/index.js";

// read/write/edit/bash 由 pi-ssh 接管到远端，不能禁用；只禁用仍在本机执行的文件工具。
const LOCAL_FILE_TOOLS = new Set(["ls", "find", "grep", "powershell"]);
const SSH_GUIDELINE =
  "SSH workspace: read/write/edit/bash run on the remote host. ls/find/grep are disabled because " +
  "they would read the local machine; use bash for directory listing, search, and shell work.";

const sshMode = process.argv.some((arg) => arg === "--ssh" || arg.startsWith("--ssh="));

export default async function toolBackend(pi: ExtensionAPI): Promise<void> {
  const { default: backend } = await import(sshMode ? SSH_BACKEND : LOCAL_BACKEND);
  await backend(pi);

  if (!sshMode) return;

  pi.on("session_start", () => {
    pi.setActiveTools(pi.getActiveTools().filter((name) => !LOCAL_FILE_TOOLS.has(name)));
  });

  pi.on("before_agent_start", (event) => {
    const guidelines = event.systemPromptOptions.promptGuidelines;
    if (!guidelines.includes(SSH_GUIDELINE)) guidelines.push(SSH_GUIDELINE);
  });
}
