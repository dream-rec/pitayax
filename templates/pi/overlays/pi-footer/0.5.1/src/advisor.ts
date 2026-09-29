import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export interface AdvisorInfo {
  model?: string;
  effort?: string;
}

const XDG_CONFIG_ENV = "XDG_CONFIG_HOME";
const CONFIG_DIR_NAME = "rpiv-advisor";
const CONFIG_FILE_NAME = "advisor.json";
// 渲染期间每帧都会问一次；文件系统最多 500ms 查一次，/advisor 改完几乎立刻生效。
const STAT_INTERVAL_MS = 500;

let cache: { key: string; info: AdvisorInfo } | undefined;
let lastStatAt = 0;

// 与 @juicesharp/rpiv-config 的解析方式保持一致：XDG 路径不存在才回落到 ~/.config。
// ~/.pi/agent/advisor.json 是退役扩展 pi-advisor-flow 的旧文件，字段不同，不读。
function advisorConfigPath(): string {
  const xdgPath = join(resolveConfigDir(), CONFIG_DIR_NAME, CONFIG_FILE_NAME);
  if (existsSync(xdgPath)) return xdgPath;
  const legacyPath = join(homedir(), ".config", CONFIG_DIR_NAME, CONFIG_FILE_NAME);
  return existsSync(legacyPath) ? legacyPath : xdgPath;
}

function resolveConfigDir(): string {
  const xdg = process.env[XDG_CONFIG_ENV]?.trim();
  if (xdg) {
    const expanded =
      xdg === "~" ? homedir() : xdg.startsWith("~/") ? join(homedir(), xdg.slice(2)) : xdg;
    if (isAbsolute(expanded)) return expanded;
  }
  return join(homedir(), ".config");
}

export function readAdvisorInfo(now = Date.now()): AdvisorInfo {
  if (cache && now - lastStatAt < STAT_INTERVAL_MS) return cache.info;
  lastStatAt = now;

  const path = advisorConfigPath();
  let key: string;
  try {
    const stat = statSync(path);
    key = `${path}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    cache = { key: `${path}:missing`, info: {} };
    return cache.info;
  }

  if (cache?.key === key) return cache.info;
  cache = { key, info: parseAdvisorConfig(readFileSync(path, "utf8")) };
  return cache.info;
}

function parseAdvisorConfig(raw: string): AdvisorInfo {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    return {
      model: readString(record.modelKey),
      effort: readString(record.effort),
    };
  } catch {
    return {};
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}