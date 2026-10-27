import path from 'node:path';
import { readJsonObject, writeJsonObject } from '../lib/json.js';
import { piAgentDir, piPackageDir, piSettingsPath } from './paths.js';

// 钉死版本：pi update 会跳过 pinned npm 源，上游变动不会静默冲掉 repairs 里的补丁。
export const PI_CLI = '@earendil-works/pi-coding-agent@0.87.1';

// Pi 可选扩展清单。版本全部钉死在本机实测通过的组合上：
// pi update 会跳过 pinned npm 版本，上游变动不会静默冲掉 repairs 里的补丁。
export const PI_PLUGIN_CATALOG = [
  {
    id: 'tool-display',
    name: 'pi-tool-display',
    spec: 'npm:pi-tool-display@0.5.0',
    label: 'pi-tool-display (辅助显示层)',
    description: '渲染 find/ls、用户消息框和 thinking 标签；read/write/edit/grep/bash 交给 AFT。',
    default: true,
    repairs: ['tool-display-config']
  },
  {
    id: 'nano-context',
    name: 'pi-nano-context',
    spec: 'npm:pi-nano-context@0.1.1',
    label: 'pi-nano-context (上下文用量显示)',
    description: '显示上下文占用。需剥掉它自带的 footer，否则与 pi-footer 抢占。',
    default: true,
    repairs: ['nano-context-footer']
  },
  {
    id: 'footer',
    name: 'pi-footer',
    spec: 'npm:pi-footer@0.5.1',
    label: 'pi-footer (状态栏)',
    description: '可配置的底部状态栏：执行模型、顾问模型、目录/git/tok/s 分行显示。',
    default: true,
    repairs: ['footer-gradient', 'footer-config', 'footer-tps']
  },
  {
    id: 'provider-manager',
    name: '@arcaneorion/pi-provider-manager',
    spec: 'npm:@arcaneorion/pi-provider-manager@0.4.3',
    label: '@arcaneorion/pi-provider-manager (模型面板 + 故障转移)',
    description: '/providers 面板、健康统计和 roundrobin 轮询引擎。必须走单入口加载。',
    default: true,
    repairs: ['provider-manager-single-entry']
  },
  {
    id: 'magic-context',
    name: '@cortexkit/pi-magic-context',
    spec: 'npm:@cortexkit/pi-magic-context@0.44.1',
    label: '@cortexkit/pi-magic-context (语义上下文检索)',
    description: '本地 embedding 检索上下文；Intel Mac 走上游自带的 onnxruntime-web WASM 回退。',
    setup: 'npm:@cortexkit/magic-context@0.44.3',
    default: true,
    repairs: ['retired-onnx-override', 'magic-context-setup']
  },
  {
    id: 'billion-context',
    name: 'billion-context',
    spec: 'npm:billion-context@0.1.208',
    label: 'billion-context (SSH 会话上下文压缩)',
    description: '只给 --ssh 会话用：本地代理压缩上下文。与 magic-context 互斥，由 context-backend 单点加载。',
    default: true,
    repairs: ['context-backend', 'billion-context-config']
  },
  {
    id: 'aft',
    name: '@cortexkit/aft-pi',
    spec: 'npm:@cortexkit/aft-pi@0.58.0',
    label: '@cortexkit/aft-pi (代码工具后端)',
    description: '接管 read/write/edit/grep/bash，并提供索引搜索、结构导航、诊断和安全恢复。与 pi-ssh 由 tool-backend 单点加载。',
    default: true,
    repairs: ['tool-backend']
  },
  {
    id: 'ssh',
    name: 'pi-ssh',
    spec: 'npm:pi-ssh@0.4.0',
    label: 'pi-ssh (SSH 远程工具)',
    description: '带 --ssh 启动时把 read/write/edit/bash/grep/find/ls 都送到远端，本地会话仍走 AFT。',
    default: true,
    repairs: ['tool-backend', 'remote-tools', 'tool-display-ssh']
  },
  {
    id: 'plugin-manager',
    name: 'pi-plugin-manager',
    spec: 'npm:pi-plugin-manager@0.2.3',
    label: 'pi-plugin-manager (插件管理)',
    description: '/plugins 面板：搜索、安装、禁用扩展。',
    default: true
  },
  {
    id: 'web-access',
    name: 'pi-web-access',
    spec: 'npm:pi-web-access@0.33.0',
    label: 'pi-web-access (联网检索与抓取)',
    description: '提供 web_search / fetch_content 等工具，支持多家搜索后端与网页正文提取。',
    default: true
  },
  {
    id: 'advisor',
    name: '@juicesharp/rpiv-advisor',
    spec: 'npm:@juicesharp/rpiv-advisor@2.11.0',
    label: '@juicesharp/rpiv-advisor (顾问模型)',
    description: '执行模型可主动向更强的顾问模型征求第二意见；顾问模型用 /advisor 选，写在 ~/.config/rpiv-advisor/advisor.json。',
    default: true
  },
  {
    id: 'paster',
    name: 'pi-paster',
    spec: 'npm:pi-paster@0.2.3',
    label: 'pi-paster (粘贴图片)',
    description: '把粘贴进来的图片路径转成真正的图片附件，免得模型只看到一行路径。',
    default: true
  },
  {
    id: 'ponytail',
    name: '@dietrichgebert/ponytail',
    spec: 'npm:@dietrichgebert/ponytail@5.3.2',
    label: '@dietrichgebert/ponytail (最小改动模式)',
    description: '自带 ponytail 系列 skill，要求用最小改动解决问题并按级别约束输出。',
    default: true
  }
];

// 已退役扩展在 init/update 时卸载，doctor 会报告残留。
export const PI_RETIRED_PACKAGES = ['pi-cometix-footer', 'pi-btw', 'pi-advisor-flow', 'pi-mcp-adapter'];

// 旧安装器直接写在 extensions/ 下的 shim。pi 会加载该目录里的每个文件，
// ssh-aft-compat.ts 与 tool-backend.ts 注册同一批工具，必须删掉。
export const PI_RETIRED_EXTENSION_FILES = ['ssh-aft-compat.ts'];

export function defaultPiPluginIds() {
  return PI_PLUGIN_CATALOG.filter((item) => item.default).map((item) => item.id);
}

export function resolvePiPlugins(ids) {
  const set = new Set(ids);
  return PI_PLUGIN_CATALOG.filter((item) => set.has(item.id));
}

// "npm:@scope/name@1.2.3" -> "@scope/name"；作用域包首字符的 @ 不能当版本分隔符。
export function packageNameFromSource(source) {
  if (typeof source !== 'string') {
    return undefined;
  }
  const withoutProtocol = source.replace(/^npm:/, '');
  const versionAt = withoutProtocol.lastIndexOf('@');
  return versionAt > 0 ? withoutProtocol.slice(0, versionAt) : withoutProtocol;
}

export function packageVersionFromSource(source) {
  if (typeof source !== 'string') {
    return undefined;
  }
  const withoutProtocol = source.replace(/^npm:/, '');
  const versionAt = withoutProtocol.lastIndexOf('@');
  return versionAt > 0 ? withoutProtocol.slice(versionAt + 1) : undefined;
}

export function settingsPackageSource(entry) {
  return typeof entry === 'string' ? entry : entry?.source;
}

// settings.json 里登记的全部包名，用于找出退役包和判断是否需要卸载。
export async function readRegisteredPackageNames(agentDir = piAgentDir()) {
  const settings = await readJsonObject(piSettingsPath(agentDir), {});
  return new Set(
    (Array.isArray(settings.packages) ? settings.packages : [])
      .map((entry) => packageNameFromSource(settingsPackageSource(entry)))
      .filter(Boolean)
  );
}

// 从 settings.json 的 packages 反推已装插件，doctor 据此决定检查哪些修复，
// 用户没选装的插件不会被误报成缺失。
export async function readInstalledPluginIds(agentDir = piAgentDir()) {
  const installed = await readRegisteredPackageNames(agentDir);
  return PI_PLUGIN_CATALOG.filter((plugin) => installed.has(plugin.name)).map((plugin) => plugin.id);
}

// 已是目标版本就不重装：重跑 pi install 只会把包还原成原始状态（footer 补丁因此被冲掉），
// update 也就失去幂等性。版本不一致时由调用方做对齐。
export async function installedPluginVersion(name, agentDir = piAgentDir()) {
  const manifest = await readJsonObject(path.join(piPackageDir(name, agentDir), 'package.json'), {});
  return manifest.version;
}

// settings.json 里的 source 也要带版本：早期手工安装的条目是 npm:foo，pi update
// 会把它们升到最新版，只有 npm/package.json 收紧范围拦不住。
export async function pinSettingsSources(plugins, agentDir = piAgentDir()) {
  const settingsPath = piSettingsPath(agentDir);
  const settings = await readJsonObject(settingsPath, {});
  const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
  let changed = false;

  for (const plugin of plugins) {
    const index = packages.findIndex(
      (entry) => packageNameFromSource(settingsPackageSource(entry)) === plugin.name
    );
    if (index === -1) continue;
    const entry = packages[index];
    const next = typeof entry === 'string' ? plugin.spec : { ...entry, source: plugin.spec };
    if (JSON.stringify(entry) !== JSON.stringify(next)) {
      packages[index] = next;
      changed = true;
    }
  }

  if (!changed) {
    return { changed: false, action: 'unchanged', path: settingsPath };
  }
  await writeJsonObject(settingsPath, { ...settings, packages });
  return { changed: true, action: 'updated', path: settingsPath };
}

// 清单外扩展：settings.json 登记、但不在本安装器清单里的包。退役包由安装流程先卸载，
// 不会落到这里；返回 settings 里的原始 source，便于按原样交给 pi remove。
export async function detectExtras(agentDir = piAgentDir()) {
  const settings = await readJsonObject(piSettingsPath(agentDir), {});
  const managed = new Set(PI_PLUGIN_CATALOG.map((plugin) => plugin.name));
  const extras = [];
  for (const entry of Array.isArray(settings.packages) ? settings.packages : []) {
    const source = settingsPackageSource(entry);
    const name = packageNameFromSource(source);
    if (!name || managed.has(name) || PI_RETIRED_PACKAGES.includes(name)) continue;
    extras.push({ name, source, version: await installedPluginVersion(name, agentDir) });
  }
  return extras;
}
