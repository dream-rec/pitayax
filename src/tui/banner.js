import { palette, paint } from "./theme.js";

const PITAYA_ICON = [
  "    ▄▄██████▄▄    ",
  " ◤▄██░░░░•░░░██▄◥ ",
  " ▐██░░•░░░░•░░██▌ ",
  " ▐██░░░░•░░░•░██▌ ",
  " ◣▀██░░•░░░░░██▀◢ ",
  "    ▀▀██████▀▀    ",
];

const ICON_TONES = {
  "█": "skin",
  "▄": "skin",
  "▀": "skin",
  "▐": "skin",
  "▌": "skin",
  "◤": "fin",
  "◥": "fin",
  "◣": "fin",
  "◢": "fin",
  "░": "flesh",
  "•": "seed",
};

const ICON_PALETTE = {
  skin: palette.pink,
  fin: palette.green,
  flesh: palette.flesh,
  seed: palette.seed,
};

function paintIconRow(row) {
  const segments = [];
  for (const char of row) {
    const tone = ICON_TONES[char];
    const text = tone === "flesh" ? " " : char;
    const last = segments[segments.length - 1];
    if (last && last.tone === tone) last.text += text;
    else segments.push({ tone, text });
  }
  return segments
    .map(({ tone, text }) => (tone ? paint(ICON_PALETTE[tone], text) : text))
    .join("");
}

/** Pineapple mark + version, styled like the installer banner. */
export function formatBanner(version) {
  const width = [...PITAYA_ICON[0]].length;
  const label = `v${version}`;
  const indent = " ".repeat(Math.max(0, Math.floor((width - label.length) / 2)));
  return [
    ...PITAYA_ICON.map(paintIconRow),
    `${indent}${paint(palette.dim, label)}`,
  ];
}

/** One-line mark for short terminals. */
export function formatBannerLine(version) {
  return `${paint(palette.pink, "▓▓")} ${paint(palette.bold, "PITAYAX")} ${paint(
    palette.dim,
    `v${version}`,
  )}`;
}
