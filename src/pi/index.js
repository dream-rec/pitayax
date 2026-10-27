import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { installManagedBlock, pathExists, readTextIfExists } from '../lib/files.js';
import { retireMcp, retireMcpConfig } from '../lib/retire.js';
import { readJsonObject, writeJsonObject } from '../lib/json.js';
import {
  PI_CLI,
  PI_RETIRED_EXTENSION_FILES,
  PI_RETIRED_PACKAGES,
  defaultPiPluginIds,
  detectExtras,
  installedPluginVersion,
  packageVersionFromSource,
  pinSettingsSources,
  readRegisteredPackageNames,
  resolvePiPlugins
} from './catalog.js';
import { applyRepairs, pinExactVersions } from './repairs.js';
import { installPinnedPlugin, directEnv, unreachableProxies } from './registry.js';
import { piAgentDir, piExtensionsDir, piNpmDir, piSettingsPath } from './paths.js';
import { runCommand, tryCommand } from '../lib/runtime.js';
import { choose } from '../tui/index.js';

const APPEND_BLOCK_START = '<!-- PITAYA:START -->';
const APPEND_BLOCK_END = '<!-- PITAYA:END -->';

// 只补缺省的行为项。httpProxy、defaultProvider、defaultModel 属于机器/账号特有，
// 由用户自行配置，这里不写。
const SETTINGS_DEFAULTS = {
  theme: 'dark',
  defaultProjectTrust: 'always',
  defaultThinkingLevel: 'xhigh',
  retry: { enabled: true, maxRetries: 10, baseDelayMs: 2000 }
};

// 已是目标版本就不重装，让 update 不做无谓的全局写入。
export function piCliVersionMatches() {
  try {
    const result = runCommand('pi', ['--version'], { stdio: 'pipe', encoding: 'utf8' });
    return result.stdout?.trim() === packageVersionFromSource(PI_CLI);
  } catch {
    return false;
  }
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

// 已退役的扩展每次 init/update 都卸载，避免重新引入不再使用的工具。
export async function removeRetiredPackages(agentDir = piAgentDir()) {
  const registered = await readRegisteredPackageNames(agentDir);
  return removeRegistered(PI_RETIRED_PACKAGES, registered, '已退役');
}

export async function retiredExtensionPaths(agentDir = piAgentDir()) {
  const dir = piExtensionsDir(agentDir);
  const present = [];
  for (const name of PI_RETIRED_EXTENSION_FILES) {
    const filePath = path.join(dir, name);
    if (await pathExists(filePath)) present.push(filePath);
  }
  return present;
}

// 旧 shim 和 tool-backend.ts 会被 pi 一起加载，重复注册 bash/read/write 等工具。
export async function removeRetiredExtensionFiles(agentDir = piAgentDir()) {
  const results = [];
  for (const filePath of await retiredExtensionPaths(agentDir)) {
    await unlink(filePath);
    results.push({
      changed: true,
      action: 'removed',
      path: filePath,
      reason: '已退役，与 tool-backend 重复注册工具'
    });
  }
  return results;
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

// 清单外扩展不是本安装器管理的包，默认绝不自动卸载；只在交互式终端里让用户选。
// 非交互终端（CI、管道）保持保留，并在安装报告里写明。
async function reviewExtras(extras) {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    return [{
      changed: false,
      action: 'skipped',
      path: '清单外扩展',
      reason: `${extras.map((extra) => extra.name).join(', ')}；非交互终端默认保留`
    }];
  }

  process.stdout.write(`检测到 ${extras.length} 个不在安装清单中的扩展：\n`);
  for (const extra of extras) {
    process.stdout.write(`  - ${extra.name}${extra.version ? `@${extra.version}` : ''}\n`);
  }
  process.stdout.write('\n');

  if ((await choose('是否卸载这些扩展？', ['卸载', '保留'])) !== 0) {
    return [{ changed: false, action: 'skipped', path: '清单外扩展', reason: '用户选择保留' }];
  }
  return removeExtras(extras);
}

// npm 源按包名匹配（带版本也能匹配，但去掉版本更稳）；git/本地源按原样交给 pi remove。
async function removeExtras(extras) {
  const results = [];
  for (const extra of extras) {
    const source = !extra.source || extra.source.startsWith('npm:') ? `npm:${extra.name}` : extra.source;
    const removal = tryCommand('pi', ['remove', source]);
    results.push({
      changed: removal.ok,
      action: removal.ok ? 'removed' : 'failed',
      path: extra.name,
      reason: removal.ok ? '不在安装清单中' : removal.stderr || 'pi remove 失败'
    });
  }
  return results;
}

// 代理端口连不上时，重新解析依赖树也走直连，否则这一步会再次 ECONNREFUSED。
async function npmEnvForAgent() {
  const proxies = await unreachableProxies();
  return proxies.unreachable.length > 0 ? directEnv() : process.env;
}

export async function installPi(packageRoot, options = {}) {
  const agentDir = piAgentDir();
  const plugins = options.piPlugins ?? resolvePiPlugins(defaultPiPluginIds());
  const ctx = { agentDir, packageRoot, clean: Boolean(options.clean) };
  const results = [];

  results.push(...await removeRetiredPackages(agentDir));
  results.push(...await removeRetiredExtensionFiles(agentDir));
  results.push(...await retireMcp(options.rootDir ?? process.cwd()));
  results.push(await retireMcpConfig(path.join(agentDir, 'mcp-adapter.json')));
  if (options.clean) {
    results.push(...await uninstallPiPlugins(plugins, agentDir));
  }

  // 清单外扩展是否卸载只能由用户决定；非交互终端一律保留。
  const extras = await detectExtras(agentDir);
  if (extras.length > 0) {
    results.push(...await reviewExtras(extras));
  }

  if (piCliVersionMatches()) {
    results.push({ changed: false, action: 'unchanged', path: PI_CLI });
  } else {
    runCommand('npm', ['install', '-g', '--ignore-scripts', PI_CLI]);
    results.push({ changed: true, action: 'installed', path: PI_CLI });
  }

  const registered = await readRegisteredPackageNames(agentDir);
  const resolved = {};

  const install = async (plugin) => {
    const installed = await installPinnedPlugin(plugin, {
      piInstall: (spec, env) => runCommand('pi', ['install', spec], { env }),
      npmDir: piNpmDir(agentDir)
    });
    resolved[plugin.name] = installed.version;
    return installed;
  };

  for (const plugin of plugins) {
    const pinned = packageVersionFromSource(plugin.spec);
    const current = await installedPluginVersion(plugin.name, agentDir);
    if (registered.has(plugin.name) && current === pinned) {
      results.push({ changed: false, action: 'unchanged', path: plugin.spec });
      continue;
    }

    if (registered.has(plugin.name)) {
      // 版本冲突：pi install 是否替已登记的包换版取决于上游实现，装完复核；
      // 仍不一致就先摘掉旧条目再装，保证落到钉死版本。
      const first = await install(plugin);
      let final = await installedPluginVersion(plugin.name, agentDir);
      if (final !== first.version) {
        // 条目损坏时 pi remove 也可能报错；失败就继续装，别让一次对齐拖垮整个安装。
        tryCommand('pi', ['remove', `npm:${plugin.name}`]);
        await install(plugin);
        final = await installedPluginVersion(plugin.name, agentDir);
      }
      results.push({
        changed: true,
        action: final === first.version ? 'aligned' : 'skipped',
        path: plugin.spec,
        reason: `${current ?? '未安装'} → ${final ?? 'unknown'}${final === first.version ? '' : `，期望 ${first.version}`}`
      });
      continue;
    }

    const installed = await install(plugin);
    results.push({
      changed: true,
      action: 'installed',
      path: installed.spec,
      ...(installed.substituted ? { reason: installed.reason } : {})
    });
  }

  // 先做会改动依赖树的修复，改了才重解析；再做直接改 node_modules 内文件的修复，
  // 否则 npm install 可能把补过的文件还原。
  const treeResults = [
    await pinExactVersions(plugins, agentDir, resolved),
    await pinSettingsSources(plugins, agentDir),
    ...(await applyRepairs(plugins, ctx, 'tree'))
  ];
  results.push(...treeResults);
  if (treeResults.some((result) => result.changed)) {
    runCommand('npm', ['install'], { cwd: piNpmDir(agentDir), env: await npmEnvForAgent() });
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

  results.push(await installManagedBlock(packageRoot, agentDir, 'templates/pi/append-system.md', 'APPEND_SYSTEM.md', APPEND_BLOCK_START, APPEND_BLOCK_END, { wrapExisting: true }));
  return results;
}

function blockBody(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  return startIndex === -1 || endIndex < startIndex ? undefined : text.slice(startIndex + start.length, endIndex).trim();
}

// 偏好文件由标记块托管：块必须存在且内容等于模板，否则用户上一版偏好会一直生效。
export async function checkAppendSystem(packageRoot, agentDir = piAgentDir()) {
  const targetPath = path.join(agentDir, 'APPEND_SYSTEM.md');
  const template = await readFile(path.join(packageRoot, 'templates', 'pi', 'append-system.md'), 'utf8');
  const expected = blockBody(template, APPEND_BLOCK_START, APPEND_BLOCK_END);
  const actual = blockBody((await readTextIfExists(targetPath)) ?? '', APPEND_BLOCK_START, APPEND_BLOCK_END);
  return {
    name: 'Pi APPEND_SYSTEM block',
    ok: actual !== undefined && actual === expected,
    hint: `Missing or outdated ${APPEND_BLOCK_START} block in ${targetPath}. Run pitaya update.`
  };
}
