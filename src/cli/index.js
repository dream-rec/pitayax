import process from "node:process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatRelative } from "../lib/files.js";
import { formatBanner } from "../tui/banner.js";
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
  writeOutput(formatBanner(packageVersion).join("\n"));
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
