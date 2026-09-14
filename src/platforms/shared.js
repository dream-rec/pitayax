import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readTextIfExists, writeIfChanged, writeTextFile } from '../lib/files.js';

export async function installSkill(packageRoot, targetRoot, platformDir, skillName) {
  const sourcePath = path.join(packageRoot, 'templates', 'skills', skillName, 'SKILL.md');
  const targetPath = path.join(targetRoot, platformDir, 'skills', skillName, 'SKILL.md');
  const contents = await readFile(sourcePath, 'utf8');
  return writeIfChanged(targetPath, contents);
}

// 按 catalog 选中的 skill 条目安装。skills 为 resolveSkills 返回的数组。
// 若 skills 为 undefined，则安装全部（向后兼容旧 CLI 行为）。
export async function installSelectedSkills(packageRoot, targetRoot, platformDir, skills) {
  const list = skills ?? [];
  const results = [];
  for (const skill of list) {
    results.push(await installSkill(packageRoot, targetRoot, platformDir, skill.name));
  }
  return results;
}

export async function installSpecGuide(packageRoot, targetRoot, fileName) {
  const sourcePath = path.join(packageRoot, 'templates', 'spec', 'guides', fileName);
  const targetPath = path.join(targetRoot, '.trellis', 'spec', 'guides', fileName);
  const contents = await readFile(sourcePath, 'utf8');
  return writeIfChanged(targetPath, contents);
}

export async function installCommonPitayaFiles(packageRoot, targetRoot) {
  return [
    await installSpecGuide(packageRoot, targetRoot, 'pitaya-prd-policy.md'),
    await installSpecGuide(packageRoot, targetRoot, 'pitaya-mcp-policy.md')
  ];
}

export async function installRuleFile(packageRoot, targetRoot, sourceRelativePath, targetRelativePath) {
  const contents = await readFile(path.join(packageRoot, sourceRelativePath), 'utf8');
  return writeIfChanged(path.join(targetRoot, targetRelativePath), contents);
}

// 旧版 dream-wf 写入的区块标记，更新时原位替换成新区块，避免同一文件出现两份入口。
const LEGACY_BLOCK_MARKERS = [['<!-- DREAM-WF:START -->', '<!-- DREAM-WF:END -->']];

function locateBlock(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  return { start, end: end + endMarker.length };
}

export async function installManagedBlock(packageRoot, targetRoot, sourceRelativePath, targetRelativePath, startMarker, endMarker) {
  const block = await readFile(path.join(packageRoot, sourceRelativePath), 'utf8');
  const targetPath = path.join(targetRoot, targetRelativePath);
  const existing = await readTextIfExists(targetPath);

  if (!existing) {
    await writeTextFile(targetPath, block);
    return { changed: true, action: 'created', path: targetPath };
  }

  const range = locateBlock(existing, startMarker, endMarker)
    ?? LEGACY_BLOCK_MARKERS.map(([legacyStart, legacyEnd]) => locateBlock(existing, legacyStart, legacyEnd)).find(Boolean);
  const next = range
    ? `${existing.slice(0, range.start)}${block.trim()}${existing.slice(range.end)}`
    : `${existing.trimEnd()}\n\n${block.trim()}\n`;

  if (next === existing) {
    return { changed: false, action: 'unchanged', path: targetPath };
  }

  await writeTextFile(targetPath, next);
  return { changed: true, action: 'updated', path: targetPath };
}
