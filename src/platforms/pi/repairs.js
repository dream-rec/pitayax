import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { backupIfExists, pathExists, readTextIfExists, writeIfChanged, writeTextFile } from '../../lib/files.js';
import { readJsonObject, writeJsonObject } from '../../lib/json.js';
import { packageNameFromSource, packageVersionFromSource, settingsPackageSource } from './catalog.js';
import { piExtensionsDir, piNpmDir, piPackageDir, piSettingsPath } from './paths.js';

const PROVIDER_MANAGER = '@arcaneorion/pi-provider-manager';

// 旧版本为 Intel Mac 写过 @huggingface/transformers.onnxruntime-node=1.21.0。
const RETIRED_OVERRIDE_PARENT = '@huggingface/transformers';
const RETIRED_OVERRIDE_KEY = 'onnxruntime-node';
const RETIRED_OVERRIDE_PIN = '1.21.0';

const NANO_CONTEXT_FOOTER = /ctx\.ui\.setFooter\(\(_tui,\s*theme,\s*footerData\)\s*=>\s*\(\{[\s\S]*?renderFooter\(pi,\s*ctx,\s*footerData,\s*width,\s*theme\),[\s\S]*?\}\)\);/;
const NANO_CONTEXT_FOOTER_CLEANUP = /ctx\.ui\.setFooter\(undefined\);/;
const MCP_STATUS_EMOJI = '"🔌 MCP: "';
const MCP_STATUS_NERD = '"󰚥 MCP: "';

async function readTemplate(packageRoot, fileName) {
  return readFile(path.join(packageRoot, 'templates', 'pi', fileName), 'utf8');
}

// 用户自己在 /footer、tool-display 里调过的配置文件不覆盖；--clean 视为重置，
// 先备份再写回模板。
async function seedConfigFile({ agentDir, packageRoot, clean }, relativePath, templateName) {
  const configPath = path.join(piExtensionsDir(agentDir), ...relativePath);
  const exists = await pathExists(configPath);
  if (exists && !clean) {
    return { changed: false, action: 'unchanged', path: configPath };
  }
  const template = await readTemplate(packageRoot, templateName);
  if (exists && (await readTextIfExists(configPath)) === template) {
    return { changed: false, action: 'unchanged', path: configPath };
  }
  const backup = exists ? await backupIfExists(configPath) : undefined;
  await writeTextFile(configPath, template);
  return {
    changed: true,
    action: exists ? 'reset' : 'created',
    path: configPath,
    reason: backup ? `原配置已备份到 ${path.basename(backup)}` : undefined
  };
}

// 源码覆盖层：templates/pi/overlays/<包名>/<版本>/ 下的文件原样盖到包目录里。
// 按版本分目录，上游一升版就自动失配，不会把旧补丁盖到新代码上。
function overlayDir(packageRoot, packageName, version) {
  return path.join(packageRoot, 'templates', 'pi', 'overlays', ...packageName.split('/'), version);
}

async function listFilesRecursive(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(path.join(dir, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}

async function resolveOverlay(packageRoot, packageName, agentDir) {
  const packageDir = piPackageDir(packageName, agentDir);
  const manifest = await readJsonObject(path.join(packageDir, 'package.json'), {});
  if (!manifest.version) {
    return { packageDir, reason: `${packageName} 未安装` };
  }
  const dir = overlayDir(packageRoot, packageName, manifest.version);
  if (!(await pathExists(dir))) {
    return { packageDir, version: manifest.version, reason: `没有适用于 ${packageName}@${manifest.version} 的覆盖层` };
  }
  return { packageDir, version: manifest.version, dir, files: await listFilesRecursive(dir) };
}

async function applyOverlay(packageRoot, packageName, agentDir) {
  const overlay = await resolveOverlay(packageRoot, packageName, agentDir);
  if (!overlay.dir) {
    return [{ changed: false, action: 'skipped', path: overlay.packageDir, reason: overlay.reason }];
  }
  const results = [];
  for (const file of overlay.files) {
    const contents = await readFile(path.join(overlay.dir, file), 'utf8');
    results.push(await writeIfChanged(path.join(overlay.packageDir, file), contents));
  }
  return results;
}

async function checkOverlay(packageRoot, packageName, agentDir) {
  const overlay = await resolveOverlay(packageRoot, packageName, agentDir);
  if (!overlay.dir) {
    return { ok: false, detail: overlay.reason };
  }
  for (const file of overlay.files) {
    const expected = await readFile(path.join(overlay.dir, file), 'utf8');
    if ((await readTextIfExists(path.join(overlay.packageDir, file))) !== expected) {
      return { ok: false, detail: `${file} 与覆盖层不一致` };
    }
  }
  return { ok: true };
}

// 每个条目把「怎么修」和「怎么验」放在一起，安装与 doctor 共用同一份事实。
// phase 'tree' 会改动 npm 依赖树，必须排在会改 node_modules 内文件的 'files' 之前。
export const REPAIRS = {
  'nano-context-footer': {
    label: 'pi-nano-context footer 冲突',
    phase: 'files',
    async apply({ agentDir }) {
      const nanoPath = path.join(piPackageDir('pi-nano-context', agentDir), 'index.ts');
      if (!(await pathExists(nanoPath))) {
        return { changed: false, action: 'skipped', path: nanoPath, reason: 'pi-nano-context 未安装' };
      }

      const source = await readFile(nanoPath, 'utf8');
      const next = source.replace(NANO_CONTEXT_FOOTER, '').replace(NANO_CONTEXT_FOOTER_CLEANUP, '');

      if (next !== source) {
        await writeTextFile(nanoPath, next);
        return { changed: true, action: 'updated', path: nanoPath };
      }
      if (!source.includes('ctx.ui.setFooter(')) {
        return { changed: false, action: 'unchanged', path: nanoPath };
      }
      throw new Error(`无法安全剥离 pi-nano-context 的 footer，上游实现可能已变更: ${nanoPath}`);
    },
    async check({ agentDir }) {
      const nanoPath = path.join(piPackageDir('pi-nano-context', agentDir), 'index.ts');
      const source = await readTextIfExists(nanoPath);
      return {
        name: 'Pi footer conflict repair',
        ok: Boolean(source) && !source.includes('ctx.ui.setFooter('),
        hint: `pi-nano-context still registers a competing footer. Run pitaya update -p pi to repair ${nanoPath}`
      };
    }
  },

  'provider-manager-single-entry': {
    label: 'pi-provider-manager 单入口加载',
    phase: 'files',
    async apply({ agentDir, packageRoot, plugin }) {
      const results = [];
      const settingsPath = piSettingsPath(agentDir);
      const settings = await readJsonObject(settingsPath, {});
      const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
      const index = packages.findIndex(
        (entry) => packageNameFromSource(settingsPackageSource(entry)) === PROVIDER_MANAGER
      );

      if (index === -1) {
        results.push({ changed: false, action: 'skipped', path: settingsPath, reason: 'settings.json 中没有 provider-manager 条目' });
      } else {
        const current = packages[index];
        // extensions: [] 走 pi 的空 pattern 分支，禁掉包内 extensions/ 的约定扫描。
        const next = { source: settingsPackageSource(current) ?? plugin.spec, extensions: [] };
        if (JSON.stringify(current) === JSON.stringify(next)) {
          results.push({ changed: false, action: 'unchanged', path: settingsPath });
        } else {
          packages[index] = next;
          await writeJsonObject(settingsPath, { ...settings, packages });
          results.push({ changed: true, action: 'updated', path: settingsPath });
        }
      }

      const shimPath = path.join(piExtensionsDir(agentDir), 'providers.ts');
      results.push(await writeIfChanged(shimPath, await readTemplate(packageRoot, 'providers.ts')));
      return results;
    },
    async check({ agentDir }) {
      const settingsPath = piSettingsPath(agentDir);
      const settings = await readJsonObject(settingsPath, {});
      const entry = (Array.isArray(settings.packages) ? settings.packages : []).find(
        (item) => packageNameFromSource(settingsPackageSource(item)) === PROVIDER_MANAGER
      );
      const shimPath = path.join(piExtensionsDir(agentDir), 'providers.ts');

      return [
        {
          name: 'Pi provider-manager settings filter',
          ok: Boolean(entry) && typeof entry === 'object' && Array.isArray(entry.extensions) && entry.extensions.length === 0,
          hint: `provider-manager must be pinned to { source, extensions: [] } in ${settingsPath}, otherwise pi loads its 6 submodules as separate extensions. Run pitaya update -p pi.`
        },
        {
          name: 'Pi provider-manager single-entry shim',
          ok: await pathExists(shimPath),
          hint: `Missing ${shimPath}. Run pitaya update -p pi.`
        }
      ];
    }
  },

  'tool-display-config': {
    label: 'pi-tool-display 显示配置',
    phase: 'files',
    async apply(ctx) {
      return seedConfigFile(ctx, ['pi-tool-display', 'config.json'], 'tool-display-config.json');
    },
    async check({ agentDir }) {
      const configPath = path.join(piExtensionsDir(agentDir), 'pi-tool-display', 'config.json');
      return {
        name: 'Pi tool-display config',
        ok: await pathExists(configPath),
        hint: `Missing ${configPath}. Run pitaya update -p pi.`
      };
    }
  },

  // pi-footer 上游没有 fg: "gradient"；模板里的模型段用了它，不打这层补丁就退成白字。
  // 补丁直接改 node_modules 内的源码，pi update / 重装会还原，doctor 会报出来。
  'footer-gradient': {
    label: 'pi-footer 渐变色 widget',
    phase: 'files',
    async apply({ agentDir, packageRoot }) {
      return applyOverlay(packageRoot, 'pi-footer', agentDir);
    },
    async check({ agentDir, packageRoot }) {
      const result = await checkOverlay(packageRoot, 'pi-footer', agentDir);
      return {
        name: 'Pi footer gradient overlay',
        ok: result.ok,
        hint: `pi-footer is missing the gradient color patch${result.detail ? ` (${result.detail})` : ''}. Run pitaya update -p pi.`
      };
    }
  },

  'footer-config': {
    label: 'pi-footer 状态栏布局',
    phase: 'files',
    async apply(ctx) {
      return seedConfigFile(ctx, ['pi-footer.json'], 'pi-footer.json');
    },
    async check({ agentDir }) {
      const configPath = path.join(piExtensionsDir(agentDir), 'pi-footer.json');
      return {
        name: 'Pi footer config',
        ok: await pathExists(configPath),
        hint: `Missing ${configPath}. Run pitaya update -p pi.`
      };
    }
  },

  // 上游状态行前缀是 🔌 emoji，和 nerd 图标的其余 footer 不搭；换成 md-power-plug。
  'mcp-status-icon': {
    label: 'pi-mcp-adapter 状态行图标',
    phase: 'files',
    async apply({ agentDir }) {
      const utilsPath = path.join(piPackageDir('pi-mcp-adapter', agentDir), 'utils.ts');
      const source = await readTextIfExists(utilsPath);
      if (!source) {
        return { changed: false, action: 'skipped', path: utilsPath, reason: 'pi-mcp-adapter 未安装' };
      }
      if (source.includes(MCP_STATUS_NERD)) {
        return { changed: false, action: 'unchanged', path: utilsPath };
      }
      if (!source.includes(MCP_STATUS_EMOJI)) {
        throw new Error(`无法安全替换 pi-mcp-adapter 状态图标，上游实现可能已变更: ${utilsPath}`);
      }
      await writeTextFile(utilsPath, source.replace(MCP_STATUS_EMOJI, MCP_STATUS_NERD));
      return { changed: true, action: 'updated', path: utilsPath };
    },
    async check({ agentDir }) {
      const utilsPath = path.join(piPackageDir('pi-mcp-adapter', agentDir), 'utils.ts');
      const source = await readTextIfExists(utilsPath);
      return {
        name: 'Pi MCP status icon',
        ok: Boolean(source) && source.includes(MCP_STATUS_NERD),
        hint: `pi-mcp-adapter status line still uses the emoji plug. Run pitaya update -p pi to repair ${utilsPath}`
      };
    }
  },

  // magic-context 0.42 起不再依赖 @huggingface/transformers，改用 onnxruntime-web，并在
  // darwin/x64 上回退到它的 WASM 实现（1.22+ 的 onnxruntime-node 确实不发布 darwin/x64）。
  // 旧安装器写下的 overrides 键因此成了死配置：留着不生效，但上游哪天重新引入 transformers，
  // 它会悄悄把 onnxruntime-node 压回 1.21.0 而没人记得原因。init/update 时清掉。
  'retired-onnx-override': {
    label: '退役的 onnxruntime 降版覆盖',
    phase: 'tree',
    async apply({ agentDir }) {
      const packagePath = path.join(piNpmDir(agentDir), 'package.json');
      if (!(await pathExists(packagePath))) {
        return { changed: false, action: 'skipped', path: packagePath, reason: 'pi 扩展目录尚未初始化' };
      }

      const manifest = await readJsonObject(packagePath, {});
      const overrides = { ...(manifest.overrides ?? {}) };
      const parent = overrides[RETIRED_OVERRIDE_PARENT];
      if (parent?.[RETIRED_OVERRIDE_KEY] !== RETIRED_OVERRIDE_PIN) {
        return { changed: false, action: 'unchanged', path: packagePath };
      }

      const nextParent = { ...parent };
      delete nextParent[RETIRED_OVERRIDE_KEY];
      if (Object.keys(nextParent).length > 0) {
        overrides[RETIRED_OVERRIDE_PARENT] = nextParent;
      } else {
        delete overrides[RETIRED_OVERRIDE_PARENT];
      }

      const nextManifest = { ...manifest, overrides };
      if (Object.keys(overrides).length === 0) {
        delete nextManifest.overrides;
      }
      await writeJsonObject(packagePath, nextManifest);
      return { changed: true, action: 'updated', path: packagePath };
    },
    async check({ agentDir }) {
      const packagePath = path.join(piNpmDir(agentDir), 'package.json');
      const manifest = await readJsonObject(packagePath, {});
      return {
        name: 'Pi retired onnxruntime override',
        ok: manifest.overrides?.[RETIRED_OVERRIDE_PARENT]?.[RETIRED_OVERRIDE_KEY] !== RETIRED_OVERRIDE_PIN,
        hint: `Stale overrides entry ${RETIRED_OVERRIDE_PARENT}.${RETIRED_OVERRIDE_KEY}=${RETIRED_OVERRIDE_PIN} in ${packagePath}; newer magic-context needs no such pin. Run pitaya update -p pi.`
      };
    }
  }
};

function repairsFor(plugins, phase) {
  const ids = [];
  for (const plugin of plugins) {
    for (const id of plugin.repairs ?? []) {
      const repair = REPAIRS[id];
      if (repair && !ids.some((item) => item.id === id) && (!phase || repair.phase === phase)) {
        ids.push({ id, repair, plugin });
      }
    }
  }
  return ids;
}

export async function applyRepairs(plugins, ctx, phase) {
  const results = [];
  for (const { repair, plugin } of repairsFor(plugins, phase)) {
    results.push(...[].concat(await repair.apply({ ...ctx, plugin })));
  }
  return results;
}

export async function checkRepairs(plugins, ctx) {
  const checks = [];
  for (const { repair, plugin } of repairsFor(plugins)) {
    checks.push(...[].concat(await repair.check({ ...ctx, plugin })));
  }
  return checks;
}

// pi install npm:foo@1.2.3 只把 ^1.2.3 写进 npm/package.json，npm 实际解析的是该范围内
// 的最新版（实测 pi-mcp-adapter@2.15.0 会装成 2.31.0）。settings.json 里的钉版本只能
// 阻止 pi update，管不住 npm 解析。要让换机器装出同一组合，必须收紧成精确版本。
export async function pinExactVersions(plugins, agentDir) {
  const packagePath = path.join(piNpmDir(agentDir), 'package.json');
  if (!(await pathExists(packagePath))) {
    return { changed: false, action: 'skipped', path: packagePath, reason: 'pi 扩展目录尚未初始化' };
  }

  const manifest = await readJsonObject(packagePath, {});
  const dependencies = { ...(manifest.dependencies ?? {}) };
  let changed = false;
  for (const plugin of plugins) {
    const version = packageVersionFromSource(plugin.spec);
    // 只收紧 catalog 内的包，用户自行安装的其它扩展保持原样。
    if (version && dependencies[plugin.name] !== undefined && dependencies[plugin.name] !== version) {
      dependencies[plugin.name] = version;
      changed = true;
    }
  }

  if (!changed) {
    return { changed: false, action: 'unchanged', path: packagePath };
  }
  await writeJsonObject(packagePath, { ...manifest, dependencies });
  return { changed: true, action: 'updated', path: packagePath };
}

// 同时验证包存在和版本是否就是钉死的那个，能直接暴露 caret 造成的版本漂移。
export async function checkPinnedVersions(plugins, agentDir) {
  const checks = [];
  for (const plugin of plugins) {
    const expected = packageVersionFromSource(plugin.spec);
    const manifest = await readJsonObject(path.join(piPackageDir(plugin.name, agentDir), 'package.json'), {});
    checks.push({
      name: `Pi package ${plugin.name}`,
      ok: manifest.version === expected,
      hint: `Expected ${plugin.name}@${expected}, found ${manifest.version ?? 'nothing'}. Run pitaya update -p pi.`
    });
  }
  return checks;
}
