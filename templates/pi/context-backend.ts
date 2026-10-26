/**
 * 上下文后端切换 —— 由 pitayax 安装，请勿手工改动。
 *
 * 本地会话用 magic-context；带 --ssh 启动时换 billion-context。pi-ssh 只把
 * read/write/edit/bash 送到远端，模型流量仍发生在本机，所以两套压缩器必须在
 * 同一进程里二选一：同时加载会双重压缩。
 *
 * 两个包的 settings 条目都被写成 { source, extensions: [] }，关掉包自身的加载；
 * 真正的加载由本文件按启动参数单点完成。补丁写在包外，npm install 覆盖不掉。
 */
import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SSH_MODE = process.argv.some((arg) => arg === "--ssh" || arg.startsWith("--ssh="));

const BACKENDS = {
  local: "../npm/node_modules/@cortexkit/pi-magic-context/dist/index.js",
  ssh: "../npm/node_modules/billion-context/dist/agent/pi-native.js"
};

export default async function contextBackend(pi: ExtensionAPI): Promise<void> {
  const entry = SSH_MODE ? BACKENDS.ssh : BACKENDS.local;
  // 只装了其中一类插件时，另一种模式没有可加载的后端，跳过而不是报错。
  if (!existsSync(new URL(entry, import.meta.url))) {
    return;
  }
  const { default: backend } = await import(entry);
  await backend(pi);
}
