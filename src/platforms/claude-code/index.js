import path from 'node:path';
import process from 'node:process';
import { readFile, chmod } from 'node:fs/promises';
import { readJsonObject, writeJsonObject, pushUniqueByCommand } from '../../lib/json.js';
import { writeIfChanged } from '../../lib/files.js';
import { installCommonPitayaFiles, installManagedBlock, installSelectedSkills } from '../shared.js';
import { retireMcp } from '../../lib/retire.js';
import { projectPythonCommand } from '../../lib/runtime.js';

// 旧版 dream-wf 以及不同 python 解释器名写入的 hook 命令，更新时统一迁移到当前命令。
const LEGACY_CLAUDE_GUARD_COMMANDS = [
  'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/dream-wf-guard.py"',
  'python3 -X utf8 .claude/hooks/dream-wf-guard.py',
  'python -X utf8 .claude/hooks/dream-wf-guard.py',
  'python3 -X utf8 .claude/hooks/pitaya-guard.py',
  'python -X utf8 .claude/hooks/pitaya-guard.py'
];

export async function installClaudeCode(packageRoot, targetRoot, options) {
  const results = [];

  results.push(await installManagedBlock(packageRoot, targetRoot, 'templates/rules/claude-code/pitaya-block.md', 'CLAUDE.md', '<!-- PITAYA:START -->', '<!-- PITAYA:END -->'));
  results.push(...await installSelectedSkills(packageRoot, targetRoot, '.claude', options.skills));
  results.push(...await installCommonPitayaFiles(packageRoot, targetRoot));

  results.push(...await retireMcp(targetRoot, 'claude'));

  if (options.mode === 'strict') {
    results.push(await installClaudeHook(packageRoot, targetRoot));
    results.push(await mergeClaudeSettings(targetRoot));
  }

  return results;
}

async function installClaudeHook(packageRoot, targetRoot) {
  const sourcePath = path.join(packageRoot, 'templates', 'hooks', 'claude-code', 'pitaya-guard.py');
  const targetPath = path.join(targetRoot, '.claude', 'hooks', 'pitaya-guard.py');
  const contents = await readFile(sourcePath, 'utf8');
  const result = await writeIfChanged(targetPath, contents);
  if (process.platform !== 'win32') {
    await chmod(targetPath, 0o755);
  }
  return result;
}

async function mergeClaudeSettings(rootDir) {
  const command = projectPythonCommand('.claude/hooks/pitaya-guard.py');
  const settingsPath = path.join(rootDir, '.claude', 'settings.json');
  const settings = await readJsonObject(settingsPath, {});
  settings.hooks = settings.hooks ?? {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse ?? [];

  const migrated = LEGACY_CLAUDE_GUARD_COMMANDS.some((legacy) => replaceHookCommand(settings.hooks.PreToolUse, legacy, command));
  const added = pushUniqueByCommand(settings.hooks.PreToolUse, {
    matcher: '*',
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
    await writeJsonObject(settingsPath, settings);
  }

  return { changed, action: changed ? 'updated' : 'unchanged', path: settingsPath };
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
