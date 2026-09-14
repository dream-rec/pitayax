import path from 'node:path';
import process from 'node:process';
import { readFile, chmod } from 'node:fs/promises';
import { readJsonObject, writeJsonObject, pushUniqueByCommand } from '../../lib/json.js';
import { writeIfChanged } from '../../lib/files.js';
import { installCommonPitayaFiles, installRuleFile, installSelectedSkills } from '../shared.js';
import { installMcpServers } from '../../lib/mcp.js';

const CURSOR_GUARD_COMMAND = '.cursor/hooks/pitaya-guard.py';
// 旧版 dream-wf 注册的 hook 命令，更新时原位改成当前命令，避免同时挂两个 guard。
const LEGACY_CURSOR_GUARD_COMMANDS = ['.cursor/hooks/dream-wf-guard.py'];

export async function installCursor(packageRoot, targetRoot, options) {
  const results = [];

  results.push(await installRuleFile(packageRoot, targetRoot, 'templates/rules/cursor/pitaya.mdc', '.cursor/rules/pitaya.mdc'));
  results.push(...await installSelectedSkills(packageRoot, targetRoot, '.cursor', options.skills));
  results.push(...await installCommonPitayaFiles(packageRoot, targetRoot));

  if (options.mcps && options.mcps.length > 0) {
    results.push(await installMcpServers(targetRoot, 'cursor', options.mcps));
  }

  if (options.mode === 'strict') {
    results.push(await installCursorHook(packageRoot, targetRoot));
    results.push(await mergeCursorHooks(targetRoot));
  }

  return results;
}

async function installCursorHook(packageRoot, targetRoot) {
  const sourcePath = path.join(packageRoot, 'templates', 'hooks', 'cursor', 'pitaya-guard.py');
  const targetPath = path.join(targetRoot, '.cursor', 'hooks', 'pitaya-guard.py');
  const contents = await readFile(sourcePath, 'utf8');
  const result = await writeIfChanged(targetPath, contents);
  if (process.platform !== 'win32') {
    await chmod(targetPath, 0o755);
  }
  return result;
}

async function mergeCursorHooks(rootDir) {
  const hooksPath = path.join(rootDir, '.cursor', 'hooks.json');
  const hooks = await readJsonObject(hooksPath, { version: 1, hooks: {} });
  hooks.version = hooks.version ?? 1;
  hooks.hooks = hooks.hooks ?? {};
  hooks.hooks.preToolUse = hooks.hooks.preToolUse ?? [];

  let migrated = false;
  for (const item of hooks.hooks.preToolUse) {
    if (item && typeof item === 'object' && LEGACY_CURSOR_GUARD_COMMANDS.includes(item.command)) {
      item.command = CURSOR_GUARD_COMMAND;
      migrated = true;
    }
  }
  const added = pushUniqueByCommand(hooks.hooks.preToolUse, {
    command: CURSOR_GUARD_COMMAND,
    failClosed: true,
    timeout: 10
  });
  const changed = migrated || added;

  if (changed) {
    await writeJsonObject(hooksPath, hooks);
  }

  return { changed, action: changed ? 'updated' : 'unchanged', path: hooksPath };
}
