// pi-footer 状态栏布局由 pitayax 托管：模板的四行结构（执行模型 / 顾问模型 / 上下文 / 目录与 tok/s）
// 必须落到用户已有配置上，否则升级只会保留旧布局。这里只接管这 6 个 widget 及其
// 图标/颜色选项，其余 widget、行和配置项一律保留用户原样。

const OWNED_WIDGETS = [
  { row: 0, type: 'model-provider' },
  { row: 0, type: 'thinking-level' },
  { row: 1, type: 'event', widgetId: 'advisor-model' },
  { row: 1, type: 'event', widgetId: 'advisor-effort' },
  { row: 3, type: 'event', widgetId: 'tps', rowAtLeast: true },
  { row: 2, type: 'external-status', statusKey: 'ctx-line' }
];

const OWNED_OPTIONS = ['icon', 'fg', 'raw', 'hideWhenEmpty'];

const HIDDEN_STATUS_KEYS = ['pi-ssh', 'ctx-line'];
const RETIRED_STATUS_KEYS = ['mcp', 'pitaya-remote'];

function matches(entry, spec) {
  return (
    entry?.type === spec.type &&
    (spec.widgetId === undefined || entry.options?.widgetId === spec.widgetId) &&
    (spec.statusKey === undefined || entry.options?.externalStatusKey === spec.statusKey)
  );
}

function labelOf(spec) {
  return spec.widgetId ?? spec.statusKey ?? spec.type;
}

function linesOf(config) {
  const lines = config?.lines;
  return Array.isArray(lines) && lines.every((line) => Array.isArray(line)) ? lines : undefined;
}

// 同一 widget 出现多次时只保留第一个，多余的删掉，保证结构唯一。
function takeWidget(lines, spec) {
  let kept;
  for (const line of lines) {
    for (let index = line.length - 1; index >= 0; index -= 1) {
      if (!matches(line[index], spec)) continue;
      kept ??= line[index];
      line.splice(index, 1);
    }
  }
  return kept;
}

function findWidget(lines, spec) {
  for (let row = 0; row < lines.length; row += 1) {
    const entry = lines[row].find((candidate) => matches(candidate, spec));
    if (entry) return { row, entry };
  }
  return undefined;
}

function templateWidget(template, spec) {
  const entry = template.lines?.[spec.row]?.find((candidate) => matches(candidate, spec));
  if (!entry) throw new Error(`pi-footer 模板缺少 ${labelOf(spec)}`);
  return structuredClone(entry);
}

function applyOwnedOptions(entry, expected) {
  entry.enabled = true;
  entry.options ??= {};
  for (const key of OWNED_OPTIONS) {
    if (expected.options?.[key] !== undefined) entry.options[key] = expected.options[key];
  }
}

function optionMismatch(entry, expected) {
  return OWNED_OPTIONS.some(
    (key) => expected.options?.[key] !== undefined && entry.options?.[key] !== expected.options[key]
  );
}

export function footerIssues(config, template) {
  const lines = linesOf(config);
  if (!lines) return ['lines 结构无效'];
  const issues = [];
  for (const spec of OWNED_WIDGETS) {
    const label = labelOf(spec);
    const found = findWidget(lines, spec);
    if (!found) {
      issues.push(`缺少 ${label}`);
      continue;
    }
    if (found.entry.enabled === false) issues.push(`${label} 未启用`);
    const rowMismatch = spec.rowAtLeast ? found.row < spec.row : found.row !== spec.row;
    if (rowMismatch) {
      issues.push(
        spec.rowAtLeast
          ? `${label} 不在第 ${spec.row + 1} 行或之后`
          : `${label} 不在第 ${spec.row + 1} 行`
      );
    }
    if (optionMismatch(found.entry, templateWidget(template, spec))) {
      issues.push(`${label} 的图标或配色与模板不一致`);
    }
  }
  if (['hiddenKeys', 'knownKeys'].some((key) => config.extensionStatusRow?.[key]?.includes('mcp'))) {
    issues.push('旧 MCP 状态键残留');
  }
  // pi-ssh 的远端路径现在由 cwd-basename 渲染到目录行，
  // 状态行只留 ponytail。
  for (const key of HIDDEN_STATUS_KEYS) {
    if (!config.extensionStatusRow?.hiddenKeys?.includes(key)) {
      issues.push(`${key} 状态仍占用扩展行`);
    }
  }
  return issues;
}

export function mergeFooterConfig(config, template) {
  const lines = linesOf(config);
  if (!lines) return config;

  const next = structuredClone(config);
  const widgets = OWNED_WIDGETS.map((spec) => takeWidget(next.lines, spec) ?? templateWidget(template, spec));
  // 上下文行独占一行；取走后留下的空行（即它原来的那行）先删掉，最后再插回第 3 行。
  // 模型行、顾问行只含托管 widget 时也会空，只删第 3 行及之后的空行。
  next.lines = next.lines.filter((line, index) => index < 2 || line.length > 0);
  const expected = OWNED_WIDGETS.map((spec) => templateWidget(template, spec));

  // 旧版是两行；新版在中间插入顾问行。已经迁移过的配置保持行序不变。
  if (next.lines.length < 3) next.lines.splice(1, 0, []);
  if (next.lines.length < 3) next.lines.push([]);

  next.lines[0].unshift(widgets[0], widgets[1]);
  next.lines[1].unshift(widgets[2], widgets[3]);

  const host = next.lines.slice(2).find((line) => line.some((entry) => entry.type === 'git-diff')) ?? next.lines.at(-1);
  const gitIndex = host.findIndex((entry) => entry.type === 'git-diff');
  host.splice(gitIndex === -1 ? host.length : gitIndex + 1, 0, widgets[4]);
  next.lines.splice(2, 0, [widgets[5]]);

  for (let index = 0; index < OWNED_WIDGETS.length; index += 1) {
    applyOwnedOptions(widgets[index], expected[index]);
  }

  const row = (next.extensionStatusRow ??= { hiddenKeys: [], knownKeys: [] });
  for (const key of ['hiddenKeys', 'knownKeys']) {
    const keys = Array.isArray(row[key])
      ? row[key].filter((value) => !RETIRED_STATUS_KEYS.includes(value))
      : [];
    for (const statusKey of HIDDEN_STATUS_KEYS) {
      if (!keys.includes(statusKey)) keys.push(statusKey);
    }
    row[key] = keys;
  }
  return next;
}
