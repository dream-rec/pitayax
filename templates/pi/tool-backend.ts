/**
 * 工具后端切换 —— 由 pitaya 安装，请勿手工改动。
 *
 * 本地会话只加载 AFT。`--ssh` 会话只加载 pi-ssh，并且只保留 bash 作为文件工具：
 * pi 的 read/write/edit/ls/find/grep 都在本机执行，和远端工作区是两套路径，
 * 混用会读写错机器。pi-ssh 的 bash 在远端，所有文件操作统一走它。
 *
 * 配套修复在 settings.json：两个包的条目都写成 { source, extensions: [] }，
 * 关掉包自身的加载；真正的加载由本文件按启动参数单点完成。
 * 补丁写在包外，npm install / pi update 覆盖不掉。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SSH_BACKEND = "../npm/node_modules/pi-ssh/index.ts";
const LOCAL_BACKEND = "../npm/node_modules/@cortexkit/aft-pi/dist/index.js";

const LOCAL_FILE_TOOLS = new Set(["read", "write", "edit", "ls", "find", "grep", "powershell"]);
const SSH_GUIDELINE =
  "SSH workspace: use the bash tool for every file operation (read, write, edit, search, list). " +
  "It runs on the remote host. The local read/write/edit/ls/find/grep tools are disabled in this " +
  "session because they would touch the local machine instead of the remote workspace.";

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
