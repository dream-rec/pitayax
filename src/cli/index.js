import process from "node:process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertSupportedPlatform,
  normalizePlatform,
} from "../lib/platforms.js";
import {
  ensureTrellisInitialized,
  installTrellisProfile,
} from "../lib/trellis.js";
import { formatRelative } from "../lib/files.js";
import {
  resolveSkills,
  defaultSkillIds,
} from "../lib/catalog.js";
import { installCursor } from "../platforms/cursor/index.js";
import { installClaudeCode } from "../platforms/claude-code/index.js";
import { installOpenCode } from "../platforms/opencode/index.js";
import { installCodex } from "../platforms/codex/index.js";
import { runDoctor, formatDoctorReport } from "../doctor/index.js";
import { runInteractive } from "../tui/index.js";
import { installPi, ensurePiConfig, installPiProject } from "../platforms/pi/index.js";
import {
  PI_PLUGIN_CATALOG,
  defaultPiPluginIds,
  resolvePiPlugins,
} from "../platforms/pi/catalog.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const packageVersion = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).version;

export async function run(argv) {
  // 无参数或仅 --help 以外无 subcommand 时，进入交互式 TUI。
  if (argv.length === 0) {
    const interactive = await runInteractive();
    if (!interactive) {
      return;
    }
    await init(process.cwd(), interactive);
    return;
  }

  // 优先处理全局 help 标志，避免被当作 command 或要求 -p。
  if (argv.includes("--help") || argv.includes("-h")) {
    writeOutput(helpText());
    return;
  }

  const { command, options } = parseArgs(argv);

  if (!command || command === "help") {
    writeOutput(helpText());
    return;
  }

  if (command === "interactive" || command === "tui") {
    const interactive = await runInteractive();
    if (!interactive) {
      return;
    }
    await init(process.cwd(), interactive);
    return;
  }

  const platform = normalizePlatform(options.platform);
  assertSupportedPlatform(platform);

  if (platform === "pi" && command !== "init" && command !== "update" && command !== "doctor") {
    throw new Error("Pi supports: pitaya init|update|doctor -p pi.");
  }
  if (options.clean && (platform !== "pi" || command === "doctor")) {
    throw new Error("--clean only applies to: pitaya update|init -p pi.");
  }

  const rootDir = process.cwd();
  const mode = options.mode ?? "strict";
  if (!["strict", "advisory"].includes(mode)) {
    throw new Error("Invalid --mode. Use strict or advisory.");
  }

  if (command === "init") {
    await init(rootDir, { ...options, platform, mode });
    return;
  }

  if (command === "doctor") {
    const report = await runDoctor(rootDir, platform);
    writeOutput(formatDoctorReport(report));
    return;
  }

  if (command === "update") {
    await init(rootDir, { ...options, platform, mode });
    return;
  }

  if (command === "uninstall") {
    throw new Error(
      "uninstall is planned but not implemented in this MVP. Remove pitaya generated files manually if needed.",
    );
  }

  throw new Error(`Unknown command "${command}".\n\n${helpText()}`);
}

async function init(rootDir, options) {
  // Pi 同时安装全局 CLI/扩展，并用 Trellis 原生 --pi 生成项目资产。
  if (options.platform === "pi") {
    const skillIds = options.skillIds ?? defaultSkillIds();
    const piPluginIds = options.piPluginIds ?? defaultPiPluginIds();
    assertKnownPiPlugins(piPluginIds);
    writeOutput(formatBanner());
    const skills = resolveSkills(options.skills ? options.skills.map((s) => s.id) : skillIds);
    const piPlugins = resolvePiPlugins(
      options.piPlugins ? options.piPlugins.map((p) => p.id) : piPluginIds,
    );
    const initOptions = { ...options, mode: options.mode ?? "strict", skills, piPlugins };
    const results = [
      ...(await installPi(packageRoot, initOptions)),
      ...(await ensurePiConfig(packageRoot)),
    ];
    const trellis = await ensureTrellisInitialized(rootDir, initOptions);
    if (!trellis.initialized) {
      writeOutput([
        formatInstallReport(rootDir, results),
        "",
        "Pi 已安装；当前项目尚未初始化 Trellis。",
        `Run: ${trellis.initCommand}`,
        "Then rerun pitaya init -p pi.",
      ].join("\n"));
      return;
    }
    results.push(await installTrellisProfile(rootDir));
    results.push(...await installPiProject(packageRoot, rootDir, initOptions));
    const report = await runDoctor(rootDir, "pi");
    writeOutput(`${formatInstallReport(rootDir, results)}\n\n${formatDoctorReport(report)}`);
    return;
  }

  // 来自 TUI 的 options 已带 skills；来自 CLI 的 options 需要解析。
  const platform = options.platform;
  const mode = options.mode ?? "strict";

  const skillIds = options.skillIds ?? defaultSkillIds();
  const skills = resolveSkills(
    options.skills ? options.skills.map((s) => s.id) : skillIds,
  );
  const initOptions = { ...options, platform, mode, skills };

  writeOutput(formatBanner());

  const results = [];
  const trellis = await ensureTrellisInitialized(rootDir, initOptions);

  if (!trellis.initialized) {
    writeOutput(
      [
        "Trellis is not initialized in this project.",
        `Run: ${trellis.initCommand}`,
        "Then rerun pitaya init.",
      ].join("\n"),
    );
    return;
  }

  results.push(await installTrellisProfile(rootDir));

  if (platform === "cursor") {
    results.push(...(await installCursor(packageRoot, rootDir, initOptions)));
  }

  if (platform === "claude") {
    results.push(
      ...(await installClaudeCode(packageRoot, rootDir, initOptions)),
    );
  }

  if (platform === "opencode") {
    results.push(...(await installOpenCode(packageRoot, rootDir, initOptions)));
  }

  if (platform === "codex") {
    results.push(...(await installCodex(packageRoot, rootDir, initOptions)));
  }

  const report = await runDoctor(rootDir, platform);
  writeOutput(
    `${formatInstallReport(rootDir, results)}\n\n${formatDoctorReport(report)}`,
  );
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--install-deps") {
      options.installDeps = true;
      continue;
    }

    if (arg === "--skip-deps") {
      options.installDeps = false;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }

    if (arg === "--skip-skills") {
      options.skillIds = [];
      continue;
    }

    if (arg === "--skip-pi-plugins") {
      options.piPluginIds = [];
      continue;
    }

    if (arg === "--clean") {
      options.clean = true;
      continue;
    }

    if (arg === "-p" || arg === "--platform") {
      const value = rest[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(
          "Missing value for -p/--platform. Use -p <cursor|claude|opencode|codex|pi>.",
        );
      }
      options.platform = value;
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      options.mode = readOptionValue(arg, rest, index);
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
      continue;
    }

    if (arg === "--developer") {
      options.developer = readOptionValue(arg, rest, index);
      index += 1;
      continue;
    }

    if (arg.startsWith("--developer=")) {
      options.developer = arg.slice("--developer=".length);
      continue;
    }

    if (arg === "--skills") {
      options.skillIds = readOptionValue(arg, rest, index)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--pi-plugins") {
      options.piPluginIds = readOptionValue(arg, rest, index)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { command, options };
}

// 未知 id 会被静默跳过，装不上又不报错，所以这里显式拦一道。
function assertKnownPiPlugins(ids) {
  const known = new Set(PI_PLUGIN_CATALOG.map((plugin) => plugin.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown Pi plugin id: ${unknown.join(", ")}. Available: ${[...known].join(", ")}.`,
    );
  }
}

function readOptionValue(arg, rest, index) {
  const value = rest[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return value;
}

function formatInstallReport(rootDir, results) {
  const lines = ["pitaya install report:"];
  for (const result of results.flat().filter(Boolean)) {
    const suffix = result.reason ? ` (${result.reason})` : "";
    lines.push(
      `- ${result.action}: ${formatRelative(rootDir, result.path)}${suffix}`,
    );
  }
  return lines.join("\n");
}

function writeOutput(message) {
  process.stdout.write(`${message}\n`);
}

// 火龙果切面图标：█▄▀▐▌ 果皮，◤◥◣◢ 叶尖，░ 果肉，• 籽，空格透明。每行 18 列。
const PITAYA_ICON = [
  "    ▄▄██████▄▄    ",
  " ◤▄██░░░░•░░░██▄◥ ",
  " ▐██░░•░░░░•░░██▌ ",
  " ▐██░░░░•░░░•░██▌ ",
  " ◣▀██░░•░░░░░██▀◢ ",
  "    ▀▀██████▀▀    ",
];

const ICON_TONES = {
  "█": "skin", "▄": "skin", "▀": "skin", "▐": "skin", "▌": "skin",
  "◤": "fin", "◥": "fin", "◣": "fin", "◢": "fin",
  "░": "flesh", "•": "seed",
};

// 256 色终端用火龙果本色：果皮洋红、叶尖翠绿、果肉铺白底、籽是白底上的深灰点。
// 只有 16 色时退到基础亮色。
const BANNER_PALETTES = {
  256: { skin: "38;5;198", fin: "38;5;76", flesh: "48;5;255", seed: "38;5;235;48;5;255" },
  16: { skin: "95", fin: "92", flesh: "107", seed: "30;107" },
};

function bannerPalette() {
  if (!process.stdout.isTTY || process.env.NO_COLOR) {
    return undefined;
  }
  const deep = typeof process.stdout.hasColors === "function" && process.stdout.hasColors(256);
  return BANNER_PALETTES[deep ? 256 : 16];
}

function paint(text, code) {
  return `\u001B[${code}m${text}\u001B[0m`;
}

// 有颜色时果肉用背景色铺成实心白底，无颜色时保留 ░ 字形保证黑白终端也能看出切面。
function paintIconRow(row, palette) {
  if (!palette) {
    return row;
  }
  const segments = [];
  for (const char of row) {
    const tone = ICON_TONES[char];
    const text = tone === "flesh" ? " " : char;
    const last = segments[segments.length - 1];
    if (last && last.tone === tone) {
      last.text += text;
    } else {
      segments.push({ tone, text });
    }
  }
  return segments
    .map(({ tone, text }) => (tone ? paint(text, palette[tone]) : text))
    .join("");
}

// banner 只有图标，不带文字标；版本号以暗色居中放在图标下方。
function formatBanner() {
  const palette = bannerPalette();
  const width = [...PITAYA_ICON[0]].length;
  const version = `v${packageVersion}`;
  const indent = " ".repeat(Math.max(0, Math.floor((width - version.length) / 2)));
  return [
    ...PITAYA_ICON.map((row) => paintIconRow(row, palette)),
    `${indent}${palette ? paint(version, "2") : version}`,
  ].join("\n");
}

function helpText() {
  return [
    `pitaya v${packageVersion} · Trellis workflow 安装聚合器`,
    "npm 包名 pitayax（npx pitayax ...），全局安装后命令为 pitaya。",
    "",
    "Usage:",
    "  pitaya                         # 交互式 TUI（推荐）",
    "  pitaya interactive             # 同上",
    "  pitaya init -p <cursor|claude|opencode|codex|pi> [options]",
    "  pitaya doctor -p <cursor|claude|opencode|codex|pi>",
    "  pitaya update -p <cursor|claude|opencode|codex|pi>",
    "  pitaya update -p pi --clean    # 先 pi remove 再重装全部 Pi 插件",
    "",
    "Options:",
    "  -p, --platform <platform>       cursor|claude|opencode|codex|pi",
    "  --mode strict|advisory          默认 strict",
    "  --skills <id,id,...>            指定要安装的 skill id（默认全部）",
    "  --skip-skills                    不安装任何 skill",
    "  --pi-plugins <id,id,...>        指定要安装的 Pi 插件 id（默认全部，仅 -p pi）",
    "  --skip-pi-plugins               不安装任何 Pi 插件",
    "  --clean                         卸载后重装选中的 Pi 插件，重置依赖树与补丁（仅 -p pi）",
    "  --yes                            非交互模式下确认安装",
    "  --install-deps --developer <n>  自动初始化 Trellis",
    "",
    "Skill ids:",
    "  trellis-pitaya-patch",
    "",
    "Pi plugin ids:",
    `  ${PI_PLUGIN_CATALOG.map((plugin) => plugin.id).join(", ")}`,
    "",
    "Examples:",
    "  npx pitayax",
    "  npx pitayax init -p cursor",
    "  npx pitayax init -p pi",
    "  npx pitayax init -p pi --pi-plugins nano-context,footer",
    "  npx pitayax update -p pi --clean",
    "  npx pitayax init -p claude --skills trellis-pitaya-patch",
    "  npx pitayax doctor -p codex",
  ].join("\n");
}
