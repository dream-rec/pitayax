import type { GradientPaletteName } from "./colors.js";

type Rgb = readonly [number, number, number];

// 每个色板都是闭环渐变：末色回到首色，相位横移时接缝处不会跳变。
const PALETTES: Record<GradientPaletteName, readonly Rgb[]> = {
  retro: [
    [63, 81, 177],
    [90, 85, 174],
    [123, 95, 172],
    [143, 106, 174],
    [168, 106, 164],
    [204, 107, 142],
    [241, 130, 113],
    [243, 164, 105],
    [247, 201, 120],
  ],
  ice: [
    [28, 64, 150],
    [40, 116, 200],
    [72, 178, 226],
    [132, 224, 242],
    [206, 246, 253],
  ],
  mint: [
    [18, 92, 72],
    [34, 158, 112],
    [92, 214, 158],
    [176, 246, 206],
  ],
  ember: [
    [148, 24, 48],
    [214, 58, 48],
    [246, 132, 44],
    [252, 196, 72],
  ],
  violet: [
    [72, 48, 186],
    [132, 84, 222],
    [190, 112, 236],
    [238, 150, 214],
  ],
};

export const RETRO_FRAME_INTERVAL_MS = 140;
const RETRO_CYCLE_MS = 5000;

export function gradientText(
  text: string,
  now = Date.now(),
  bold = false,
  palette: GradientPaletteName = "retro",
): string {
  const chars = Array.from(text);
  if (chars.length === 0) return "";
  const stops = PALETTES[palette] ?? PALETTES.retro;
  const phase = (now / RETRO_CYCLE_MS) % 1;
  const colorPrefix = bold ? "1;38;2" : "38;2";
  return chars
    .map((char, index) => {
      const position = chars.length === 1 ? phase : index / (chars.length - 1) + phase;
      const [r, g, b] = sampleLoopingGradient(stops, position);
      return `\x1b[${colorPrefix};${r};${g};${b}m${char}\x1b[0m`;
    })
    .join("");
}

function sampleLoopingGradient(stops: readonly Rgb[], t: number): Rgb {
  if (stops.length === 0) return [255, 255, 255];
  if (stops.length === 1) return stops[0] ?? [255, 255, 255];

  const wrapped = ((t % 1) + 1) % 1;
  const scaled = wrapped * stops.length;
  const index = Math.floor(scaled) % stops.length;
  const mix = scaled - Math.floor(scaled);
  const left = stops[index] ?? stops[0] ?? [255, 255, 255];
  const right = stops[(index + 1) % stops.length] ?? left;
  return [
    Math.round(left[0] + (right[0] - left[0]) * mix),
    Math.round(left[1] + (right[1] - left[1]) * mix),
    Math.round(left[2] + (right[2] - left[2]) * mix),
  ];
}