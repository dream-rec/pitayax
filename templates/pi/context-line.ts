import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * pi-footer 的上下文行：后端 | 进度条 当前/窗口 百分比 | 实际触发 token。
 * 进度条用 Nerd Font 的 Fira 进度字形（U+EE00–EE05），高度与图标一致，只上前景色。
 * 百分比按原始模型窗口；阈值按扣除输出预留后的有效窗口换算成 token。
 */
const STATUS_KEY = "ctx-line";
const BACKEND_KEY = "__piContextBackend";
const BAR_WIDTH = 24;
const DEFAULT_MAGIC_THRESHOLD = 65;
const DEFAULT_BILLION_THRESHOLD = 75;
const MAX_OUTPUT_RESERVE_RATIO = 0.25;

// [左端, 中段, 右端]
const EMPTY_GLYPHS = ["\uee00", "\uee01", "\uee02"] as const;
const FILLED_GLYPHS = ["\uee03", "\uee04", "\uee05"] as const;
const ICON = "\uf51e";
const FLAG = "\uf024";

type Backend = "magic" | "billion";
type Rgb = readonly [number, number, number];

const RESET = "\x1b[0m";
// footer 其他行已占用蓝/青/紫/粉/橙，后端名用没出现过的草绿和淺黄区分。
const MAGIC_COLOR: Rgb = [166, 227, 161];
const BILLION_COLOR: Rgb = [249, 226, 175];
const TEXT: Rgb = [192, 202, 245];
const MUTED: Rgb = [110, 118, 150];
const SEP: Rgb = [200, 200, 210];
const EMPTY: Rgb = [78, 82, 108];
const DANGER: Rgb = [150, 64, 86];
const SOFT_RED: Rgb = [200, 110, 130];
const RED: Rgb = [247, 118, 142];

// 热力按「离阈值多近」取色：起点绿，接近阈值转红。
const HEAT: ReadonlyArray<readonly [number, Rgb]> = [
  [0, [158, 206, 106]],
  [0.55, [224, 175, 104]],
  [0.8, [255, 158, 100]],
  [1, [247, 118, 142]]
];

interface Threshold {
  tokens: number;
  label: string;
}
let lastLine: string | undefined;

export default function contextLine(pi: ExtensionAPI): void {
  const update = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    try {
      const line = renderLine(ctx);
      if (!line || line === lastLine) return;
      ctx.ui.setStatus(STATUS_KEY, line);
      lastLine = line;
    } catch {
      // 配置或模型数据异常时保留上一行，不能因为状态栏影响会话。
    }
  };

  pi.on("session_start", (_event, ctx) => update(ctx));
  pi.on("context", (_event, ctx) => update(ctx));
  pi.on("turn_end", (_event, ctx) => update(ctx));
  pi.on("agent_end", (_event, ctx) => update(ctx));
  pi.on("model_select", (_event, ctx) => update(ctx));
  pi.on("session_compact", (_event, ctx) => update(ctx));
  pi.on("session_tree", (_event, ctx) => update(ctx));
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
    lastLine = undefined;
  });
}

function renderLine(ctx: ExtensionContext): string | undefined {
  const usage = ctx.getContextUsage();
  const window = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  if (window <= 0) return undefined;

  const maxTokens = ctx.model?.maxTokens ?? 0;
  const reserve = Math.min(
    maxTokens > 0 ? maxTokens : MAX_OUTPUT_RESERVE_RATIO * window,
    MAX_OUTPUT_RESERVE_RATIO * window
  );
  const capacity = Math.max(1, window - reserve);

  const tokens =
    typeof usage?.tokens === "number" && usage.tokens > 0 ? usage.tokens : undefined;
  const percent =
    tokens === undefined ? 0 : Math.max(0, Math.min(100, (tokens / window) * 100));
  const backend = currentBackend();
  const threshold = resolveThreshold(ctx, backend, capacity);

  return formatLine({ backend, percent, tokens, window, threshold });
}

function formatLine(args: {
  backend: Backend;
  percent: number;
  tokens: number | undefined;
  window: number;
  threshold: Threshold;
}): string {
  const { backend, percent, tokens, window, threshold } = args;
  const used = Math.round((percent / 100) * BAR_WIDTH);
  const mark = Math.max(
    1,
    Math.min(BAR_WIDTH, Math.round((threshold.tokens / window) * BAR_WIDTH))
  );
  const over = tokens !== undefined && tokens >= threshold.tokens;
  const sep = `${fg(SEP)} | ${RESET}`;

  const usage =
    tokens === undefined
      ? `${fg(MUTED)}--/${formatTokens(window)}${RESET}`
      : `${fg(TEXT)}${formatTokens(tokens)}${fg(MUTED)}/${formatTokens(window)} ` +
        `${fg(fillColor(Math.max(used - 1, 0), mark))}${Math.round(percent)}%${RESET}`;

  return (
    `${fg(backend === "billion" ? BILLION_COLOR : MAGIC_COLOR)}${ICON} ${backend}${RESET}` +
    sep +
    `${renderBar(used, mark)} ${usage}` +
    sep +
    `${fg(over ? RED : SOFT_RED)}${FLAG} ${threshold.label}${RESET}`
  );
}

function renderBar(used: number, mark: number): string {
  const cells: string[] = [];
  for (let index = 0; index < BAR_WIDTH; index += 1) {
    const slot = index === 0 ? 0 : index === BAR_WIDTH - 1 ? 2 : 1;
    const filled = index < used;
    const glyph = filled ? FILLED_GLYPHS[slot] : EMPTY_GLYPHS[slot];
    const color = filled ? fillColor(index, mark) : index >= mark ? DANGER : EMPTY;
    cells.push(`${fg(color)}${glyph}`);
  }
  return `${cells.join("")}${RESET}`;
}

function fillColor(index: number, mark: number): Rgb {
  return index < mark ? heat((index + 0.5) / mark) : RED;
}

function resolveThreshold(
  ctx: ExtensionContext,
  backend: Backend,
  capacity: number
): Threshold {
  if (backend === "billion") {
    const config = readConfig(billionConfigPath());
    const compress = config?.compress;
    const limit =
      compress && typeof compress === "object"
        ? (compress as Record<string, unknown>).maxContextLimit
        : undefined;
    const percent = parsePercent(limit) ?? DEFAULT_BILLION_THRESHOLD;
    const tokens = (capacity * percent) / 100;
    return { tokens, label: formatTokens(tokens) };
  }

  const config = readConfig(magicConfigPath());
  const modelKey = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
  const configured = resolveModelNumber(
    config?.execute_threshold_percentage,
    modelKey,
    DEFAULT_MAGIC_THRESHOLD
  );
  const percent =
    configured >= 20 && configured <= 90 ? configured : DEFAULT_MAGIC_THRESHOLD;
  const tokenOverride = resolveModelNumber(config?.execute_threshold_tokens, modelKey);

  if (tokenOverride > 0) {
    return { tokens: tokenOverride, label: formatTokens(tokenOverride) };
  }
  const tokens = (capacity * percent) / 100;
  return { tokens, label: formatTokens(tokens) };
}

function resolveModelNumber(
  value: unknown,
  modelKey: string | undefined,
  fallback?: number
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [modelKey ? record[modelKey] : undefined, record.default];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    }
  }
  return fallback ?? 0;
}

function parsePercent(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const percent = value <= 1 ? value * 100 : value;
    return Math.max(1, Math.min(100, percent));
  }
  if (typeof value === "string") {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (match) return Math.max(1, Math.min(100, Number(match[1])));
  }
  return undefined;
}

function currentBackend(): Backend {
  return (globalThis as Record<string, unknown>)[BACKEND_KEY] === "billion"
    ? "billion"
    : "magic";
}

function magicConfigPath(): string {
  return join(configHome(), "cortexkit", "magic-context.jsonc");
}

function billionConfigPath(): string {
  return (
    process.env.BILI_CONFIG_FILE ||
    join(configHome(), "billion-context", "billion-context.json")
  );
}

function configHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function readConfig(path: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(stripComments(readFileSync(path, "utf8")));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function stripComments(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      result += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      continue;
    }
    result += char;
  }

  return result;
}

function formatTokens(value: number): string {
  if (value < 1000) return `${Math.round(value)}`;
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

function heat(t: number): Rgb {
  for (let index = 0; index < HEAT.length - 1; index += 1) {
    const [start, from] = HEAT[index];
    const [end, to] = HEAT[index + 1];
    if (t <= end) {
      const ratio = end === start ? 0 : (t - start) / (end - start);
      return [
        Math.round(from[0] + (to[0] - from[0]) * ratio),
        Math.round(from[1] + (to[1] - from[1]) * ratio),
        Math.round(from[2] + (to[2] - from[2]) * ratio)
      ];
    }
  }
  return HEAT[HEAT.length - 1][1];
}

function fg(rgb: Rgb): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}
