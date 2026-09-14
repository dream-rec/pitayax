import path from 'node:path';
import process from 'node:process';
import { readFile, chmod } from 'node:fs/promises';
import { readJsonObject, writeJsonObject, pushUniqueByCommand } from '../../lib/json.js';
import { writeIfChanged, readTextIfExists, writeTextFile } from '../../lib/files.js';
import { installCommonPitayaFiles, installManagedBlock, installSelectedSkills } from '../shared.js';
import { installMcpServers } from '../../lib/mcp.js';
import { projectPythonCommand } from '../../lib/runtime.js';

const CODEX_GUARD_MATCHER = 'Bash|Shell|shell|apply_patch|Edit|Write';
// 旧版 dream-wf 以及不同 python 解释器名写入的 hook 命令，更新时统一迁移到当前命令。
const LEGACY_CODEX_GUARD_COMMANDS = [
  'python3 "$CODEX_PROJECT_DIR/.codex/hooks/dream-wf-guard.py"',
  'python3 -X utf8 .codex/hooks/dream-wf-guard.py',
  'python -X utf8 .codex/hooks/dream-wf-guard.py',
  'python3 -X utf8 .codex/hooks/pitaya-guard.py',
  'python -X utf8 .codex/hooks/pitaya-guard.py'
];

// Codex CLI 读取项目根的 AGENTS.md 作为入口规则。
// Codex 支持 PreToolUse 阻塞式 hook，配置在 .codex/hooks.json（和 config.toml [hooks] 段等效）。
// 需要在 config.toml 里加 [features] hooks = true 来启用 hooks 功能。
// hook 脚本放在 .codex/hooks/pitaya-guard.py。
export async function installCodex(packageRoot, targetRoot, options) {
  const results = [];

  results.push(await installManagedBlock(packageRoot, targetRoot, 'templates/rules/codex/pitaya-block.md', 'AGENTS.md', '<!-- PITAYA:START -->', '<!-- PITAYA:END -->'));
  results.push(...await installSelectedSkills(packageRoot, targetRoot, '.codex', options.skills));
  results.push(...await installCommonPitayaFiles(packageRoot, targetRoot));

  if (options.mcps && options.mcps.length > 0) {
    results.push(await installMcpServers(targetRoot, 'codex', options.mcps));
  }

  if (options.mode === 'strict') {
    results.push(await installCodexHook(packageRoot, targetRoot));
    results.push(await ensureCodexHooksFeature(targetRoot));
    results.push(await mergeCodexHooks(targetRoot));
  }

  return results;
}

async function installCodexHook(packageRoot, targetRoot) {
  const sourcePath = path.join(packageRoot, 'templates', 'hooks', 'codex', 'pitaya-guard.py');
  const targetPath = path.join(targetRoot, '.codex', 'hooks', 'pitaya-guard.py');
  const contents = await readFile(sourcePath, 'utf8');
  const result = await writeIfChanged(targetPath, contents);
  if (process.platform !== 'win32') {
    await chmod(targetPath, 0o755);
  }
  return result;
}

// 在 config.toml 里确保 [features] hooks = true 存在。
// 用简单的文本检查实现幂等：如果已有则不动。
async function ensureCodexHooksFeature(rootDir) {
  const configPath = path.join(rootDir, '.codex', 'config.toml');
  const existing = await readTextIfExists(configPath);
  const hasFeature = existing?.includes('hooks = true') || existing?.includes('hooks=true');

  if (hasFeature) {
    return { changed: false, action: 'unchanged', path: configPath };
  }

  const featureBlock = '[features]\nhooks = true\n';
  const prefix = existing && !existing.endsWith('\n') ? `${existing}\n\n` : existing ? `${existing}\n` : '';
  await writeTextFile(configPath, `${prefix}${featureBlock}`);
  return { changed: true, action: existing ? 'updated' : 'created', path: configPath };
}

// Codex hooks.json 格式和 Claude Code 的 settings.json hooks 段一致：
// { "hooks": { "PreToolUse": [ { "matcher": "...", "hooks": [ { "type": "command", "command": "...", "timeout": 10 } ] } ] } }
// Codex 的 matcher 是正则匹配 tool_name，用 Bash|Shell|apply_patch|Edit|Write 匹配变更类工具。
async function mergeCodexHooks(rootDir) {
  const command = projectPythonCommand('.codex/hooks/pitaya-guard.py');
  const hooksPath = path.join(rootDir, '.codex', 'hooks.json');
  const hooks = await readJsonObject(hooksPath, { hooks: {} });
  hooks.hooks = hooks.hooks ?? {};
  hooks.hooks.PreToolUse = hooks.hooks.PreToolUse ?? [];

  const migrated = LEGACY_CODEX_GUARD_COMMANDS.some((legacy) => replaceHookCommand(hooks.hooks.PreToolUse, legacy, command));
  const added = pushUniqueByCommand(hooks.hooks.PreToolUse, {
    matcher: CODEX_GUARD_MATCHER,
    hooks: [
      {
        type: 'command',
        command,
        timeout: 10
      }
    ]
  });
  const changed = migrated || added;

  if (changed) {
    await writeJsonObject(hooksPath, hooks);
  }

  return { changed, action: changed ? 'updated' : 'unchanged', path: hooksPath };
}

function replaceHookCommand(items, oldCommand, newCommand) {
  let changed = false;
  for (const item of items) {
    if (!item || typeof item !== 'object' || !Array.isArray(item.hooks)) {
      continue;
    }

    for (const hook of item.hooks) {
      if (hook?.command === oldCommand && oldCommand !== newCommand) {
        hook.command = newCommand;
        changed = true;
      }
    }
  }
  return changed;
}
