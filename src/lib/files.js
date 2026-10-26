import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath) {
  if (!(await pathExists(filePath))) {
    return undefined;
  }
  return readFile(filePath, 'utf8');
}

export async function writeTextFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function writeIfChanged(filePath, contents) {
  const current = await readTextIfExists(filePath);
  if (current === contents) {
    return { changed: false, action: 'unchanged', path: filePath };
  }

  await writeTextFile(filePath, contents);
  return { changed: true, action: current === undefined ? 'created' : 'updated', path: filePath };
}

export async function backupIfExists(filePath) {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  const backupPath = `${filePath}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await copyFile(filePath, backupPath);
  return backupPath;
}

export function formatRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath) || '.';
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

export async function installManagedBlock(packageRoot, targetRoot, sourceRelativePath, targetRelativePath, startMarker, endMarker, options = {}) {
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
    : options.wrapExisting
      ? `${startMarker}\n\n${existing.trim()}\n\n${endMarker}\n`
      : `${existing.trimEnd()}\n\n${block.trim()}\n`;

  if (next === existing) {
    return { changed: false, action: 'unchanged', path: targetPath };
  }

  await writeTextFile(targetPath, next);
  return { changed: true, action: 'updated', path: targetPath };
}
