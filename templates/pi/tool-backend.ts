/**
 * 工具后端切换 —— 由 pitaya 安装，请勿手工改动。
 *
 * AFT 与 pi-ssh 都注册 read/write/edit/bash，pi 只保留先注册的那个：
 * 两者同时加载既报冲突，pi-ssh 的远程实现也永远拿不到这四个工具。
 * 因此带 --ssh 启动时只加载 pi-ssh（原生四工具走远程），否则只加载 AFT。
 *
 * 配套修复在 settings.json：两个包的条目都写成 { source, extensions: [] }，
 * 关掉包自身的加载；真正的加载由本文件按启动参数单点完成。
 * 补丁写在包外，npm install / pi update 覆盖不掉。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SSH_BACKEND = "../npm/node_modules/pi-ssh/index.ts";
const LOCAL_BACKEND = "../npm/node_modules/@cortexkit/aft-pi/dist/index.js";

const sshMode = process.argv.some((arg) => arg === "--ssh" || arg.startsWith("--ssh="));

export default async function toolBackend(pi: ExtensionAPI): Promise<void> {
  const { default: backend } = await import(sshMode ? SSH_BACKEND : LOCAL_BACKEND);
  await backend(pi);
}
