// House style for every word a person can read: no long dashes, Title Case
// for names and buttons, Apple-style wording, and one version number
// everywhere.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, read, exists, manifest, attrs, stripTags } = require("./helpers");

const TEXT_ENDINGS = [".js", ".html", ".css", ".md", ".json", ".yml", ".py"];

function textFiles(dir, out) {
  const list = out || [];
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    if (name === ".git" || name === "node_modules") continue;
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) {
      textFiles(rel, list);
    } else if (name === "LICENSE" || TEXT_ENDINGS.some((e) => name.endsWith(e))) {
      list.push(rel);
    }
  }
  return list;
}

const ALL_TEXT = textFiles(".");
const SHIPPED_JS = ["background.js", "popup.js", "options.js", "sparkdrop.js", "expensifydrop.js", "activitylog.js"];
const PAGES = ["popup.html", "options.html", "privacy.html"];
const DOCS = ["README.md", "CHANGELOG.md", "PRIVACY.md"];

test("no em dashes or en dashes anywhere in the repo", () => {
  assert.ok(ALL_TEXT.length >= 25);
  const dash = new RegExp("[\\u2012\\u2013\\u2014\\u2015]|&(m|n)dash;|&#(8211|8212|x2013|x2014);", "i");
  assert.match(String.fromCharCode(0x2014), dash);
  assert.match(String.fromCharCode(0x2013), dash);
  for (const file of ALL_TEXT) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      assert.doesNotMatch(line, dash, file + ":" + (i + 1));
    });
  }
});

// Words people read: pages and docs in full, scripts minus their comments.
function readable(file) {
  const src = read(file);
  if (!file.endsWith(".js")) return src;
  return src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

test("wording follows the Apple Style Guide choices for this project", () => {
  const rules = [
    [/\bokay\b/i, 'say "OK"'],
    [/\be-mail/i, 'say "email"'],
    [/error message/i, 'say "alert" or "message"'],
    [/click and drag/i, 'say "drag"'],
    [/(?<!Activity )\blog(ged|ging)?[ -]?in\b/i, 'say "sign in"'],
    [/\blog[ -]?out\b/i, 'say "sign out"'],
    [/\bsignin\b/i, 'say "sign in" or "sign-in"'],
    [/\bcan not\b/i, 'say "can\'t"']
  ];
  for (const file of [...PAGES, ...DOCS, ...SHIPPED_JS, "manifest.json"]) {
    const text = readable(file);
    for (const [re, fix] of rules) {
      assert.doesNotMatch(text, re, file + ": " + fix);
    }
  }
});

const SMALL = new Set(["a", "an", "the", "and", "or", "but", "nor", "for", "to", "of", "in", "on", "at", "by", "as"]);

// Words that should start with a capital but don't. Small words may be
// lowercase in the middle of a title. File names, links and code are skipped.
function notTitleCase(title) {
  const words = title.replace(/`[^`]*`/g, " ").split(/\s+/).filter(Boolean);
  const bad = [];
  words.forEach((raw, i) => {
    const word = raw.replace(/^[^A-Za-z0-9]+/, "").replace(/[.,:;!?)]+$/, "");
    if (!word || /[./:@\\]/.test(word) || /^[0-9]/.test(word)) return;
    const middle = i > 0 && i < words.length - 1;
    if (middle && SMALL.has(word.toLowerCase())) return;
    if (word[0] !== word[0].toUpperCase()) bad.push(raw);
  });
  return bad;
}

function assertTitle(title, where) {
  assert.deepEqual(notTitleCase(title), [], where + ': "' + title + '" should be Title Case');
}

test("the Title Case checker itself works", () => {
  assert.deepEqual(notTitleCase("Grab All Tabs in This Window"), []);
  assert.deepEqual(notTitleCase("Send Receipts To"), []);
  assert.deepEqual(notTitleCase("What We Never Collect"), []);
  assert.deepEqual(notTitleCase("Drop It In for Me"), []);
  assert.deepEqual(notTitleCase("4.1.0, October 2026"), []);
  assert.deepEqual(notTitleCase("Recent grabs"), ["grabs"]);
  assert.deepEqual(notTitleCase("What it does"), ["it", "does"]);
  assert.deepEqual(notTitleCase("to the Moon"), ["to"]);
});

test("page titles, headings, buttons and labels are in Title Case", () => {
  const picks = [
    /<title>([\s\S]*?)<\/title>/g,
    /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/g,
    /<legend\b[^>]*>([\s\S]*?)<\/legend>/g,
    /<button\b[^>]*>([\s\S]*?)<\/button>/g,
    /<th\b[^>]*>([\s\S]*?)<\/th>/g,
    /<option\b[^>]*>([\s\S]*?)<\/option>/g,
    /<label\b[^>]*\bfor="[^"]*"[^>]*>([\s\S]*?)<\/label>/g,
    /<strong>([^<]*)<\/strong><small>/g,
    /<p id="(?:empty|logEmpty)"><strong>([^<]*)<\/strong>/g,
    /<a href="privacy\.html"[^>]*>([\s\S]*?)<\/a>/g,
    /<span class="credit">([\s\S]*?)<\/span>/g
  ];
  let seen = 0;
  for (const page of PAGES) {
    const html = read(page);
    for (const re of picks) {
      for (const m of html.matchAll(re)) {
        assertTitle(stripTags(m[1]), page);
        seen++;
      }
    }
  }
  assert.ok(seen >= 45, "expected to check many titles, saw " + seen);
});

test("doc headings and the feature list are in Title Case", () => {
  for (const doc of DOCS) {
    const headings = read(doc).split("\n").filter((l) => /^#{1,4} /.test(l));
    assert.ok(headings.length >= 5, doc);
    for (const h of headings) assertTitle(h.replace(/^#+ /, ""), doc);
  }
  const readme = read("README.md");
  const table = readme.slice(readme.indexOf("## Features"), readme.indexOf("## Install"));
  const rows = table.split("\n").filter((l) => /^\| [A-Z]/.test(l));
  const features = rows.map((r) => r.split("|")[1].trim()).filter((f) => f !== "Feature");
  assert.ok(features.length >= 12);
  for (const f of features) assertTitle(f, "README feature");
});

test("names set from scripts and the manifest are in Title Case", () => {
  const m = manifest();
  assertTitle(m.name, "manifest name");
  assertTitle(m.action.default_title, "manifest toolbar title");
  assertTitle(m.commands["send-page"].description, "manifest shortcut");

  const log = require(path.join(ROOT, "activitylog.js"));
  for (const name of Object.values(log.STEPS)) assertTitle(name, "Activity Log step");

  const worker = read("background.js");
  const menus = [...worker.matchAll(/title: "([^"]+)" \+ label/g)].map((x) => x[1] + "SparkReceipt");
  assert.equal(menus.length, 2);
  for (const title of menus) assertTitle(title, "right-click menu");

  const popup = read("popup.js");
  const buttons = [...popup.matchAll(/textContent = "([^"]+)"/g)].map((x) => x[1]);
  assert.ok(buttons.includes("Working...") && buttons.includes("Grabbing All Tabs..."));
  for (const text of buttons) assertTitle(text, "popup button");
  const words = popup.slice(popup.indexOf("const STATUS_WORDS"), popup.indexOf("};", popup.indexOf("const STATUS_WORDS")));
  for (const x of words.matchAll(/: "([^"]+)"/g)) assertTitle(x[1], "popup status word");
});

test("the version number is the same everywhere", () => {
  const version = manifest().version;
  assert.equal(JSON.parse(read("package.json")).version, version);
  const readme = read("README.md");
  assert.equal(readme.match(/badge\/version-([0-9.]+)-0d9488/)[1], version);
  assert.match(readme, new RegExp("The latest is " + version.replace(/\./g, "\\.") + ":"));
  const changelog = read("CHANGELOG.md");
  assert.equal(changelog.match(/^## ([0-9.]+),/m)[1], version, "CHANGELOG.md should start with the current version");
  const versions = [...changelog.matchAll(/^## ([0-9.]+),/gm)].map((x) => x[1]);
  const asNumber = (v) => v.split(".").reduce((n, part) => n * 1000 + Number(part), 0);
  for (let i = 1; i < versions.length; i++) {
    assert.ok(asNumber(versions[i - 1]) > asNumber(versions[i]), "CHANGELOG.md should list the newest version first");
  }
});

test("both copies of the privacy policy say the same thing", () => {
  const html = read("privacy.html");
  const md = read("PRIVACY.md");
  const htmlHeads = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((x) => x[1]);
  const mdHeads = md.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3));
  assert.deepEqual(mdHeads, htmlHeads);
  const flat = (s) => s.replace(/\*\*/g, "").replace(/^- /gm, "").replace(/\s+/g, " ").replace(/ ([,:.])/g, "$1");
  const htmlText = flat(stripTags(html.slice(html.indexOf("<main>"), html.indexOf("</main>"))));
  const mdBody = flat(md.slice(md.indexOf("## The Short Version")).replace(/^## /gm, ""));
  const sameUntil = "Questions? Open an issue on";
  assert.equal(mdBody.slice(0, mdBody.indexOf(sameUntil)), htmlText.slice(0, htmlText.indexOf(sameUntil)));
  for (const doc of [html, md]) {
    assert.match(doc, /Activity Log/);
    assert.match(doc, /up to 500 steps/);
    assert.match(doc, /[Ll]ast updated October 2026/);
  }
});

test("the README is honest about what was and wasn't verified", () => {
  const readme = read("README.md");
  assert.match(readme, /last verified against the live apps in August 2026/);
  assert.match(readme, /wasn't checked against the live apps again/);
});

test("every screenshot the README shows is in the repo, and none is orphaned", () => {
  const readme = read("README.md");
  const shown = [...readme.matchAll(/docs\/screenshots\/[a-z0-9-]+\.png/g)].map((x) => x[0]);
  assert.ok(new Set(shown).size >= 10);
  for (const file of shown) {
    assert.ok(exists(file), file + " is missing");
    const head = fs.readFileSync(path.join(ROOT, file)).subarray(1, 4).toString("latin1");
    assert.equal(head, "PNG", file);
  }
  for (const img of attrs(readme, "img", "alt")) assert.ok(img.length > 10, "screenshots need a description");
  // Everything in the folder is produced by tools/screenshots.py
  const maker = read("tools/screenshots.py");
  for (const name of fs.readdirSync(path.join(ROOT, "docs/screenshots"))) {
    const stem = name.replace(/-(light|dark)\.png$/, "");
    assert.ok(maker.includes('"' + stem + '-') || maker.includes('"' + name + '"'), name + " isn't made by tools/screenshots.py");
  }
});
