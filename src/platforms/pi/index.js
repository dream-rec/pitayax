import { mkdir } from 'node:fs/promises';
import { installCommonPitayaFiles, installManagedBlock, installSelectedSkills } from '../shared.js';
import { installMcpServers } from '../../lib/mcp.js';
import { readJsonObject, writeJsonObject } from '../../lib/json.js';
import {
  PI_RETIRED_PACKAGES,
  defaultPiPluginIds,
  isPluginInstalled,
  packageVersionFromSource,
  readRegisteredPackageNames,
  resolvePiPlugins
} from './catalog.js';
import { applyRepairs, pinExactVersions } from './repairs.js';
import { piAgentDir, piNpmDir, piSettingsPath } from './paths.js';
import { runCommand } from '../../lib/runtime.js';

// 钉死版本：pi update 会跳过 pinned npm 源，上游变动不会静默冲掉 repairs 里的补丁。
const PI_CLI = '@earendil-works/pi-coding-agent@0.84.2';

// 只补缺省的行为项。httpProxy、defaultProvider、defaultModel 属于机器/账号特有，
// 由用户自行配置，这里不写。
const SETTINGS_DEFAULTS = {
  theme: 'dark',
  defaultProjectTrust: 'always',
  defaultThinkingLevel: 'xhigh',
  retry: { enabled: true, maxRetries: 10, baseDelayMs: 2000 }
};

// 已是目标版本就不重装，让 update -p pi 不做无谓的全局写入。
function piCliVersionMatches() {
  try {
    const result = runCommand('pi', ['--version'], { stdio: 'pipe', encoding: 'utf8' });
    return result.stdout?.trim() === packageVersionFromSource(PI_CLI);
  } catch {
    return false;
  }
}

export async function installPiProject(packageRoot, targetRoot, options) {
  const results = [];
  results.push(await installManagedBlock(packageRoot, targetRoot, 'templates/rules/codex/pitaya-block.md', 'AGENTS.md', '<!-- PITAYA:START -->', '<!-- PITAYA:END -->'));
  results.push(...await installSelectedSkills(packageRoot, targetRoot, '.agents', options.skills));
  results.push(...await installCommonPitayaFiles(packageRoot, targetRoot));

  // pi-mcp-adapter 原生读取项目根 .mcp.json；使用共享格式也方便其他客户端复用。
  if (options.mcps && options.mcps.length > 0) {
    results.push(await installMcpServers(targetRoot, 'pi', options.mcps));
  }
  return results;
}

// pi 按包名匹配 source，不带版本即可；它会同时删 settings 条目和 npm 依赖。
function removeRegistered(names, registered, reason) {
  const results = [];
  for (const name of names) {
    if (!registered.has(name)) {
      continue;
    }
    runCommand('pi', ['remove', `npm:${name}`]);
    results.push({ changed: true, action: 'removed', path: `npm:${name}`, reason });
  }
  return results;
}

// 已退役的扩展每次 init/update 都清掉，不必等 --clean：留着会和 pi-footer 抢底部状态栏。
export async function removeRetiredPackages(agentDir = piAgentDir()) {
  const registered = await readRegisteredPackageNames(agentDir);
  return removeRegistered(PI_RETIRED_PACKAGES, registered, '已退役');
}

// --clean：先 pi remove 再重装，用来清掉漂移的依赖树和被 pi update 冲掉的补丁。
// 只卸载 settings.json 里已登记的清单内插件；用户自装的扩展和 Pi CLI 本身都不动。
export async function uninstallPiPlugins(plugins, agentDir = piAgentDir()) {
  const registered = await readRegisteredPackageNames(agentDir);
  const results = [];
  for (const plugin of plugins) {
    if (!registered.has(plugin.name)) {
      results.push({ changed: false, action: 'skipped', path: plugin.spec, reason: '未登记在 settings.json，无需卸载' });
      continue;
    }
    results.push(...removeRegistered([plugin.name], registered));
  }
  return results;
}

export async function installPi(packageRoot, options = {}) {
  const agentDir = piAgentDir();
  const plugins = options.piPlugins ?? resolvePiPlugins(defaultPiPluginIds());
  const ctx = { agentDir, packageRoot, clean: Boolean(options.clean) };
  const results = [];

  results.push(...await removeRetiredPackages(agentDir));
  if (options.clean) {
    results.push(...await uninstallPiPlugins(plugins, agentDir));
  }

  if (piCliVersionMatches()) {
    results.push({ changed: false, action: 'unchanged', path: PI_CLI });
  } else {
    runCommand('npm', ['install', '-g', '--ignore-scripts', PI_CLI]);
    results.push({ changed: true, action: 'installed', path: PI_CLI });
  }

  for (const plugin of plugins) {
    if (await isPluginInstalled(plugin, agentDir)) {
      results.push({ changed: false, action: 'unchanged', path: plugin.spec });
      continue;
    }
    runCommand('pi', ['install', plugin.spec]);
    results.push({ changed: true, action: 'installed', path: plugin.spec });
  }

  // 先做会改动依赖树的修复，改了才重解析；再做直接改 node_modules 内文件的修复，
  // 否则 npm install 可能把补过的文件还原。
  const treeResults = [
    await pinExactVersions(plugins, agentDir),
    ...(await applyRepairs(plugins, ctx, 'tree'))
  ];
  results.push(...treeResults);
  if (treeResults.some((result) => result.changed)) {
    runCommand('npm', ['install'], { cwd: piNpmDir(agentDir) });
    results.push({ changed: true, action: 'reinstalled', path: piNpmDir(agentDir) });
  }

  results.push(...await applyRepairs(plugins, ctx, 'files'));
  return results;
}

export async function ensurePiConfig(packageRoot) {
  const agentDir = piAgentDir();
  await mkdir(agentDir, { recursive: true });

  const settingsPath = piSettingsPath(agentDir);
  const settings = await readJsonObject(settingsPath, {});
  const nextSettings = { ...settings };
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    nextSettings[key] = settings[key] ?? value;
  }

  const results = [];
  if (JSON.stringify(settings) === JSON.stringify(nextSettings)) {
    results.push({ changed: false, action: 'unchanged', path: settingsPath });
  } else {
    await writeJsonObject(settingsPath, nextSettings);
    results.push({ changed: true, action: 'updated', path: settingsPath });
  }

  results.push(await installManagedBlock(packageRoot, agentDir, 'templates/pi/append-system.md', 'APPEND_SYSTEM.md', '<!-- PITAYA:START -->', '<!-- PITAYA:END -->'));
  return results;
}

export { PI_CLI };
