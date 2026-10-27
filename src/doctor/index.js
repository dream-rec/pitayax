import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandExists } from '../lib/runtime.js';
import { checkRetiredMcp, checkRetiredMcpConfig } from '../lib/retire.js';
import {
  PI_RETIRED_PACKAGES,
  readInstalledPluginIds,
  readRegisteredPackageNames,
  resolvePiPlugins
} from '../pi/catalog.js';
import { checkPinnedVersions, checkRepairs } from '../pi/repairs.js';
import { piAgentDir, piSettingsPath } from '../pi/paths.js';
import { PI_CLI } from '../pi/catalog.js';
import { checkAppendSystem, piCliVersionMatches, retiredExtensionPaths } from '../pi/index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function runDoctor(rootDir) {
  const agentDir = piAgentDir();
  const checks = [
    binaryCheck('node', 'Node.js >= 18 is required.'),
    binaryCheck('pi', `Install with: npm install -g --ignore-scripts ${PI_CLI}`),
    {
      name: 'Pi CLI version',
      ok: piCliVersionMatches(),
      hint: `Expected ${PI_CLI}. Run pitaya update.`
    }
  ];

  // 以 settings.json 里实际登记的包为准，用户没选装的插件不会被误报成缺失。
  const plugins = resolvePiPlugins(await readInstalledPluginIds(agentDir));
  if (plugins.length === 0) {
    checks.push({
      name: 'Pi plugins',
      ok: false,
      hint: `No pitaya Pi plugins registered in ${piSettingsPath(agentDir)}. Run pitaya init.`
    });
  }
  checks.push(...await checkPinnedVersions(plugins, agentDir));
  checks.push(...await checkRepairs(plugins, { agentDir, packageRoot, rootDir }));
  checks.push(await checkAppendSystem(packageRoot, agentDir));

  const registered = await readRegisteredPackageNames(agentDir);
  const retired = PI_RETIRED_PACKAGES.filter((name) => registered.has(name));
  checks.push({
    name: 'Pi retired packages',
    ok: retired.length === 0,
    hint: retired.length === 0 ? 'No retired Pi packages.' : `${retired.join(', ')} still registered in ${piSettingsPath(agentDir)}. Run pitaya update to remove.`
  });

  const retiredExtensions = await retiredExtensionPaths(agentDir);
  checks.push({
    name: 'Pi retired extension shims',
    ok: retiredExtensions.length === 0,
    hint: retiredExtensions.length === 0
      ? 'No retired extension shims.'
      : `${retiredExtensions.join(', ')} still loads beside tool-backend and registers the same tools. Run pitaya update.`
  });

  checks.push(await checkRetiredMcp(rootDir));
  const adapter = await checkRetiredMcpConfig(path.join(agentDir, 'mcp-adapter.json'));
  checks.push({ ...adapter, name: 'Retired Pi MCP adapter servers' });
  return { ok: checks.every((check) => check.ok), checks };
}

function binaryCheck(command, hint) {
  return { name: command, ok: commandExists(command), hint };
}

export function formatDoctorReport(report) {
  const lines = [`pitaya doctor: ${report.ok ? 'ok' : 'issues found'}`];
  for (const check of report.checks) {
    lines.push(`${check.ok ? '✓' : '✗'} ${check.name}${check.ok ? '' : ` — ${check.hint}`}`);
  }
  return lines.join('\n');
}
