import path from 'node:path';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { pathExists, readTextIfExists, writeIfChanged, writeTextFile } from '../../lib/files.js';
import { readJsonObject, writeJsonObject } from '../../lib/json.js';
import { packageNameFromSource, packageVersionFromSource, settingsPackageSource } from './catalog.js';
import { piExtensionsDir, piNpmDir, piPackageDir, piSettingsPath } from './paths.js';

const PROVIDER_MANAGER = '@arcaneorion/pi-provider-manager';
const ONNX_PIN = '1.21.0';

const NANO_CONTEXT_FOOTER = /ctx\.ui\.setFooter\(\(_tui,\s*theme,\s*footerData\)\s*=>\s*\(\{[\s\S]*?renderFooter\(pi,\s*ctx,\s*footerData,\s*width,\s*theme\),[\s\S]*?\}\)\);/;
const NANO_CONTEXT_FOOTER_CLEANUP = /ctx\.ui\.setFooter\(undefined\);/;

// onnxruntime-node 1.22+ 的发布包只带 darwin/arm64 二进制，没有 darwin/x64。
// Intel Mac 上不把它压回 1.21.0，magic-context 依赖的 transformers 就加载不起来。
function needsOnnxPin() {
  return process.platform === 'darwin' && process.arch === 'x64';
}

async function readTemplate(packageRoot, fileName) {
  return readFile(path.join(packageRoot, 'templates', 'pi', fileName), 'utf8');
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
    async apply({ agentDir, packageRoot }) {
      const configPath = path.join(piExtensionsDir(agentDir), 'pi-tool-display', 'config.json');
      // 已存在说明用户调过，不覆盖。
      if (await pathExists(configPath)) {
        return { changed: false, action: 'unchanged', path: configPath };
      }
      await writeTextFile(configPath, await readTemplate(packageRoot, 'tool-display-config.json'));
      return { changed: true, action: 'created', path: configPath };
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

  'footer-config': {
    label: 'pi-footer 状态栏布局',
    phase: 'files',
    async apply({ agentDir, packageRoot }) {
      const configPath = path.join(piExtensionsDir(agentDir), 'pi-footer.json');
      // 已存在说明用户在 /footer 里调过，不覆盖。
      if (await pathExists(configPath)) {
        return { changed: false, action: 'unchanged', path: configPath };
      }
      await writeTextFile(configPath, await readTemplate(packageRoot, 'pi-footer.json'));
      return { changed: true, action: 'created', path: configPath };
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

  'onnx-x64-override': {
    label: 'onnxruntime-node 降版 (Intel Mac)',
    phase: 'tree',
    async apply({ agentDir }) {
      const packagePath = path.join(piNpmDir(agentDir), 'package.json');
      if (!needsOnnxPin()) {
        return { changed: false, action: 'skipped', path: packagePath, reason: `仅 darwin/x64 需要，当前 ${process.platform}/${process.arch}` };
      }
      if (!(await pathExists(packagePath))) {
        return { changed: false, action: 'skipped', path: packagePath, reason: 'pi 扩展目录尚未初始化' };
      }

      const manifest = await readJsonObject(packagePath, {});
      const overrides = { ...(manifest.overrides ?? {}) };
      const current = overrides['@huggingface/transformers'];
      if (current?.['onnxruntime-node'] === ONNX_PIN) {
        return { changed: false, action: 'unchanged', path: packagePath };
      }

      overrides['@huggingface/transformers'] = { ...(current ?? {}), 'onnxruntime-node': ONNX_PIN };
      await writeJsonObject(packagePath, { ...manifest, overrides });
      return { changed: true, action: 'updated', path: packagePath };
    },
    async check({ agentDir }) {
      const packagePath = path.join(piNpmDir(agentDir), 'package.json');
      if (!needsOnnxPin()) {
        return { name: 'Pi onnxruntime x64 override', ok: true, hint: `Not required on ${process.platform}/${process.arch}.` };
      }
      const manifest = await readJsonObject(packagePath, {});
      const resolved = await readJsonObject(path.join(piPackageDir('onnxruntime-node', agentDir), 'package.json'), {});
      return {
        name: 'Pi onnxruntime x64 override',
        ok: manifest.overrides?.['@huggingface/transformers']?.['onnxruntime-node'] === ONNX_PIN && resolved.version === ONNX_PIN,
        hint: `onnxruntime-node must be pinned to ${ONNX_PIN} in ${packagePath}; newer releases ship no darwin/x64 binary. Run pitaya update -p pi.`
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
