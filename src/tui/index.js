import process from 'node:process';
import { readFileSync } from 'node:fs';

import { PI_CLI, PI_PLUGIN_CATALOG, defaultPiPluginIds } from '../pi/catalog.js';
import { formatBanner, formatBannerLine } from './banner.js';
import {
  dim,
  paint,
  palette,
  bold as boldText,
  padRight,
  truncate,
  visibleWidth,
  wrap
} from './theme.js';

const packageVersion = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

const NON_TTY_HINT =
  '交互式安装需要真实终端；CI、管道或不支持 raw mode 的控制台请使用 pitaya init --pi-plugins <id,id,...>。';

let screenActive = false;

function enterScreen() {
  if (screenActive || !process.stdout.isTTY) return;
  screenActive = true;
  process.stdout.write('\u001B[?1049h\u001B[?25l');
  process.once('exit', leaveScreen);
}

function leaveScreen() {
  if (!screenActive) return;
  screenActive = false;
  process.stdout.write('\u001B[?25h\u001B[?1049l');
}

function clearFrame() {
  process.stdout.write('\u001B[H\u001B[2J');
}

function draw(lines) {
  clearFrame();
  process.stdout.write(lines.join('\n'));
}

function terminalSize() {
  return {
    columns: Math.max(60, process.stdout.columns ?? 80),
    rows: Math.max(18, process.stdout.rows ?? 24)
  };
}

function contentWidth() {
  return Math.min(88, terminalSize().columns - 2);
}

function boxTop(title, width) {
  const label = `─[ ${title} ]`;
  const fill = '─'.repeat(Math.max(0, width - visibleWidth(label) - 1));
  return paint(palette.pink, `╭${label}${fill}╮`);
}

function boxBottom(width) {
  return paint(palette.pink, `╰${'─'.repeat(width - 2)}╯`);
}

function boxLine(text, width) {
  const inner = width - 4;
  return `${paint(palette.pink, '│')} ${padRight(truncate(text, inner), inner)} ${paint(palette.pink, '│')}`;
}

function box(title, lines, width) {
  return [
    boxTop(title, width),
    ...lines.map((line) => boxLine(line, width)),
    boxBottom(width)
  ];
}

function shortTag(plugin) {
  return /\(([^)]+)\)/.exec(plugin.label)?.[1] ?? '';
}

function pluginRow(plugin, { active, selected, width, nameWidth }) {
  const pointer = active ? paint(palette.cyan, '▸') : ' ';
  const mark = selected ? paint(palette.green, '[x]') : dim('[ ]');
  const name = padRight(truncate(plugin.name, nameWidth), nameWidth);
  const paintedName = active ? paint(palette.bold, paint(palette.white, name)) : paint(palette.gray, name);
  const remaining = Math.max(0, width - 4 - 3 - nameWidth - 2);
  const tag = truncate(shortTag(plugin), remaining);
  return `${pointer} ${mark} ${paintedName} ${dim(tag)}`;
}

function detailLines(plugin, width) {
  if (!plugin) return [dim('NO MODULE SELECTED')];
  const inner = width - 4;
  const lines = [paint(palette.yellow, truncate(plugin.label, inner))];
  lines.push(...wrap(plugin.description, inner, 2).map((line) => dim(line)));
  return lines.slice(0, 2);
}

function headerLines(selectedCount, total, width, version, rows) {
  const lines = [];
  const banner = rows >= 32 ? formatBanner(version) : [formatBannerLine(version)];
  lines.push(...banner.map((line) => `  ${line}`));
  lines.push('');
  lines.push(
    ...box('PITAYAX // PI BOOTSTRAP', [
      ` ${boldText('从一台机器到另一台，把磨合好的 Pi 工作流原样带走。')}`,
      ` ${dim('PINNED BUILD')}  ${paint(palette.green, 'NO DRIFT')}    ${dim('TARGET')}  ~/.pi/agent`,
      ` ${paint(palette.green, 'LOADOUT')}  ${selectedCount}/${total} selected    ${dim('MODE')}  INTERACTIVE`
    ], width)
  );
  return lines;
}

function footerLines() {
  return [
    `  ${paint(palette.green, '↑↓')} MOVE   ${paint(palette.green, 'SPACE')} TOGGLE   ${paint(
      palette.green,
      'A'
    )} ALL   ${paint(palette.green, 'ENTER')} CONFIRM   ${paint(palette.green, 'Q')} QUIT`,
    `  ${dim('ctrl+c quit  ·  pinned versions  ·  machine-local config stays local')}`
  ];
}

function readKeystroke() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error(NON_TTY_HINT);
  }
  return new Promise((resolve) => {
    let buffer = '';

    function finish() {
      process.stdin.removeListener('data', onRaw);
      resolve(buffer);
    }

    function onRaw(data) {
      buffer += data.toString();
      if (buffer.length === 1) {
        if (buffer === '\u001B') return;
        finish();
        return;
      }
      if (buffer.length >= 3 && buffer.startsWith('\u001B')) {
        finish();
        return;
      }
      if (buffer.length > 8) {
        finish();
      }
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onRaw);
  });
}

function stopRaw() {
  if (typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.stdin.removeAllListeners('data');
}

function quit(message) {
  stopRaw();
  leaveScreen();
  process.stdout.write(`${message}\n`);
  process.exit(0);
}

async function multiSelect({ items, defaults }) {
  let cursor = 0;
  let offset = 0;
  const selected = new Set(defaults);

  function render() {
    const { rows } = terminalSize();
    const width = contentWidth();
    const detail = rows >= 24 ? 4 : 0;
    const bannerHeight = rows >= 32 ? 7 : 1;
    const fixed = bannerHeight + 1 + 4 + 1 + 2 + (detail ? 1 + detail : 0) + 1 + 2;
    // 留一行余量：写到最后一格时终端会滚动，把 banner 顶出去。
    const visible = Math.max(3, rows - fixed - 1);

    if (cursor < offset) offset = cursor;
    if (cursor >= offset + visible) offset = cursor - visible + 1;
    offset = Math.max(0, Math.min(offset, Math.max(0, items.length - visible)));

    const end = Math.min(items.length, offset + visible);
    const range = items.length > visible ? ` ${offset + 1}-${end}/${items.length}` : ` ${items.length}`;
    const lines = headerLines(selected.size, items.length, width, packageVersion, rows);
    lines.push('');

    const nameWidth = Math.min(
      34,
      Math.max(...items.map((item) => visibleWidth(item.name)), 12)
    );
    const listLines = [];
    for (let index = offset; index < end; index += 1) {
      listLines.push(
        pluginRow(items[index], {
          active: index === cursor,
          selected: selected.has(items[index].id),
          width,
          nameWidth
        })
      );
    }
    while (listLines.length < visible) listLines.push('');
    lines.push(...box(`STEP 01 // SELECT MODULES${range}`, listLines, width));

    if (detail) {
      lines.push('');
      lines.push(...box('DETAIL // CURRENT MODULE', detailLines(items[cursor], width), width));
    }

    lines.push('');
    lines.push(...footerLines());
    draw(lines);
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === '\u0003') quit('已取消');
    if (key === 'q' || key === 'Q') quit('已退出');
    if (key === '\u001B[A' || key === 'k') {
      cursor = (cursor - 1 + items.length) % items.length;
      continue;
    }
    if (key === '\u001B[B' || key === 'j') {
      cursor = (cursor + 1) % items.length;
      continue;
    }
    if (key === ' ') {
      const item = items[cursor];
      if (selected.has(item.id)) selected.delete(item.id);
      else selected.add(item.id);
      continue;
    }
    if (key === 'a' || key === 'A') {
      if (selected.size === items.length) selected.clear();
      else items.forEach((item) => selected.add(item.id));
      continue;
    }
    if (key === '\r' || key === '\n') {
      stopRaw();
      return [...selected];
    }
  }
}

function renderSummary(plugins, width) {
  const names = plugins.length > 0 ? plugins.map((plugin) => plugin.name).join(', ') : '(none)';
  const lines = [
    ` ${paint(palette.gray, 'PI CLI')}     ${paint(palette.white, PI_CLI.split('@').at(-1))}`,
    ` ${paint(palette.gray, 'MODULES')}    ${paint(palette.green, String(plugins.length))}`,
    ` ${paint(palette.gray, 'CONFIG')}     ${dim('APPEND_SYSTEM / footer / tool backend / patches')}`,
    ` ${paint(palette.gray, 'SELECTED')}   ${dim(truncate(names, width - 16))}`
  ];
  return box('STEP 02 // CONFIRM', lines, width);
}

export async function choose(label, options) {
  let cursor = 0;

  function render() {
    const choices = options
      .map((option, index) => {
        const text = index === cursor ? paint(palette.bold, paint(palette.green, option)) : dim(option);
        return index === cursor ? `▸ [ ${text} ]` : `  [ ${text} ]`;
      })
      .join('  ');
    process.stdout.write(`\u001B[2K\r${paint(palette.pink, '?')} ${label}  ${choices}`);
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === '\u0003') quit('已取消');
    if (
      key === '\u001B[A' ||
      key === '\u001B[B' ||
      key === '\u001B[C' ||
      key === '\u001B[D' ||
      key === '\t'
    ) {
      cursor = (cursor + 1) % options.length;
      continue;
    }
    if (key === '\r' || key === '\n') {
      stopRaw();
      process.stdout.write('\n');
      return cursor;
    }
  }
}

export async function runInteractive() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error(NON_TTY_HINT);
  }

  enterScreen();
  try {
    const piPluginIds = await multiSelect({
      items: PI_PLUGIN_CATALOG,
      defaults: defaultPiPluginIds()
    });

    const plugins = PI_PLUGIN_CATALOG.filter((plugin) => piPluginIds.includes(plugin.id));
    clearFrame();
    process.stdout.write(
      `${renderSummary(plugins, contentWidth()).join('\n')}\n\n`
    );

    const confirmed = (await choose('执行安装？', ['APPLY', 'CANCEL'])) === 0;
    if (!confirmed) {
      leaveScreen();
      process.stdout.write('已取消安装\n');
      return null;
    }
    return { piPluginIds };
  } finally {
    stopRaw();
    leaveScreen();
  }
}
