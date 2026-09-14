import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { writeIfChanged } from '../../lib/files.js';
import { installCommonPitayaFiles, installManagedBlock, installSelectedSkills } from '../shared.js';
import { installMcpServers } from '../../lib/mcp.js';

export async function installOpenCode(packageRoot, targetRoot, options) {
  const results = [];

  results.push(await installManagedBlock(packageRoot, targetRoot, 'templates/rules/opencode/pitaya-block.md', 'AGENTS.md', '<!-- PITAYA:START -->', '<!-- PITAYA:END -->'));
  results.push(...await installSelectedSkills(packageRoot, targetRoot, '.opencode', options.skills));
  results.push(...await installCommonPitayaFiles(packageRoot, targetRoot));

  if (options.mcps && options.mcps.length > 0) {
    results.push(await installMcpServers(targetRoot, 'opencode', options.mcps));
  }

  if (options.mode === 'strict') {
    results.push(await installOpenCodePlugin(packageRoot, targetRoot));
  }

  return results;
}

async function installOpenCodePlugin(packageRoot, targetRoot) {
  const sourcePath = path.join(packageRoot, 'templates', 'hooks', 'opencode', 'pitaya-guard.js');
  const targetPath = path.join(targetRoot, '.opencode', 'plugins', 'pitaya-guard.js');
  const contents = await readFile(sourcePath, 'utf8');
  return writeIfChanged(targetPath, contents);
}
