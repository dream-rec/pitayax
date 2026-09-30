import path from 'node:path';
import process from 'node:process';
import { readdir, readFile } from 'node:fs/promises';
import { backupIfExists, pathExists, readTextIfExists, writeIfChanged, writeTextFile } from '../../lib/files.js';
import { readJsonObject, writeJsonObject } from '../../lib/json.js';
import { packageNameFromSource, packageVersionFromSource, settingsPackageSource } from './catalog.js';
import { inspectMagicContext, magicContextSetupArgs } from './magic-context.js';
import { footerIssues, mergeFooterConfig } from './footer.js';
import { piExtensionsDir, piNpmDir, piPackageDir, piSettingsPath } from './paths.js';
import { runCommand } from '../../lib/runtime.js';

const PROVIDER_MANAGER = '@arcaneorion/pi-provider-manager';

// 旧版本为 Intel Mac 写过 @huggingface/transformers.onnxruntime-node=1.21.0。
const RETIRED_OVERRIDE_PARENT = '@huggingface/transformers';
const RETIRED_OVERRIDE_KEY = 'onnxruntime-node';
const RETIRED_OVERRIDE_PIN = '1.21.0';

const NANO_CONTEXT_FOOTER = /ctx\.ui\.setFooter\(\(_tui,\s*theme,\s*footerData\)\s*=>\s*\(\{[\s\S]*?renderFooter\(pi,\s*ctx,\s*footerData,\s*width,\s*theme\),[\s\S]*?\}\)\);/;
const NANO_CONTEXT_FOOTER_CLEANUP = /ctx\.ui\.setFooter\(undefined\);/;

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
    async check({ agentDir, packageRoot }) {
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
          ok: (await readTextIfExists(shimPath)) === (await readTemplate(packageRoot, 'providers.ts')),
          hint: `Missing or modified ${shimPath}. Run pitaya update -p pi.`
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
      const seeded = await seedConfigFile(ctx, ['pi-footer.json'], 'pi-footer.json');
      if (seeded.changed) return seeded;
      const configPath = path.join(piExtensionsDir(ctx.agentDir), 'pi-footer.json');
      const config = await readJsonObject(configPath, {});
      const template = JSON.parse(await readTemplate(ctx.packageRoot, 'pi-footer.json'));
      const next = mergeFooterConfig(config, template);
      if (JSON.stringify(next) === JSON.stringify(config)) {
        return { changed: false, action: 'unchanged', path: configPath };
      }
      const backup = await backupIfExists(configPath);
      await writeJsonObject(configPath, next);
      return {
        changed: true,
        action: 'updated',
        path: configPath,
        reason: `补齐执行模型图标、顾问行与 tok/s；原配置已备份到 ${path.basename(backup)}`
      };
    },
    async check({ agentDir, packageRoot }) {
      const configPath = path.join(piExtensionsDir(agentDir), 'pi-footer.json');
      if (!(await pathExists(configPath))) {
        return { name: 'Pi footer config', ok: false, hint: `Missing ${configPath}. Run pitaya update -p pi.` };
      }
      const template = JSON.parse(await readTemplate(packageRoot, 'pi-footer.json'));
      const issues = footerIssues(await readJsonObject(configPath, {}), template);
      return {
        name: 'Pi footer config',
        ok: issues.length === 0,
        hint: issues.length ? `${issues.join('、')}。Run pitaya update -p pi.` : '执行模型、顾问行与 tok/s 已对齐模板。'
      };
    }
  },

  'footer-tps': {
    label: 'pi-footer tok/s 扩展',
    phase: 'files',
    async apply({ agentDir, packageRoot }) {
      const target = path.join(piExtensionsDir(agentDir), 'tps.ts');
      return writeIfChanged(target, await readTemplate(packageRoot, 'tps.ts'));
    },
    async check({ agentDir, packageRoot }) {
      const target = path.join(piExtensionsDir(agentDir), 'tps.ts');
      return {
        name: 'Pi footer tok/s extension',
        ok: (await readTextIfExists(target))?.trimEnd() === (await readTemplate(packageRoot, 'tps.ts')).trimEnd(),
        hint: `Missing or modified ${target}. Run pitaya update -p pi.`
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
      const stale = manifest.overrides?.[RETIRED_OVERRIDE_PARENT]?.[RETIRED_OVERRIDE_KEY] === RETIRED_OVERRIDE_PIN;
      return {
        name: 'Pi retired onnxruntime override',
        ok: !stale,
        hint: stale ? `Stale overrides entry ${RETIRED_OVERRIDE_PARENT}.${RETIRED_OVERRIDE_KEY}=${RETIRED_OVERRIDE_PIN} in ${packagePath}; newer magic-context needs no such pin. Run pitaya update -p pi.` : 'No retired onnxruntime override.'
      };
    }
  },

  // 插件本体没配好会故障安全地保持关闭：historian/dreamer 模型、embedding 都是 setup 向导写的。
  // 这里只做结构检测，缺配置时把上游向导原样拉起来，不自己编配置。
  'magic-context-setup': {
    label: 'magic-context 配置向导',
    phase: 'files',
    async apply({ rootDir = process.cwd(), env, plugin }) {
      const before = await inspectMagicContext(rootDir, env);
      if (before.ok) return { changed: false, action: 'unchanged', path: before.source };
      if (!(process.stdin.isTTY && process.stdout.isTTY)) {
        return {
          changed: false,
          action: 'skipped',
          path: before.source,
          reason: `${before.issues.join('、')}；需在交互式终端运行 npx ${magicContextSetupArgs(plugin.setup).join(' ')}`
        };
      }

      runCommand('npx', magicContextSetupArgs(plugin.setup));
      const after = await inspectMagicContext(rootDir, env);
      return after.ok
        ? { changed: true, action: 'configured', path: after.source, reason: '已通过 setup 向导写入配置' }
        : { changed: false, action: 'skipped', path: after.source, reason: `向导结束后仍缺少：${after.issues.join('、')}` };
    },
    async check({ rootDir = process.cwd(), env, plugin }) {
      const state = await inspectMagicContext(rootDir, env);
      return {
        name: 'Pi magic-context setup',
        ok: state.ok,
        hint: state.ok
          ? 'historian、dreamer、embedding 均已配置。'
          : `${state.issues.join('、')}。Run pitaya update -p pi（交互式向导）或 npx ${magicContextSetupArgs(plugin.setup).join(' ')}。`
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
// 的最新版（实测 @cortexkit/aft-pi@0.57.0 会装成 0.57.2）。settings.json 里的钉版本只能
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
// npm 侧的范围也要是精确版本：pinExactVersions 每次都收紧，范围退回 caret 说明被 pi install 动过。
export async function checkPinnedVersions(plugins, agentDir) {
  const range = (await readJsonObject(path.join(piNpmDir(agentDir), 'package.json'), {})).dependencies ?? {};
  const checks = [];
  for (const plugin of plugins) {
    const expected = packageVersionFromSource(plugin.spec);
    const manifest = await readJsonObject(path.join(piPackageDir(plugin.name, agentDir), 'package.json'), {});
    const declared = range[plugin.name];
    checks.push({
      name: `Pi package ${plugin.name}`,
      ok: manifest.version === expected && (declared === undefined || declared === expected),
      hint: `Expected ${plugin.name}@${expected} with an exact npm range, found ${manifest.version ?? 'nothing'} / ${declared ?? 'undeclared'}. Run pitaya update -p pi.`
    });
  }
  return checks;
}
