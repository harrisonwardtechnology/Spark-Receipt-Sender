// tools/live_check.py looks for the same page parts on the live sites that the
// two content scripts use. It reads them from tools/live_selectors.json, a
// copy kept next to it so the content scripts never change for its sake.
// These tests keep that copy in step with the scripts, both ways.

const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers");

const LIST = JSON.parse(read("tools/live_selectors.json"));
const SITES = ["sparkreceipt", "expensify"];

// Every selector string a script passes to querySelector or querySelectorAll
function selectorsIn(src) {
  return [...src.matchAll(/querySelector(?:All)?\(\s*(["'])(.*?)\1\s*\)/g)].map((m) => m[2]);
}

// Every case-insensitive regex literal: in these scripts, they all match
// words on the page (button names, menu items, the drop zone).
function textPatternsIn(src) {
  return [...src.matchAll(/\/[\^a-z(][^/\n]*\/i/g)].map((m) => m[0]);
}

test("the live check lists both sites and their scripts", () => {
  assert.deepEqual(Object.keys(LIST).filter((k) => k !== "about"), SITES);
  assert.equal(LIST.sparkreceipt.script, "sparkdrop.js");
  assert.equal(LIST.expensify.script, "expensifydrop.js");
  assert.equal(LIST.sparkreceipt.url, "https://app.sparkreceipt.com/");
  assert.equal(LIST.expensify.url, "https://new.expensify.com/");
});

test("every selector in the live check list is in its content script", () => {
  for (const site of SITES) {
    const { script, selectors } = LIST[site];
    const used = selectorsIn(read(script));
    for (const [name, sel] of Object.entries(selectors)) {
      assert.ok(used.includes(sel), script + " no longer uses " + name + ": " + sel);
    }
  }
});

test("every selector a content script uses is in the live check list", () => {
  for (const site of SITES) {
    const { script, selectors } = LIST[site];
    const listed = Object.values(selectors);
    const used = selectorsIn(read(script));
    assert.ok(used.length >= 7, script);
    for (const sel of used) {
      assert.ok(listed.includes(sel), "tools/live_selectors.json is missing " + sel + " from " + script);
    }
  }
});

test("button and menu wording in the list matches the content scripts, both ways", () => {
  for (const site of SITES) {
    const { script, text } = LIST[site];
    const src = read(script);
    const listed = Object.values(text);
    for (const [name, pattern] of Object.entries(text)) {
      assert.ok(src.includes(pattern), script + " no longer has " + name + ": " + pattern);
      assert.match(pattern, /^\/.+\/i$/, name);
    }
    for (const pattern of new Set(textPatternsIn(src))) {
      assert.ok(listed.includes(pattern), "tools/live_selectors.json is missing " + pattern + " from " + script);
    }
  }
});

test("the live check never clicks the button that finishes an upload", () => {
  assert.deepEqual(LIST.sparkreceipt.neverClick, ["confirmButton"]);
  assert.deepEqual(LIST.expensify.neverClick, ["createExpense", "submitExpense", "trackExpense", "createAmount", "submitAmount"]);
  for (const site of SITES) {
    for (const name of LIST[site].neverClick) assert.ok(LIST[site].text[name], name);
  }
  const py = read("tools/live_check.py");
  // No file is ever handed to a page, and no drop is ever made
  for (const banned of ["set_input_files", "setInputFiles", "DataTransfer", "dispatchEvent", "expect_file_chooser", "fill(", "type(", "password"]) {
    assert.ok(!py.includes(banned), "tools/live_check.py should not use " + banned);
  }
  assert.match(py, /neverClick/);
});
