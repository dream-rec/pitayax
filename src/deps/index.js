import path from 'node:path';
import process from 'node:process';
import { pathExists, readTextIfExists } from '../lib/files.js';
import { commandExists, pythonCommand, runCommand } from '../lib/runtime.js';
import { checkRetiredMcp, checkRetiredMcpConfig } from '../lib/retire.js';
import { fileURLToPath } from 'node:url';
import { PI_RETIRED_PACKAGES, readInstalledPluginIds, readRegisteredPackageNames, resolvePiPlugins } from '../platforms/pi/catalog.js';
import { checkPinnedVersions, checkRepairs } from '../platforms/pi/repairs.js';
import { piAgentDir, piSettingsPath } from '../platforms/pi/paths.js';
import { PI_CLI } from '../platforms/pi/index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function checkDependencies(rootDir, platform) {
  const checks = [];

  checks.push(binaryCheck('node', 'Node.js >= 18 is required.'));
  if (platform === 'pi') {
    checks.push(binaryCheck('pi', `Install with: npm install -g --ignore-scripts ${PI_CLI}`));
    checks.push(binaryCheck('trellis', 'Install with: npm install -g @mindfoldhq/trellis@latest'));

    // 以 settings.json 里实际登记的包为准，用户没选装的插件不会被误报成缺失。
    const agentDir = piAgentDir();
    const plugins = resolvePiPlugins(await readInstalledPluginIds(agentDir));
    if (plugins.length === 0) {
      checks.push({
        name: 'Pi plugins',
        ok: false,
        hint: `No pitaya Pi plugins registered in ${piSettingsPath(agentDir)}. Run pitaya init -p pi.`
      });
    }
    checks.push(...await checkPinnedVersions(plugins, agentDir));
    checks.push(...await checkRepairs(plugins, { agentDir, packageRoot }));

    const registered = await readRegisteredPackageNames(agentDir);
    const retired = PI_RETIRED_PACKAGES.filter((name) => registered.has(name));
    checks.push({
      name: 'Pi retired packages',
      ok: retired.length === 0,
      hint: retired.length === 0 ? 'No retired Pi packages.' : `${retired.join(', ')} still registered in ${piSettingsPath(agentDir)}. Run pitaya update -p pi to remove.`
    });

    checks.push(await fileCheck(path.join(rootDir, '.trellis'), 'Trellis project directory'));
    checks.push(await fileCheck(path.join(rootDir, '.pi', 'extensions', 'trellis', 'index.ts'), 'Trellis Pi extension'));
    checks.push(await contentCheck(path.join(rootDir, 'AGENTS.md'), '<!-- PITAYA:START -->', 'Pi pitaya entry block'));
    checks.push(await fileCheck(path.join(rootDir, '.agents', 'skills', 'pitaya-grill-prd', 'SKILL.md'), 'Pi pitaya grill PRD skill'));
    checks.push(await checkRetiredMcp(rootDir, 'pi'));
    checks.push(await checkRetiredMcpConfig(path.join(agentDir, 'mcp-adapter.json')));
    checks.push(await secretScan(rootDir));
    return checks;
  }

  checks.push(pythonCheck());
  checks.push(binaryCheck('trellis', 'Install with: npm install -g @mindfoldhq/trellis@latest'));

  checks.push(await fileCheck(path.join(rootDir, '.trellis'), 'Trellis project directory'));
  checks.push(await fileCheck(path.join(rootDir, '.trellis', 'workflow.md'), 'Trellis workflow'));

  if (platform === 'cursor') {
    checks.push(await fileCheck(path.join(rootDir, '.cursor', 'rules', 'pitaya.mdc'), 'Cursor pitaya always-on rule'));
    checks.push(await fileCheck(path.join(rootDir, '.cursor', 'skills', 'pitaya-grill-prd', 'SKILL.md'), 'Cursor pitaya grill PRD skill'));
    checks.push(await checkRetiredMcp(rootDir, 'cursor'));
  }

  if (platform === 'claude') {
    checks.push(await contentCheck(path.join(rootDir, 'CLAUDE.md'), '<!-- PITAYA:START -->', 'Claude Code pitaya entry block'));
    checks.push(await fileCheck(path.join(rootDir, '.claude', 'skills', 'pitaya-grill-prd', 'SKILL.md'), 'Claude Code pitaya grill PRD skill'));
    checks.push(await checkRetiredMcp(rootDir, 'claude'));
  }

  if (platform === 'opencode') {
    checks.push(await contentCheck(path.join(rootDir, 'AGENTS.md'), '<!-- PITAYA:START -->', 'OpenCode pitaya entry block'));
    checks.push(await fileCheck(path.join(rootDir, '.opencode', 'skills', 'pitaya-grill-prd', 'SKILL.md'), 'OpenCode pitaya grill PRD skill'));
    checks.push(await checkRetiredMcp(rootDir, 'opencode'));
  }

  if (platform === 'codex') {
    checks.push(await contentCheck(path.join(rootDir, 'AGENTS.md'), '<!-- PITAYA:START -->', 'Codex pitaya entry block'));
    checks.push(await fileCheck(path.join(rootDir, '.codex', 'skills', 'pitaya-grill-prd', 'SKILL.md'), 'Codex pitaya grill PRD skill'));
    checks.push(await fileCheck(path.join(rootDir, '.codex', 'hooks', 'pitaya-guard.py'), 'Codex pitaya guard hook'));
    checks.push(await contentCheck(path.join(rootDir, '.codex', 'hooks.json'), 'pitaya-guard.py', 'Codex hooks.json registration'));
    checks.push(await contentCheck(path.join(rootDir, '.codex', 'config.toml'), 'hooks = true', 'Codex hooks feature enabled'));
    checks.push(await checkRetiredMcp(rootDir, 'codex'));
  }

  checks.push(await secretScan(rootDir));

  return checks;
}

function binaryCheck(command, hint) {
  return {
    name: command,
    ok: commandExists(command),
    hint
  };
}

function pythonCheck() {
  const command = pythonCommand();
  return {
    name: 'python',
    ok: Boolean(command),
    hint: process.platform === 'win32'
      ? 'Python >= 3.9 is required. Install it and enable Add python.exe to PATH.'
      : 'Python >= 3.9 is required. Install python3.'
  };
}

async function fileCheck(filePath, label) {
  return {
    name: label,
    ok: await pathExists(filePath),
    hint: `Missing ${filePath}`
  };
}

async function contentCheck(filePath, needle, label) {
  const text = await readTextIfExists(filePath);
  return {
    name: label,
    ok: Boolean(text?.includes(needle)),
    hint: `Missing ${needle} in ${filePath}`
  };
}

async function secretScan(rootDir) {
  const boardPath = path.join(rootDir, 'board.md');
  const text = await readTextIfExists(boardPath);
  if (!text) {
    return { name: 'secret scan', ok: true, hint: 'No obvious project secret sample file found.' };
  }

  const suspicious = [
    /(?:API_KEY|SECRET|TOKEN)\s*[:=]\s*\S+/,
    /(?:sk-[A-Za-z0-9_-]{16,}|tvly-[A-Za-z0-9_-]+)/
  ];

  const hasSuspiciousContent = suspicious.some((pattern) => pattern.test(text));
  return {
    name: 'secret scan',
    ok: !hasSuspiciousContent,
    hint: hasSuspiciousContent ? 'Potential secrets found in board.md. Do not commit real API keys.' : 'No obvious secrets detected.'
  };
}

export function installTrellisIfRequested() {
  runCommand('npm', ['install', '-g', '@mindfoldhq/trellis@latest']);
}
