// The manifest is the extension's contract with Chrome and with the user.
// These tests keep it valid and keep its permissions from quietly growing.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, read, exists, manifest } = require("./helpers");

const m = manifest();

test("manifest is Manifest V3 with a name and a plain version", () => {
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, "Receipt Sender");
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(m.description.length > 0 && m.description.length <= 132);
});

test("site access is limited to the two receipt services", () => {
  assert.deepEqual(m.host_permissions, [
    "https://app.sparkreceipt.com/*",
    "https://new.expensify.com/*"
  ]);
});

test("the only broad access is optional", () => {
  assert.deepEqual(m.optional_host_permissions, ["<all_urls>"]);
});

test("permissions have not grown", () => {
  assert.deepEqual(m.permissions.slice().sort(), [
    "activeTab",
    "contextMenus",
    "downloads",
    "scripting",
    "storage",
    "unlimitedStorage"
  ]);
});

test("nothing risky is declared", () => {
  for (const key of [
    "externally_connectable",
    "web_accessible_resources",
    "content_security_policy",
    "oauth2",
    "update_url"
  ]) {
    assert.equal(m[key], undefined, key + " should not be set");
  }
  assert.ok(!m.permissions.includes("debugger"));
  assert.ok(!m.permissions.includes("tabs"));
  assert.ok(!m.permissions.includes("webRequest"));
});

test("content scripts only run on the two service sites", () => {
  assert.equal(m.content_scripts.length, 2);
  assert.deepEqual(m.content_scripts[0], {
    matches: ["https://app.sparkreceipt.com/*"],
    js: ["sparkdrop.js"],
    run_at: "document_idle"
  });
  assert.deepEqual(m.content_scripts[1], {
    matches: ["https://new.expensify.com/*"],
    js: ["expensifydrop.js"],
    run_at: "document_idle"
  });
});

test("every file the manifest points to exists", () => {
  const files = [
    m.background.service_worker,
    m.action.default_popup,
    m.options_page,
    ...m.content_scripts.flatMap((c) => c.js),
    ...Object.values(m.icons),
    ...Object.values(m.action.default_icon)
  ];
  for (const file of files) {
    assert.ok(exists(file), file + " is missing");
  }
});

test("the service worker is a classic script (it uses importScripts)", () => {
  assert.equal(m.background.type, undefined);
  const worker = read(m.background.service_worker);
  const imports = [...worker.matchAll(/importScripts\(([^)]*)\)/g)].map((x) => x[1].trim());
  assert.deepEqual(imports, ['"activitylog.js"']);
  assert.ok(exists("activitylog.js"));
});

test("icons are PNG files of the size they claim", () => {
  for (const [size, file] of Object.entries(m.icons)) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", file);
    assert.equal(buf.readUInt32BE(16), Number(size), file + " width");
    assert.equal(buf.readUInt32BE(20), Number(size), file + " height");
  }
  assert.deepEqual(Object.keys(m.icons), ["16", "32", "48", "128"]);
});

test("the keyboard shortcut is still Alt+Shift+S", () => {
  assert.equal(m.commands["send-page"].suggested_key.default, "Alt+Shift+S");
});
