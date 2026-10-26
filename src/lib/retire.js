import path from 'node:path';
import { readTextIfExists, writeTextFile } from './files.js';
import { writeJsonObject } from './json.js';

// 旧安装器写过 MCP server 配置；这些 server 已退役，init/update 时清掉，
// 但只删这几个键，不影响用户自己添加的其它 server。
const RETIRED = new Set(['fast-context', 'grok-search', 'fast-context-mcp', 'grok-search-mcp']);

export async function retireMcp(rootDir) {
  return [await retireMcpConfig(path.join(rootDir, '.mcp.json'))];
}

export async function retireMcpConfig(file) {
  const source = await readTextIfExists(file);
  if (source === undefined) return { changed: false, action: 'skipped', path: file };

  const config = JSON.parse(source);
  const servers = config.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    return { changed: false, action: 'unchanged', path: file };
  }
  const removed = [...RETIRED].filter((name) => Object.hasOwn(servers, name));
  if (removed.length === 0) return { changed: false, action: 'unchanged', path: file };
  for (const name of removed) delete servers[name];
  await writeJsonObject(file, config);
  return { changed: true, action: 'updated', path: file, reason: `移除 ${removed.join(', ')}` };
}

export async function checkRetiredMcp(rootDir) {
  return checkRetiredMcpConfig(path.join(rootDir, '.mcp.json'));
}

export async function checkRetiredMcpConfig(file) {
  const text = await readTextIfExists(file);
  if (text === undefined) return { name: 'Retired Pi MCP servers', ok: true, hint: 'No MCP config.' };
  const config = JSON.parse(text);
  const names = Object.keys(config.mcpServers ?? {}).filter((name) => RETIRED.has(name));
  return {
    name: 'Retired Pi MCP servers',
    ok: names.length === 0,
    hint: names.length === 0 ? 'No retired server in MCP config.' : `${names.join(', ')} remains in ${file}; run pitaya update.`
  };
}
