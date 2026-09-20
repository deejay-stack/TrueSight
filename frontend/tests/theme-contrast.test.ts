import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getRoleThemeStyle } from "../src/theme/roleThemes";

const rgb = (value: string): number[] => value.startsWith("#")
  ? [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16))
  : value.match(/[\d.]+/g)!.map(Number);
const luminance = (color: number[]) => color.slice(0, 3).map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const composite = (color: number[], background: number[]) => color.slice(0, 3).map((value, index) => value * (color[3] ?? 1) + background[index] * (1 - (color[3] ?? 1)));
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const variables = (dark: boolean) => Object.fromEntries([...css.match(dark ? /:root\.dark\s*\{([^}]+)\}/ : /:root\s*\{([^}]+)\}/)![1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((entry) => [entry[1], entry[2]]));

test("app toggle controls Tailwind dark styles", () => {
  assert.match(css, /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);/);
});

for (const role of ["teacher", "student"] as const) {
  for (const dark of [false, true]) {
    test(`${role} ${dark ? "dark" : "light"} text, statuses, heatmaps, and button labels meet 4.5:1 contrast`, () => {
      const palette = { ...variables(false), ...variables(dark), ...getRoleThemeStyle(role, dark) };
      const surface = rgb(palette["--app-surface"]);
      for (const key of ["--app-text", "--app-muted", "--app-accent", "--status-success", "--status-warning", "--status-danger"]) {
        assert.ok(contrast(rgb(palette[key]), surface) >= 4.5, key);
      }
      for (const stem of ["heatmap-ai", "heatmap-suspicious", "heatmap-human", "impact-negative", "impact-neutral"]) {
        assert.ok(contrast(rgb(palette[`--${stem}-text`]), composite(rgb(palette[`--${stem}-bg`]), surface)) >= 4.5, stem);
      }
      const left = rgb(palette["--app-accent"]);
      const right = rgb(palette["--app-accent-2"]);
      for (let step = 0; step <= 10; step++) {
        const gradient = left.map((value, index) => value * (1 - step / 10) + right[index] * step / 10);
        assert.ok(contrast(rgb(palette["--app-on-accent"]), gradient) >= 4.5, `button gradient ${step}`);
      }
    });
  }
}
