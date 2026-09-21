import path from 'node:path';
import { pathExists } from '../../lib/files.js';
import { readJsonObject } from '../../lib/json.js';
import { piAgentDir, piPackageDir, piSettingsPath } from './paths.js';

// Pi 可选扩展清单。版本全部钉死在本机实测通过的组合上：
// pi update 会跳过 pinned npm 版本，上游变动不会静默冲掉 repairs 里的补丁。
export const PI_PLUGIN_CATALOG = [
  {
    id: 'tool-display',
    name: 'pi-tool-display',
    spec: 'npm:pi-tool-display@0.5.0',
    label: 'pi-tool-display (辅助显示层)',
    description: '渲染 find/ls、MCP 输出、用户消息框和 thinking 标签；read/write/edit/grep/bash 交给 AFT。',
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
    description: '可配置的底部状态栏：模型/推理等级、目录与 git 状态分两行，扩展状态另起一行。',
    default: true,
    repairs: ['footer-gradient', 'footer-config']
  },
  {
    id: 'mcp-adapter',
    name: 'pi-mcp-adapter',
    spec: 'npm:pi-mcp-adapter@2.15.0',
    label: 'pi-mcp-adapter (MCP 接入)',
    description: '让 Pi 读取项目根 .mcp.json，与 Claude Code 共用同一份 MCP 配置。',
    default: true,
    repairs: ['mcp-status-icon']
  },
  {
    id: 'provider-manager',
    name: '@arcaneorion/pi-provider-manager',
    spec: 'npm:@arcaneorion/pi-provider-manager@0.3.9',
    label: '@arcaneorion/pi-provider-manager (模型面板 + 故障转移)',
    description: '/providers 面板、健康统计和 roundrobin 轮询引擎。必须走单入口加载。',
    default: true,
    repairs: ['provider-manager-single-entry']
  },
  {
    id: 'btw',
    name: 'pi-btw',
    spec: 'npm:pi-btw@0.4.1',
    label: 'pi-btw (会话中追加提示)',
    description: '在模型生成过程中插入补充指令，无需打断当前回合。',
    default: true
  },
  {
    id: 'magic-context',
    name: '@cortexkit/pi-magic-context',
    spec: 'npm:@cortexkit/pi-magic-context@0.40.1',
    label: '@cortexkit/pi-magic-context (语义上下文检索)',
    description: '本地 embedding 检索上下文。Intel Mac 需要把 onnxruntime-node 降到 1.21.0。',
    default: true,
    repairs: ['onnx-x64-override']
  },
  {
    id: 'aft',
    name: '@cortexkit/aft-pi',
    spec: 'npm:@cortexkit/aft-pi@0.53.0',
    label: '@cortexkit/aft-pi (代码工具后端)',
    description: '接管 read/write/edit/grep/bash，并提供索引搜索、结构导航、诊断和安全恢复。',
    default: true
  },
  {
    id: 'plugin-manager',
    name: 'pi-plugin-manager',
    spec: 'npm:pi-plugin-manager@0.2.3',
    label: 'pi-plugin-manager (插件管理)',
    description: '/plugins 面板：搜索、安装、禁用扩展与 MCP server，按需关掉不用的工具。',
    default: true
  },
  {
    id: 'web-access',
    name: 'pi-web-access',
    spec: 'npm:pi-web-access@0.28.0',
    label: 'pi-web-access (联网检索与抓取)',
    description: '提供 web_search / web_fetch 工具，支持多家搜索后端与网页正文提取。',
    default: true
  },
  {
    id: 'advisor-flow',
    name: 'pi-advisor-flow',
    spec: 'npm:pi-advisor-flow@0.6.0',
    label: 'pi-advisor-flow (顾问模型)',
    description: '用更强的模型做顾问、较快的模型做执行；默认 Simple mode 按需咨询，配置在 ~/.pi/agent/advisor.json。',
    default: true,
    repairs: ['advisor-simple-mode']
  }
];

// 已从清单退役的扩展。只要还登记在 settings.json 里，init/update 都会 pi remove 掉，
// 否则旧状态栏会和 pi-footer 抢占底部，doctor 也会把它报出来。
export const PI_RETIRED_PACKAGES = ['pi-cometix-footer'];

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

// 版本已钉死时重跑 pi install 只会把包还原成原始状态（footer 补丁因此被冲掉），
// 所以已是目标版本就跳过，让 update -p pi 真正幂等。
export async function isPluginInstalled(plugin, agentDir = piAgentDir()) {
  // 按包名匹配而非整串 source：pi install 会重写 settings.json，可能改写掉版本后缀。
  const settings = await readJsonObject(piSettingsPath(agentDir), {});
  const registered = (Array.isArray(settings.packages) ? settings.packages : []).some(
    (entry) => packageNameFromSource(settingsPackageSource(entry)) === plugin.name
  );
  if (!registered) {
    return false;
  }

  const manifestPath = path.join(piPackageDir(plugin.name, agentDir), 'package.json');
  if (!(await pathExists(manifestPath))) {
    return false;
  }
  const manifest = await readJsonObject(manifestPath, {});
  return manifest.version === packageVersionFromSource(plugin.spec);
}
