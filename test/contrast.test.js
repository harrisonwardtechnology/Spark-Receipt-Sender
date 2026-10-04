// Color contrast, worked out from the color tokens in theme.css.
// WCAG AA asks for 4.5:1 for normal text and 3:1 for large text and for
// things like focus outlines.

const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    out[m[1]] = m[2];
  }
  return out;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = read("theme.css");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const light = tokens(css.slice(css.indexOf(":root {"), darkStart));
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf("*,", darkStart))) };

// [text color, background color, minimum ratio]
const TEXT_PAIRS = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text", "paper", 4.5],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "paper", 4.5],
  ["accent-text", "surface", 4.5],
  ["accent-text", "bg", 4.5],
  ["accent-text", "paper", 4.5],
  ["on-button", "button", 4.5],
  ["on-button", "button-hover", 4.5],
  ["on-soft", "soft", 4.5],
  ["on-soft", "soft-hover", 4.5],
  ["good", "surface", 4.5],
  ["good", "paper", 4.5],
  ["bad", "surface", 4.5],
  ["bad", "paper", 4.5],
  ["focus", "surface", 3],
  ["focus", "bg", 3],
  ["accent", "surface", 3]
];

test("both color sets define the same tokens", () => {
  assert.ok(Object.keys(light).length >= 17);
  assert.deepEqual(Object.keys(tokens(css.slice(darkStart, css.indexOf("*,", darkStart)))).sort(), Object.keys(light).sort());
});

for (const [name, set] of [["light", light], ["dark", dark]]) {
  test(name + " mode text meets WCAG AA contrast", () => {
    for (const [fg, bg, min] of TEXT_PAIRS) {
      const ratio = contrast(set[fg], set[bg]);
      assert.ok(ratio >= min, name + ": " + fg + " on " + bg + " is " + ratio.toFixed(2) + ":1, needs " + min + ":1");
    }
  });
}

test("the notes shown on the service pages are readable", () => {
  const pick = (file) => {
    const m = read(file).match(/background:(#[0-9a-f]{6});color:(#[0-9a-f]{6});/i);
    return contrast(m[2], m[1]);
  };
  assert.ok(pick("sparkdrop.js") >= 4.5);
  assert.ok(pick("expensifydrop.js") >= 4.5);
});

test("the contrast math is right", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
});
