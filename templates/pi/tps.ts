import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// 把每轮生成的 tok/s 发布给 pi-footer 的 "event" widget（widgetId 固定为 tps）。
const FOOTER_WIDGET_EVENT = "pi-footer:update-widget";
const WIDGET_ID = "tps";
// 每次发布都会触发 footer 重绘，流式期间按固定间隔节流。
const LIVE_EMIT_INTERVAL_MS = 300;

interface Stream {
  firstDeltaAt: number;
  lastDeltaAt: number;
  estimate: number;
}

let stream: Stream | undefined;
// 非流式响应（没有任何 delta）时的兜底时间窗起点。
let messageStartAt: number | undefined;
let lastLiveEmitAt = 0;
let published: string | null = null;

export default function tps(pi: ExtensionAPI): void {
  function publish(value: string | null): void {
    if (value === published) return;
    published = value;
    pi.events.emit(FOOTER_WIDGET_EVENT, { widgetId: WIDGET_ID, value });
  }

  pi.on("message_start", async (event) => {
    if (event.message.role !== "assistant") return;
    // 新请求开始：本轮首个 delta 到达前，界面上继续显示上一轮的冻结值。
    stream = undefined;
    lastLiveEmitAt = 0;
    messageStartAt = Date.now();
  });

  pi.on("message_update", async (event) => {
    const delta = readDelta(event.assistantMessageEvent);
    if (delta === undefined) return;

    const now = Date.now();
    stream ??= { firstDeltaAt: now, lastDeltaAt: now, estimate: 0 };
    stream.lastDeltaAt = now;
    stream.estimate += estimateTokens(delta);

    // 流式期间 provider 基本不报 usage（Anthropic 在 message_start 只给占位值 1），
    // 取较大值：估算值负责实时，usage 一旦到位就接管。
    const tokens = Math.max(stream.estimate, readUsageOutput(event.message));
    const value = formatTps(tokens, stream.firstDeltaAt, now);
    if (value === null) return;
    if (now - lastLiveEmitAt < LIVE_EMIT_INTERVAL_MS) return;
    lastLiveEmitAt = now;
    publish(value);
  });

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;

    const finished = stream;
    stream = undefined;
    // 时间窗自首个 delta 起算（不含 TTFT）；非流式响应退回整段请求时间。
    const first = finished?.firstDeltaAt ?? messageStartAt;
    const last = finished?.lastDeltaAt ?? Date.now();
    messageStartAt = undefined;
    if (first === undefined) return;

    const usageOutput = readUsageOutput(event.message);
    const tokens = usageOutput > 0 ? usageOutput : (finished?.estimate ?? 0);
    if (tokens <= 0) return;
    const value = formatTps(tokens, first, last);
    if (value !== null) publish(value);
  });

  pi.on("session_start", async () => {
    stream = undefined;
    messageStartAt = undefined;
    lastLiveEmitAt = 0;
    publish(null);
  });
}

function formatTps(tokens: number, from: number, to: number): string | null {
  const seconds = (to - from) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const tps = tokens / seconds;
  return Number.isFinite(tps) ? `${Math.round(tps)} tok/s` : null;
}

function readDelta(event: { type: string; delta?: unknown }): string | undefined {
  const streamed =
    event.type === "text_delta" ||
    event.type === "thinking_delta" ||
    event.type === "toolcall_delta";
  return streamed && typeof event.delta === "string" ? event.delta : undefined;
}

function readUsageOutput(message: { usage?: { output?: unknown } }): number {
  const output = message.usage?.output;
  return typeof output === "number" && Number.isFinite(output) ? output : 0;
}

// 估算口径与 provider 的 usage.output 对齐：thinking 与工具调用参数都计入生成量。
function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    tokens += isWideCodePoint(char.codePointAt(0) ?? 0) ? 1 : 0.25;
  }
  return tokens;
}

// CJK 约 1 token/字，拉丁文本约 1 token/4 字符。
function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3000 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0x20000 && codePoint <= 0x3ffff)
  );
}
