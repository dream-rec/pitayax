import process from 'node:process';
import { PI_CLI, PI_PLUGIN_CATALOG, defaultPiPluginIds } from '../pi/catalog.js';

const COLORS = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  bold: '\x1B[1m',
  magenta: '\x1B[35m',
  cyan: '\x1B[36m',
  green: '\x1B[32m'
};

function colorize(text, color) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) {
    return text;
  }
  return `${COLORS[color] ?? ''}${text}${COLORS.reset}`;
}

function renderCheckboxList(items, cursorIndex, selected) {
  const lines = [];
  items.forEach((item, index) => {
    const pointer = index === cursorIndex ? colorize('❯', COLORS.cyan) : ' ';
    const check = selected.has(item.id)
      ? colorize('◉', COLORS.green)
      : colorize('◯', COLORS.dim);
    const label = index === cursorIndex ? colorize(item.label, COLORS.bold) : item.label;
    lines.push(`${pointer} ${check} ${label}`);
    if (item.description) {
      lines.push(colorize(`    ${item.description}`, COLORS.dim));
    }
  });
  return lines.join('\n');
}

// 在 raw 模式下读取按键。方向键转义序列 \x1B[A/B 可能分多个 data 事件到达，这里做拼接。
function readKeystroke() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('交互式安装需要真实终端；CI、管道或不支持 raw mode 的控制台请使用 pitaya init --pi-plugins <id,id,...>。');
  }
  return new Promise((resolve) => {
    let buffer = '';
    function onRaw(data) {
      buffer += data.toString();
      if (buffer.length === 1) {
        if (buffer === '\x1B') {
          // 等待后续字节。
          return;
        }
        process.stdin.removeListener('data', onRaw);
        resolve(buffer);
        return;
      }
      if (buffer.length >= 3 && buffer.startsWith('\x1B')) {
        process.stdin.removeListener('data', onRaw);
        resolve(buffer);
        return;
      }
      if (buffer.length > 8) {
        process.stdin.removeListener('data', onRaw);
        resolve(buffer);
      }
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    // 只挂一次：同一个 handler 同时用 once 和 on 挂两遍，ESC 与 [B 分两次到达时
    // 第二个 handler 会把 buffer 拼成 ESC ESC [ B，方向键被当成未知按键丢掉。
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

async function multiSelect({ title, hint, items, defaults }) {
  let cursor = 0;
  const selected = new Set(defaults);

  function render() {
    process.stdout.write('\x1B[2J\x1B[H');
    process.stdout.write(`${colorize(title, COLORS.magenta)}\n`);
    if (hint) {
      process.stdout.write(`${colorize(hint, COLORS.dim)}\n`);
    }
    process.stdout.write('\n');
    process.stdout.write(renderCheckboxList(items, cursor, selected));
    process.stdout.write('\n\n');
    process.stdout.write(
      colorize('  ↑/↓ 移动 · space 切换选中 · enter 确认 · a 全选/全不选 · ctrl+c 退出\n', COLORS.dim)
    );
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === '\x03') {
      stopRaw();
      process.stdout.write('\n已取消\n');
      process.exit(0);
    }
    if (key === 'q') {
      stopRaw();
      process.stdout.write('\n已退出\n');
      process.exit(0);
    }
    if (key === '\x1B[A') {
      cursor = (cursor - 1 + items.length) % items.length;
      continue;
    }
    if (key === '\x1B[B') {
      cursor = (cursor + 1) % items.length;
      continue;
    }
    if (key === ' ') {
      const item = items[cursor];
      if (selected.has(item.id)) {
        selected.delete(item.id);
      } else {
        selected.add(item.id);
      }
      continue;
    }
    if (key === 'a') {
      if (selected.size === items.length) {
        selected.clear();
      } else {
        items.forEach((item) => selected.add(item.id));
      }
      continue;
    }
    if (key === '\r' || key === '\n') {
      stopRaw();
      return [...selected];
    }
  }
}

export async function choose(label, options) {
  let cursor = 0;

  function render() {
    const line = options
      .map((option, index) => {
        const prefix = index === cursor ? colorize('❯', COLORS.cyan) : ' ';
        const text = index === cursor ? colorize(option, COLORS.bold) : option;
        return `${prefix} ${text}`;
      })
      .join('   ');
    process.stdout.write(`\r${colorize(label, COLORS.bold)}  ${line}`);
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === '\x03') {
      stopRaw();
      process.stdout.write('\n已取消\n');
      process.exit(0);
    }
    if (
      key === '\x1B[A' ||
      key === '\x1B[B' ||
      key === '\t' ||
      key === '\x1B[C' ||
      key === '\x1B[D'
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

function renderSummary(plugins) {
  const lines = [colorize('即将安装:', COLORS.magenta)];
  lines.push(`  Pi CLI: ${PI_CLI.split('@').at(-1)}`);
  lines.push(`  Pi 插件 (${plugins.length}):`);
  if (plugins.length === 0) {
    lines.push(colorize('    (无)', COLORS.dim));
  } else {
    plugins.forEach((plugin) => lines.push(`    ${colorize('✓', COLORS.green)} ${plugin.name}`));
  }
  lines.push('  Pi 配置: APPEND_SYSTEM 偏好块、状态栏、工具后端与插件补丁');
  return lines.join('\n');
}

export async function runInteractive() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('交互式安装需要真实终端；CI、管道或不支持 raw mode 的控制台请使用 pitaya init --pi-plugins <id,id,...>。');
  }

  const piPluginIds = await multiSelect({
    title: '第一步 · 选择要安装的 Pi 插件',
    hint: '全局安装到 Pi agent 目录，版本已钉死在实测通过的组合，默认全选。',
    items: PI_PLUGIN_CATALOG,
    defaults: defaultPiPluginIds()
  });

  const plugins = PI_PLUGIN_CATALOG.filter((plugin) => piPluginIds.includes(plugin.id));
  process.stdout.write('\x1B[2J\x1B[H');
  process.stdout.write(`${renderSummary(plugins)}\n\n`);

  const confirmed = (await choose('第二步 · 确认开始安装？', ['确认安装', '取消'])) === 0;
  if (!confirmed) {
    process.stdout.write('已取消安装\n');
    return null;
  }
  return { piPluginIds };
}
