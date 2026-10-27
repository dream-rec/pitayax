const colorEnabled = process.stdout.isTTY && !process.env.NO_COLOR;

function supports256() {
  return (
    colorEnabled &&
    typeof process.stdout.hasColors === "function" &&
    process.stdout.hasColors(256)
  );
}

export const palette = supports256()
  ? {
      pink: "38;5;198",
      green: "38;5;76",
      cyan: "38;5;51",
      yellow: "38;5;220",
      red: "38;5;203",
      gray: "38;5;245",
      white: "38;5;255",
      flesh: "48;5;255",
      seed: "38;5;235;48;5;255",
      dim: "2",
      bold: "1",
      inverse: "7",
      reset: "0",
    }
  : {
      pink: "95",
      green: "92",
      cyan: "96",
      yellow: "93",
      red: "91",
      gray: "90",
      white: "97",
      flesh: "107",
      seed: "30;107",
      dim: "2",
      bold: "1",
      inverse: "7",
      reset: "0",
    };

export function paint(code, text) {
  return colorEnabled ? `\u001B[${code}m${text}\u001B[0m` : text;
}

export function bold(text) {
  return paint(palette.bold, text);
}

export function dim(text) {
  return paint(palette.dim, text);
}

export function stripAnsi(text) {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function charWidth(char) {
  const code = char.codePointAt(0);
  if (code === undefined) return 0;
  if (code < 32) return 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) {
    return 2;
  }
  return 1;
}

export function visibleWidth(text) {
  let width = 0;
  for (const char of stripAnsi(text)) width += charWidth(char);
  return width;
}

export function truncate(text, maxWidth) {
  if (maxWidth <= 0) return "";
  let result = "";
  let width = 0;
  for (const char of text) {
    const next = charWidth(char);
    if (width + next > maxWidth) return `${result}…`;
    result += char;
    width += next;
  }
  return result;
}

export function padRight(text, width) {
  const gap = width - visibleWidth(text);
  return gap > 0 ? `${text}${" ".repeat(gap)}` : text;
}

export function wrap(text, width, maxLines = Number.POSITIVE_INFINITY) {
  if (width <= 0) return [];
  const lines = [];
  let current = "";
  let currentWidth = 0;

  for (const char of text) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      currentWidth = 0;
      continue;
    }
    const next = charWidth(char);
    if (currentWidth + next > width) {
      lines.push(current);
      current = char;
      currentWidth = next;
    } else {
      current += char;
      currentWidth += next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncate(`${kept[maxLines - 1]}…`, width);
    return kept;
  }
  return lines;
}
