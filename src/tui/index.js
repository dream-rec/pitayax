import process from "node:process";
import { SUPPORTED_PLATFORMS, PLATFORM_LABELS } from "../lib/platforms.js";
import {
  SKILL_CATALOG,
  MCP_CATALOG,
  defaultSkillIds,
  defaultMcpIds,
} from "../lib/catalog.js";
import { detectTrellis } from "../lib/trellis.js";
import { trellisPlatformFlag } from "../lib/platforms.js";
import {
  PI_PLUGIN_CATALOG,
  defaultPiPluginIds,
} from "../platforms/pi/catalog.js";

const COLORS = {
  reset: "\x1B[0m",
  dim: "\x1B[2m",
  bold: "\x1B[1m",
  magenta: "\x1B[35m",
  cyan: "\x1B[36m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
};

function colorize(text, color) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) {
    return text;
  }
  return `${COLORS[color] ?? ""}${text}${COLORS.reset}`;
}

function renderCheckboxList(items, cursorIndex, selected) {
  const lines = [];
  items.forEach((item, index) => {
    const pointer = index === cursorIndex ? colorize("❯", COLORS.cyan) : " ";
    const check = selected.has(item.id)
      ? colorize("◉", COLORS.green)
      : colorize("◯", COLORS.dim);
    const label =
      index === cursorIndex ? colorize(item.label, COLORS.bold) : item.label;
    lines.push(`${pointer} ${check} ${label}`);
    if (item.description) {
      lines.push(colorize(`    ${item.description}`, COLORS.dim));
    }
  });
  return lines.join("\n");
}

function renderRadioList(items, cursorIndex) {
  const lines = [];
  items.forEach((item, index) => {
    const pointer = index === cursorIndex ? colorize("❯", COLORS.cyan) : " ";
    const dot =
      index === cursorIndex
        ? colorize("●", COLORS.green)
        : colorize("○", COLORS.dim);
    const label =
      index === cursorIndex ? colorize(item.label, COLORS.bold) : item.label;
    lines.push(`${pointer} ${dot} ${label}`);
  });
  return lines.join("\n");
}

// 在 raw 模式下读取按键。返回标准化按键名。
// 方向键转义序列 \x1B[A/B/C/D 可能分多个 data 事件到达，这里做拼接。
function readKeystroke() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("交互式安装需要真实终端；CI、管道或不支持 raw mode 的控制台请使用 pitaya init -p <platform>。");
  }
  return new Promise((resolve) => {
    let buffer = "";
    function onRaw(data) {
      buffer += data.toString();
      // 完整的转义序列至少 3 字节；单字符按键 1 字节即可判定。
      if (buffer.length === 1) {
        const char = buffer;
        if (char === "\x1B") {
          // 等待后续字节。
          return;
        }
        process.stdin.removeListener("data", onRaw);
        resolve(char);
        return;
      }
      if (buffer.length >= 3 && buffer.startsWith("\x1B")) {
        process.stdin.removeListener("data", onRaw);
        resolve(buffer);
        return;
      }
      // 超时兜底，避免 hang。
      if (buffer.length > 8) {
        process.stdin.removeListener("data", onRaw);
        resolve(buffer);
      }
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", onRaw);
    process.stdin.on("data", onRaw);
  });
}

function stopRaw() {
  if (typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.stdin.removeAllListeners("data");
}

async function multiSelect({ title, hint, items, defaults }) {
  let cursor = 0;
  const selected = new Set(defaults);

  function render() {
    process.stdout.write("\x1B[2J\x1B[H");
    process.stdout.write(`${colorize(title, COLORS.magenta)}\n`);
    if (hint) {
      process.stdout.write(`${colorize(hint, COLORS.dim)}\n`);
    }
    process.stdout.write("\n");
    process.stdout.write(renderCheckboxList(items, cursor, selected));
    process.stdout.write("\n\n");
    process.stdout.write(
      colorize(
        "  ↑/↓ 移动 · space 切换选中 · enter 确认 · a 全选/全不选 · ctrl+c 退出\n",
        COLORS.dim,
      ),
    );
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === "\x03") {
      stopRaw();
      process.stdout.write("\n已取消\n");
      process.exit(0);
    }
    if (key === "q") {
      stopRaw();
      process.stdout.write("\n已退出\n");
      process.exit(0);
    }
    if (key === "\x1B[A") {
      cursor = (cursor - 1 + items.length) % items.length;
      continue;
    }
    if (key === "\x1B[B") {
      cursor = (cursor + 1) % items.length;
      continue;
    }
    if (key === " ") {
      const item = items[cursor];
      if (selected.has(item.id)) {
        selected.delete(item.id);
      } else {
        selected.add(item.id);
      }
      continue;
    }
    if (key === "a") {
      if (selected.size === items.length) {
        selected.clear();
      } else {
        items.forEach((item) => selected.add(item.id));
      }
      continue;
    }
    if (key === "\r" || key === "\n") {
      stopRaw();
      return [...selected];
    }
  }
}

async function singleSelect({ title, hint, items }) {
  let cursor = 0;

  function render() {
    process.stdout.write("\x1B[2J\x1B[H");
    process.stdout.write(`${colorize(title, COLORS.magenta)}\n`);
    if (hint) {
      process.stdout.write(`${colorize(hint, COLORS.dim)}\n`);
    }
    process.stdout.write("\n");
    process.stdout.write(renderRadioList(items, cursor));
    process.stdout.write("\n\n");
    process.stdout.write(
      colorize("  ↑/↓ 移动 · enter 选择 · ctrl+c 退出\n", COLORS.dim),
    );
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === "\x03") {
      stopRaw();
      process.stdout.write("\n已取消\n");
      process.exit(0);
    }
    if (key === "\x1B[A") {
      cursor = (cursor - 1 + items.length) % items.length;
      continue;
    }
    if (key === "\x1B[B") {
      cursor = (cursor + 1) % items.length;
      continue;
    }
    if (key === "\r" || key === "\n") {
      stopRaw();
      return items[cursor].id;
    }
  }
}

async function confirmPrompt(label) {
  let cursor = 0;
  const options = ["确认安装", "取消"];

  function render() {
    const line = options
      .map((option, index) => {
        const prefix = index === cursor ? colorize("❯", COLORS.cyan) : " ";
        const text = index === cursor ? colorize(option, COLORS.bold) : option;
        return `${prefix} ${text}`;
      })
      .join("   ");
    process.stdout.write(`\r${colorize(label, COLORS.bold)}  ${line}`);
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === "\x03") {
      stopRaw();
      process.stdout.write("\n已取消\n");
      process.exit(0);
    }
    if (
      key === "\x1B[A" ||
      key === "\x1B[B" ||
      key === "\t" ||
      key === "\x1B[C" ||
      key === "\x1B[D"
    ) {
      cursor = (cursor + 1) % options.length;
      continue;
    }
    if (key === "\r" || key === "\n") {
      stopRaw();
      process.stdout.write("\n");
      return cursor === 0;
    }
  }
}

// 文本输入 prompt：在 raw 模式下逐字符读取，回车确认。
async function textInput({ title, hint, placeholder }) {
  let value = "";

  function render() {
    process.stdout.write("\x1B[2J\x1B[H");
    process.stdout.write(`${colorize(title, COLORS.magenta)}\n`);
    if (hint) {
      process.stdout.write(`${colorize(hint, COLORS.dim)}\n`);
    }
    process.stdout.write("\n");
    const display = value || colorize(placeholder ?? "", COLORS.dim);
    process.stdout.write(`  ❯ ${display}\n`);
    process.stdout.write("\n");
    process.stdout.write(colorize("  输入文字 · enter 确认 · ctrl+c 退出\n", COLORS.dim));
  }

  while (true) {
    render();
    const key = await readKeystroke();

    if (key === "\x03") {
      stopRaw();
      process.stdout.write("\n已取消\n");
      process.exit(0);
    }
    if (key === "\r" || key === "\n") {
      stopRaw();
      return value.trim();
    }
    if (key === "\x7F" || key === "\b") {
      value = value.slice(0, -1);
      continue;
    }
    // 方向键等转义序列忽略。
    if (key.startsWith("\x1B")) {
      continue;
    }
    // 普通可打印字符。
    if (key.length === 1 && key >= " " && key <= "~") {
      value += key;
    }
  }
}

const STEP_NUMERALS = ["一", "二", "三", "四", "五", "六"];

// 步骤数随平台而变（Pi 多一步选插件），且 Trellis 已就绪时会整步跳过，
// 所以标题按实际渲染顺序生成，不写死。
function createStepper() {
  let index = 0;
  return (title) => {
    index += 1;
    return `第${STEP_NUMERALS[index - 1] ?? index}步 · ${title}`;
  };
}

function renderSummary(platform, skills, mcps, mode, trellisAction, piPlugins) {
  const lines = [];
  lines.push(colorize("即将安装:", COLORS.magenta));
  lines.push(`  平台: ${colorize(PLATFORM_LABELS[platform], COLORS.bold)}`);
  lines.push(`  模式: ${mode === "strict" ? colorize("strict", COLORS.yellow) : mode === "global" ? colorize("global", COLORS.cyan) : colorize("advisory", COLORS.green)}`);

  if (trellisAction) {
    lines.push(`  Trellis: ${colorize(trellisAction, COLORS.cyan)}`);
  }

  if (piPlugins) {
    lines.push(`  Pi 插件 (${piPlugins.length}):`);
    if (piPlugins.length === 0) {
      lines.push(colorize("    (无)", COLORS.dim));
    } else {
      piPlugins.forEach((p) =>
        lines.push(`    ${colorize("✓", COLORS.green)} ${p.name}`),
      );
    }
  }

  lines.push(`  Skills (${skills.length}):`);
  if (skills.length === 0) {
    lines.push(colorize("    (无)", COLORS.dim));
  } else {
    skills.forEach((s) =>
      lines.push(`    ${colorize("✓", COLORS.green)} ${s.name}`),
    );
  }
  lines.push(`  MCPs (${mcps.length}):`);
  if (mcps.length === 0) {
    lines.push(colorize("    (无)", COLORS.dim));
  } else {
    mcps.forEach((m) =>
      lines.push(`    ${colorize("✓", COLORS.green)} ${m.name}`),
    );
  }
  return lines.join("\n");
}

  // 交互式安装向导：平台 -> Pi 插件（可选）-> Trellis 基础依赖 -> skill -> mcp -> 确认安装。
export async function runInteractive() {
  const step = createStepper();

  // 选择平台。
  const platformItems = [...SUPPORTED_PLATFORMS].map((id) => ({
    id,
    label: PLATFORM_LABELS[id],
  }));
  const platform = await singleSelect({
    title: step("选择目标平台"),
    hint: "选择你要安装 pitaya 的 AI 编码平台。",
    items: platformItems,
  });

  // Pi 独有：先定这台机器上装哪些 Pi 扩展（全局安装，与项目无关）。
  let piPluginIds;
  if (platform === "pi") {
    piPluginIds = await multiSelect({
      title: step("选择要安装的 Pi 插件"),
      hint: "全局安装到 Pi agent 目录，版本已钉死在实测通过的组合，默认全选。",
      items: PI_PLUGIN_CATALOG,
      defaults: defaultPiPluginIds(),
    });
  }

  // Trellis 基础依赖。Pi 也使用 Trellis 原生 --pi 项目资产。
  const trellisState = await detectTrellis(process.cwd());
  let trellisAction = null;
  let installDeps = false;
  let developer = undefined;

  if (trellisState.exists) {
    trellisAction = "已初始化（跳过）";
  } else if (!trellisState.cli) {
    // trellis CLI 未安装。
    const installChoice = await singleSelect({
      title: step("Trellis 基础依赖"),
      hint: `检测到 trellis CLI 未安装。是否自动安装 @mindfoldhq/trellis？`,
      items: [
        { id: "install", label: "自动安装 trellis CLI 并初始化" },
        { id: "skip", label: "跳过（稍后手动安装）" },
      ],
    });

    if (installChoice === "install") {
      const name = await textInput({
        title: "输入开发者名称",
        hint: "trellis init -u <name> 需要一个开发者名称。",
        placeholder: "your-name",
      });
      if (!name) {
        process.stdout.write("开发者名称不能为空，已取消\n");
        return null;
      }
      trellisAction = "安装 trellis CLI + 初始化项目";
      installDeps = true;
      developer = name;
    } else {
      trellisAction = "跳过（需手动安装 trellis CLI）";
    }
  } else {
    // trellis CLI 已安装但项目未初始化。
    const initChoice = await singleSelect({
      title: step("Trellis 基础依赖"),
      hint: `trellis CLI 已安装，但当前项目未初始化。是否初始化？`,
      items: [
        { id: "init", label: "初始化 Trellis 项目" },
        { id: "skip", label: "跳过（稍后手动初始化）" },
      ],
    });

    if (initChoice === "init") {
      const name = await textInput({
        title: "输入开发者名称",
        hint: "trellis init -u <name> 需要一个开发者名称。",
        placeholder: "your-name",
      });
      if (!name) {
        process.stdout.write("开发者名称不能为空，已取消\n");
        return null;
      }
      trellisAction = "初始化 Trellis 项目";
      installDeps = true;
      developer = name;
    } else {
      trellisAction = "跳过（需手动初始化）";
    }
  }

  // 选择 skills。
  const skillIds = await multiSelect({
    title: step("选择要安装的 Skills"),
    hint: "这些是 pitaya 的 Trellis patch skills，默认全选。",
    items: SKILL_CATALOG,
    defaults: defaultSkillIds(),
  });

  // 选择 MCPs。
  const mcpIds = await multiSelect({
    title: step("选择要配置的 MCP Servers"),
    hint: "这些 MCP 会被写入对应平台的 mcp 配置文件，默认全选。",
    items: MCP_CATALOG,
    defaults: defaultMcpIds(),
  });

  const skills = SKILL_CATALOG.filter((item) => skillIds.includes(item.id));
  const mcps = MCP_CATALOG.filter((item) => mcpIds.includes(item.id));
  const piPlugins = piPluginIds
    ? PI_PLUGIN_CATALOG.filter((item) => piPluginIds.includes(item.id))
    : undefined;
  const mode = "strict";

  // 确认安装。
  process.stdout.write("\x1B[2J\x1B[H");
  process.stdout.write(
    renderSummary(platform, skills, mcps, mode, trellisAction, piPlugins),
  );
  process.stdout.write("\n\n");

  const confirmed = await confirmPrompt("确认开始安装？");
  if (!confirmed) {
    process.stdout.write("已取消安装\n");
    return null;
  }

  return {
    platform,
    mode,
    skillIds,
    mcpIds,
    skills,
    mcps,
    piPluginIds,
    piPlugins,
    installDeps,
    developer,
  };
}
