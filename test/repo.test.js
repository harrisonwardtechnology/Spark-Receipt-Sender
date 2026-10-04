// Promises this repo makes: zero dependencies, no remote code, no telemetry,
// and a test workflow that is careful with GitHub Actions minutes.

const test = require("node:test");
const assert = require("node:assert/strict");
const { read, exists } = require("./helpers");

const SHIPPED_JS = ["background.js", "popup.js", "options.js", "sparkdrop.js", "expensifydrop.js", "activitylog.js"];

test("package.json only holds the test command", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.scripts, { test: "node --test test/" });
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "main", "bin"]) {
    assert.equal(pkg[key], undefined, key);
  }
  for (const file of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "node_modules"]) {
    assert.ok(!exists(file), file + " should not exist");
  }
});

test("the extension only knows the web addresses it needs", () => {
  const allowed = ["app.sparkreceipt.com", "new.expensify.com", "mail.google.com"];
  for (const file of SHIPPED_JS) {
    for (const m of read(file).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      assert.ok(allowed.includes(m[1].toLowerCase()), file + " mentions " + m[0]);
    }
  }
});

test("no analytics, telemetry, error tracking or remote code", () => {
  const banned = [
    "XMLHttpRequest",
    "sendBeacon",
    "WebSocket",
    "EventSource",
    "eval(",
    "new Function(",
    "google-analytics",
    "googletagmanager",
    "sentry",
    "glitchtip",
    "umami",
    "posthog",
    "segment.io"
  ];
  for (const file of [...SHIPPED_JS, "popup.html", "options.html", "privacy.html", "manifest.json", "theme.css"]) {
    const src = read(file).toLowerCase();
    for (const word of banned) {
      assert.ok(!src.includes(word.toLowerCase()), file + " contains " + word);
    }
  }
  // Only the service worker fetches anything: the image the user asked for.
  for (const file of SHIPPED_JS.filter((f) => f !== "background.js")) {
    assert.ok(!read(file).includes("fetch("), file + " should not fetch");
  }
  const worker = read("background.js");
  assert.equal((worker.match(/fetch\(/g) || []).length, 4);
  assert.equal((worker.match(/importScripts\(/g) || []).length, 1);
});

test("the test workflow is lean and read-only", () => {
  const yml = read(".github/workflows/test.yml");
  const top = [...yml.matchAll(/^([a-z_-]+):/gm)].map((m) => m[1]);
  assert.deepEqual(top, ["name", "on", "permissions", "concurrency", "jobs"]);
  const triggers = [...yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:")).matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(triggers, ["pull_request", "push"]);
  assert.match(yml, /push:\n {4}branches: \[main\]/);
  assert.equal((yml.match(/paths-ignore:\n {6}- "\*\*\.md"\n {6}- "docs\/\*\*"/g) || []).length, 2);
  assert.match(yml, /\npermissions:\n {2}contents: read\n/);
  assert.match(yml, /cancel-in-progress: true/);
  assert.match(yml, /timeout-minutes: 5\n/);
  assert.equal((yml.match(/runs-on:/g) || []).length, 1);
  assert.match(yml, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(yml, /npm (ci|install|i)\b|yarn|pnpm/);
  assert.doesNotMatch(yml, /schedule:|workflow_dispatch|matrix:/);
  const uses = [...yml.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.equal(uses.length, 2);
  assert.match(uses[0], /^actions\/checkout@v\d+$/);
  assert.match(uses[1], /^actions\/setup-node@v\d+$/);
  assert.match(yml, /- run: node --test test\/\n/);
});

test("Dependabot watches GitHub Actions only, monthly", () => {
  const yml = read(".github/dependabot.yml");
  const ecosystems = [...yml.matchAll(/package-ecosystem: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ecosystems, ["github-actions"]);
  assert.match(yml, /interval: "monthly"/);
});

test("the helper scripts stay out of the extension", () => {
  const manifest = read("manifest.json");
  assert.ok(!manifest.includes("tools/"));
  assert.ok(!manifest.includes("test/"));
  for (const page of ["popup.html", "options.html", "privacy.html"]) {
    assert.ok(!read(page).includes("chrome_stub"), page);
  }
});
