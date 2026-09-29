import path from 'node:path';
import { readdir, rm, rmdir } from 'node:fs/promises';
import { pathExists, readTextIfExists, writeTextFile } from './files.js';
import { writeJsonObject } from './json.js';

const RETIRED = new Set(['fast-context', 'grok-search', 'fast-context-mcp', 'grok-search-mcp']);
const CONFIG_PATHS = {
  pi: ['.mcp.json'],
  claude: ['.mcp.json', '.claude.json'],
  cursor: ['.cursor/mcp.json'],
  opencode: ['opencode.json'],
  codex: ['.codex/config.toml']
};
const SKILL_DIRS = {
  pi: '.agents',
  claude: '.claude',
  cursor: '.cursor',
  opencode: '.opencode',
  codex: '.codex'
};

export async function retireMcp(rootDir, platform) {
  const results = [];
  for (const relative of CONFIG_PATHS[platform] ?? []) {
    results.push(await retireMcpConfig(path.join(rootDir, relative)));
  }
  const skillDir = SKILL_DIRS[platform];
  if (skillDir) {
    results.push(await retireFile(path.join(rootDir, skillDir, 'skills', 'pitaya-mcp-policy', 'SKILL.md'), 'name: pitaya-mcp-policy'));
  }
  results.push(await retireFile(path.join(rootDir, '.trellis', 'spec', 'guides', 'pitaya-mcp-policy.md'), '# Pitaya MCP Policy'));
  return results;
}

export async function retireMcpConfig(file) {
  const source = await readTextIfExists(file);
  if (source === undefined) return { changed: false, action: 'skipped', path: file };

  if (file.endsWith('.toml')) {
    const lines = source.split('\n');
    const next = [];
    let skip = false;
    for (const line of lines) {
      const heading = /^\s*\[mcp_servers\.([^\].]+)(?:\.[^\]]+)?\]\s*(?:#.*)?$/.exec(line);
      if (heading) {
        skip = RETIRED.has(heading[1]);
      } else if (/^\s*\[/.test(line)) {
        skip = false;
      }
      if (!skip) next.push(line);
    }
    const text = next.join('\n');
    if (text === source) return { changed: false, action: 'unchanged', path: file };
    await writeTextFile(file, text);
    return { changed: true, action: 'updated', path: file };
  }

  const config = JSON.parse(source);
  const servers = file.endsWith('opencode.json') ? config.mcp?.servers ?? config.mcp : config.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    return { changed: false, action: 'unchanged', path: file };
  }
  const removed = [...RETIRED].filter((name) => Object.hasOwn(servers, name));
  if (removed.length === 0) return { changed: false, action: 'unchanged', path: file };
  for (const name of removed) delete servers[name];
  await writeJsonObject(file, config);
  return { changed: true, action: 'updated', path: file, reason: `移除 ${removed.join(', ')}` };
}

async function retireFile(file, marker) {
  const previous = await readTextIfExists(file);
  if (previous === undefined) return { changed: false, action: 'skipped', path: file };
  const text = previous.trim();
  const owned = file.endsWith('SKILL.md')
    ? text.startsWith('---') && /^name:\s*pitaya-mcp-policy\s*$/m.test(text.split('---', 3)[1] ?? '')
    : text.startsWith(marker);
  if (!owned) return { changed: false, action: 'skipped', path: file, reason: '非 Pitaya 文件，保留' };
  await rm(file);
  if (file.endsWith('SKILL.md')) {
    const dir = path.dirname(file);
    if ((await readdir(dir)).length === 0) await rmdir(dir);
  }
  return { changed: true, action: 'removed', path: file };
}

export async function checkRetiredMcp(rootDir, platform) {
  const remaining = [];
  for (const relative of CONFIG_PATHS[platform] ?? []) {
    const file = path.join(rootDir, relative);
    const text = await readTextIfExists(file);
    if (text === undefined) continue;
    if (file.endsWith('.toml')) {
      for (const match of text.matchAll(/^\s*\[mcp_servers\.([^\].]+)(?:\.[^\]]+)?\]/gm)) {
        if (RETIRED.has(match[1])) remaining.push(`${relative}:${match[1]}`);
      }
    } else {
      const config = JSON.parse(text);
      const servers = file.endsWith('opencode.json') ? config.mcp?.servers ?? config.mcp : config.mcpServers;
      for (const name of Object.keys(servers ?? {})) {
        if (RETIRED.has(name)) remaining.push(`${relative}:${name}`);
      }
    }
  }
  const skill = SKILL_DIRS[platform];
  if (skill && await pathExists(path.join(rootDir, skill, 'skills', 'pitaya-mcp-policy', 'SKILL.md'))) {
    remaining.push(`${skill}/skills/pitaya-mcp-policy`);
  }
  if (await pathExists(path.join(rootDir, '.trellis/spec/guides/pitaya-mcp-policy.md'))) {
    remaining.push('.trellis/spec/guides/pitaya-mcp-policy.md');
  }
  return {
    name: 'Retired Pitaya MCP artifacts',
    ok: remaining.length === 0,
    hint: remaining.length === 0 ? 'No retired Pitaya MCP artifacts.' : `${remaining.join(', ')}; run pitaya update -p ${platform}.`
  };
}

export async function checkRetiredMcpConfig(file) {
  const text = await readTextIfExists(file);
  if (text === undefined) return { name: 'Retired Pi MCP servers', ok: true, hint: 'No adapter config.' };
  const config = JSON.parse(text);
  const names = Object.keys(config.mcpServers ?? {}).filter((name) => RETIRED.has(name));
  return {
    name: 'Retired Pi MCP servers',
    ok: names.length === 0,
    hint: names.length === 0 ? 'No retired server in adapter config.' : `${names.join(', ')} remains in ${file}; run pitaya update -p pi.`
  };
}
