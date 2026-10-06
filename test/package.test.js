// The Chrome Web Store zip (tools/package.py) holds exactly the files the
// extension needs at runtime. This checks the list the script works out.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, read, manifest } = require("./helpers");

const EXPECTED = [
  "activitylog.js",
  "background.js",
  "expensifydrop.js",
  "icons/icon128.png",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "manifest.json",
  "options.html",
  "options.js",
  "popup.html",
  "popup.js",
  "privacy.html",
  "sparkdrop.js",
  "theme.css"
];

function python() {
  for (const cmd of ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  return null;
}

const PY = python();

test("the store zip holds exactly the runtime files", { skip: !PY && "Python isn't installed" }, () => {
  const r = spawnSync(PY, [path.join(ROOT, "tools", "package.py"), "--list"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const files = JSON.parse(r.stdout);
  assert.deepEqual(files, EXPECTED);
});

test("the expected list covers everything the manifest points to, and nothing else", () => {
  const m = manifest();
  const named = [
    m.background.service_worker,
    m.action.default_popup,
    m.options_page,
    ...m.content_scripts.flatMap((c) => c.js),
    ...Object.values(m.icons),
    ...Object.values(m.action.default_icon)
  ];
  for (const file of named) assert.ok(EXPECTED.includes(file), file);
  for (const file of EXPECTED) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file + " is missing");
    assert.doesNotMatch(file, /^(test|tools|docs|store|dist|\.github)\//);
    assert.ok(!["package.json", "README.md", "LICENSE"].includes(file));
  }
  // Every script, page and stylesheet at the top of the repo ships
  const top = fs.readdirSync(ROOT).filter((f) => /\.(js|html|css)$/.test(f));
  for (const file of top) assert.ok(EXPECTED.includes(file), file + " isn't in the zip");
});

test("built zips stay out of git", () => {
  assert.match(read(".gitignore"), /^dist\/$/m);
});
