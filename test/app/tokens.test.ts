import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The design tokens are the single source of truth for colour; this checks the WCAG contrast of the pairs the components use,
// in the light theme and in the dark one (tokens.css redefines them under prefers-color-scheme: dark).
const css = readFileSync(new URL("../../src/app/styles/tokens.css", import.meta.url), "utf8");

type Vars = Record<string, string>;

function declarations(text: string): Vars {
  const vars: Vars = {};
  for (const m of text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const light = declarations(css.slice(0, darkStart));
const dark = { ...light, ...declarations(css.slice(darkStart)) };

function resolve(vars: Vars, name: string, depth = 0): string {
  const value = vars[name];
  if (value === undefined) throw new Error(`unknown token ${name}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  return alias && depth < 10 ? resolve(vars, alias[1]!, depth + 1) : value;
}

function linearRgb(value: string): [number, number, number] {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)$/.exec(value);
  if (!m) throw new Error(`cannot parse colour ${value}`);
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const hue = (Number(m[4]) * Math.PI) / 180;
  const a = Number(m[3]) * Math.cos(hue);
  const b = Number(m[3]) * Math.sin(hue);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return channels.map((c) => Math.min(1, Math.max(0, c))) as [number, number, number];
}

const luminance = ([r, g, b]: [number, number, number]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function contrast(vars: Vars, fg: string, bg: string): number {
  const a = luminance(linearRgb(resolve(vars, fg)));
  const b = luminance(linearRgb(resolve(vars, bg)));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// [foreground, background, minimum ratio]: 4.5 for text, 3 for graphics, borders and focus rings.
const PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ["--foreground", "--background", 4.5],
  ["--foreground", "--card", 4.5],
  ["--muted-foreground", "--background", 4.5],
  ["--muted-foreground", "--card", 4.5],
  ["--muted-foreground", "--muted", 4.5],
  ["--muted-foreground", "--accent", 4.5],
  ["--muted-foreground", "--hover", 4.5],
  ["--primary", "--card", 4.5],
  ["--primary", "--background", 4.5],
  ["--primary-foreground", "--primary", 4.5],
  ["--accent-foreground", "--accent", 4.5],
  ["--accent-foreground", "--card", 4.5],
  ["--danger-text", "--card", 4.5],
  ["--danger-text", "--background", 4.5],
  ["--danger-foreground", "--danger", 4.5],
  ["--chip-foreground", "--market-au", 4.5],
  ["--chip-foreground", "--market-sg", 4.5],
  ["--chip-foreground", "--status-review", 4.5],
  ["--chip-foreground", "--status-signed", 4.5],
  ["--foreground", "--secondary", 4.5],
  ["--info-fg", "--info-bg", 4.5],
  ["--warn-fg", "--warn-bg", 4.5],
  ["--error-fg", "--error-bg", 4.5],
  ["--success-fg", "--success-bg", 4.5],
  ["--control-border", "--card", 3],
  ["--control-border", "--background", 3],
  ["--ring", "--card", 3],
  ["--ring", "--background", 3],
  ["--viz-gross", "--card", 3],
  ["--viz-net", "--card", 3],
  ["--viz-withheld", "--card", 3],
  ["--viz-unallocated", "--card", 3],
  ["--viz-3", "--card", 3],
  ["--viz-node", "--card", 3],
];

for (const [theme, vars] of [
  ["light", light],
  ["dark", dark],
] as const) {
  describe(`${theme} theme contrast`, () => {
    for (const [fg, bg, minimum] of PAIRS) {
      it(`${fg} on ${bg} is at least ${minimum}:1`, () => {
        const ratio = contrast(vars, fg, bg);
        assert.ok(ratio >= minimum, `${ratio.toFixed(2)}:1`);
      });
    }
  });
}

describe("token sets", () => {
  it("defines every token the dark theme overrides in the light theme too", () => {
    for (const name of Object.keys(declarations(css.slice(darkStart)))) assert.ok(name in light, `${name} has no light value`);
  });

  it("resolves aliases to real colours", () => {
    assert.match(resolve(light, "--background"), /^oklch\(/);
    assert.match(resolve(dark, "--background"), /^oklch\(/);
    assert.notEqual(resolve(light, "--background"), resolve(dark, "--background"));
  });
});
