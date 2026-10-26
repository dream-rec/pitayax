import process from "node:process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatRelative } from "../lib/files.js";
import { runDoctor, formatDoctorReport } from "../doctor/index.js";
import { runInteractive } from "../tui/index.js";
import { installPi, ensurePiConfig } from "../pi/index.js";
import {
  PI_PLUGIN_CATALOG,
  defaultPiPluginIds,
  resolvePiPlugins,
} from "../pi/catalog.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const packageVersion = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).version;

export async function run(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeOutput(helpText());
    return;
  }

  const { command, options } = parseArgs(argv);
  if (!command || command === "interactive" || command === "tui") {
    const interactive = await runInteractive();
    if (interactive) await init(process.cwd(), interactive);
    return;
  }
  if (command === "help") {
    writeOutput(helpText());
    return;
  }
  if (options.clean && command !== "init" && command !== "update") {
    throw new Error("--clean 仅适用于 pitaya init|update。");
  }

  if (command === "init" || command === "update") {
    await init(process.cwd(), options);
    return;
  }
  if (command === "doctor") {
    const report = await runDoctor(process.cwd());
    writeOutput(formatDoctorReport(report));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command "${command}".\n\n${helpText()}`);
}

async function init(rootDir, options) {
  const piPluginIds = options.piPluginIds ?? defaultPiPluginIds();
  assertKnownPiPlugins(piPluginIds);
  const piPlugins = resolvePiPlugins(piPluginIds);
  writeOutput(formatBanner());
  const results = [
    ...(await installPi(packageRoot, { ...options, piPlugins, rootDir })),
    ...(await ensurePiConfig(packageRoot)),
  ];
  const report = await runDoctor(rootDir);
  writeOutput(`${formatInstallReport(rootDir, results)}\n\n${formatDoctorReport(report)}`);
  if (!report.ok) process.exitCode = 1;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--yes" || arg === "-y") continue;
    if (arg === "--skip-pi-plugins") {
      options.piPluginIds = [];
      continue;
    }
    if (arg === "--clean") {
      options.clean = true;
      continue;
    }
    if (arg === "-p" || arg === "--platform") {
      if (readOptionValue(arg, rest, index) !== "pi") {
        throw new Error("pitayax 仅支持 Pi；无需 -p 参数。");
      }
      index += 1;
      continue;
    }
    if (arg === "--pi-plugins") {
      options.piPluginIds = readOptionValue(arg, rest, index)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return { command, options };
}

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
    // agent 目录不在当前项目下时保持绝对路径，避免出现一长串 ../..。
    const relative = formatRelative(rootDir, result.path);
    const shown = relative.startsWith("..") ? result.path : relative;
    lines.push(`- ${result.action}: ${shown}${suffix}`);
  }
  return lines.join("\n");
}

function writeOutput(message) {
  process.stdout.write(`${message}\n`);
}

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

const BANNER_PALETTES = {
  256: { skin: "38;5;198", fin: "38;5;76", flesh: "48;5;255", seed: "38;5;235;48;5;255" },
  16: { skin: "95", fin: "92", flesh: "107", seed: "30;107" },
};

function bannerPalette() {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return undefined;
  const deep = typeof process.stdout.hasColors === "function" && process.stdout.hasColors(256);
  return BANNER_PALETTES[deep ? 256 : 16];
}

function paint(text, code) {
  return `\u001B[${code}m${text}\u001B[0m`;
}

function paintIconRow(row, palette) {
  if (!palette) return row;
  const segments = [];
  for (const char of row) {
    const tone = ICON_TONES[char];
    const text = tone === "flesh" ? " " : char;
    const last = segments[segments.length - 1];
    if (last && last.tone === tone) last.text += text;
    else segments.push({ tone, text });
  }
  return segments
    .map(({ tone, text }) => (tone ? paint(text, palette[tone]) : text))
    .join("");
}

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
    `pitaya v${packageVersion} · Pi 个人工作流安装脚本`,
    "npm 包名 pitayax（npx pitayax ...），全局安装后命令为 pitaya。",
    "",
    "Usage:",
    "  pitaya                         # 交互式选择 Pi 插件",
    "  pitaya interactive             # 同上",
    "  pitaya init [options]          # 安装 Pi、插件、提示词与补丁",
    "  pitaya update [options]        # 更新并恢复补丁",
    "  pitaya doctor                  # 只读检查 Pi 配置",
    "",
    "Options:",
    "  --pi-plugins <id,id,...>        指定 Pi 插件 id（默认全部）",
    "  --skip-pi-plugins               只安装 Pi 和提示词",
    "  --clean                        卸载后重装选中的插件，并重置托管配置",
    "  -p, --platform pi              兼容旧命令，可省略",
    "  --yes, -y                      兼容非交互命令",
    "",
    "Pi plugin ids:",
    `  ${PI_PLUGIN_CATALOG.map((plugin) => plugin.id).join(", ")}`,
    "",
    "Examples:",
    "  npx pitayax",
    "  npx pitayax init",
    "  npx pitayax init --pi-plugins nano-context,footer",
    "  npx pitayax update --clean",
    "  npx pitayax doctor",
  ].join("\n");
}
