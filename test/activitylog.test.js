// The Activity Log must stay small, stay local, and never hold anything
// sensitive. These tests pin that down.

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { read, fakeChrome, fastTimers } = require("./helpers");

// A fresh copy of activitylog.js with its own fake storage.
function load(opts) {
  const { chrome, calls } = fakeChrome(opts);
  const timers = fastTimers();
  const sandbox = { chrome, URL, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("activitylog.js"), sandbox, { filename: "activitylog.js" });
  return { log: sandbox.ActivityLog, chrome, calls };
}

const { log } = load();

test("web addresses are trimmed to the site name", () => {
  assert.equal(log.hostOnly("https://www.amazon.com/gp/css/order-details?orderID=114-1&token=abc"), "amazon.com");
  assert.equal(log.hostOnly("http://Riders.Uber.com:8443/trips/9f2"), "riders.uber.com");
  assert.equal(log.hostOnly("homedepot.com"), "homedepot.com");
  assert.equal(log.hostOnly("homedepot.com/order/123?x=1"), "homedepot.com");
  assert.equal(log.hostOnly("chrome://extensions/"), "extensions");
});

test("things that are not a site name are dropped", () => {
  assert.equal(log.hostOnly(""), "");
  assert.equal(log.hostOnly(undefined), "");
  assert.equal(log.hostOnly(42), "");
  assert.equal(log.hostOnly("not a host name"), "");
  assert.equal(log.hostOnly("javascript:alert(1)"), "");
  assert.equal(log.hostOnly("data:image/png;base64,AAAA"), "");
  assert.equal(log.hostOnly("<img src=x>"), "");
});

test("notes lose links, data, email addresses and line breaks", () => {
  assert.equal(
    log.scrub('Cannot access contents of url "https://shop.example.com/orders/77?session=SECRET". Extension manifest must request permission.'),
    'Cannot access contents of url "shop.example.com". Extension manifest must request permission.'
  );
  assert.equal(log.scrub("failed on data:image/png;base64,iVBORw0KGgoAAAANS then stopped"), "failed on [data] then stopped");
  assert.equal(log.scrub("sent to harrison.q7@in.example.com ok"), "sent to [email] ok");
  assert.equal(log.scrub("line one\n\tline two   end"), "line one line two end");
  assert.equal(log.scrub(null), "");
});

test("notes are cut to a short length", () => {
  const long = log.scrub("x".repeat(1000));
  assert.equal(long.length, log.MAX_DETAIL);
  assert.ok(long.endsWith("..."));
});

test("an entry keeps only the known, safe fields", () => {
  const entry = log.makeEntry(
    "grab_started",
    {
      grabId: "3f6c1c1e-8a54-4d0b-9a57-0f6f4a1b2c01",
      host: "https://www.amazon.com/orders/1?token=abc",
      service: "sparkreceipt",
      detail: "Page",
      title: "Order 114 for Harrison",
      url: "https://www.amazon.com/orders/1?token=abc",
      b64: "AAAA"
    },
    1790968325000
  );
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), {
    ts: 1790968325000,
    step: "grab_started",
    grabId: "3f6c1c1e-8a54-4d0b-9a57-0f6f4a1b2c01",
    host: "amazon.com",
    service: "sparkreceipt",
    detail: "Page"
  });
});

test("unknown steps, odd ids and unknown services are refused", () => {
  assert.equal(log.makeEntry("made_up_step", {}, 1), null);
  assert.equal(log.makeEntry("constructor", {}, 1), null);
  const entry = log.makeEntry("file_saved", { grabId: "<script>", service: "evilcorp" }, 1);
  assert.deepEqual(Object.keys(entry), ["ts", "step"]);
});

test("the log keeps the newest 500 entries", () => {
  assert.equal(log.MAX_ENTRIES, 500);
  let list = [];
  for (let i = 0; i < 650; i++) {
    list = log.append(list, { ts: i, step: "file_saved" });
  }
  assert.equal(list.length, 500);
  assert.equal(list[0].ts, 150);
  assert.equal(list[499].ts, 649);
  assert.equal(log.append(undefined, null).length, 0);
});

test("every step has a Title Case name and a tone", () => {
  for (const [step, name] of Object.entries(log.STEPS)) {
    assert.match(name, /^[A-Z]/, step);
    assert.ok(["good", "bad", "plain"].includes(log.tone(step)));
  }
  assert.equal(log.tone("upload_confirmed"), "good");
  assert.equal(log.tone("upload_missed"), "bad");
  assert.equal(log.tone("grab_failed"), "bad");
  assert.equal(log.label("nope"), "Other Step");
});

test("later steps of a grab pick up the site name for display", () => {
  const rows = log.withSites([
    { ts: 1, step: "grab_started", grabId: "a1", host: "amazon.com" },
    { ts: 2, step: "file_saved", grabId: "a1" },
    { ts: 3, step: "service_opened" }
  ]);
  assert.equal(rows[1].host, "amazon.com");
  assert.equal(rows[2].host, undefined);
});

test("CSV export quotes cells and defuses spreadsheet formulas", () => {
  const csv = log.toCsv([
    { ts: Date.UTC(2026, 9, 2, 19, 12, 5), step: "grab_started", grabId: "a1", host: "amazon.com", service: "sparkreceipt", detail: "Page" },
    { ts: Date.UTC(2026, 9, 2, 19, 12, 9), step: "grab_failed", grabId: "a1", detail: '=HYPERLINK("x","y"), then stopped' }
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Time,Step,Site,Service,Details,Grab ID");
  assert.equal(lines[1], "2026-10-02T19:12:05.000Z,Grab Started,amazon.com,SparkReceipt,Page,a1");
  assert.equal(lines[2], '2026-10-02T19:12:09.000Z,Grab Failed,amazon.com,,"\'=HYPERLINK(""x"",""y""), then stopped",a1');
  assert.equal(lines[3], "");
});

test("JSON export is readable and labeled", () => {
  const out = JSON.parse(log.toJson([{ ts: Date.UTC(2026, 9, 2), step: "file_saved" }], "4.1.0", Date.UTC(2026, 9, 3)));
  assert.equal(out.app, "Receipt Sender");
  assert.equal(out.version, "4.1.0");
  assert.equal(out.exportedAt, "2026-10-03T00:00:00.000Z");
  assert.equal(out.entries[0].time, "2026-10-02T00:00:00.000Z");
  assert.equal(out.entries[0].step, "file_saved");
});

test("steps are written in order, together, to local storage only", async () => {
  const { log: fresh, chrome, calls } = load();
  assert.equal(fresh.record("grab_started", { host: "amazon.com" }), true);
  assert.equal(fresh.record("file_saved", {}), true);
  assert.equal(fresh.record("not_a_step", {}), false);
  assert.equal(fresh.record("upload_confirmed", {}), true);
  await fresh.flush();
  const saved = chrome.storage.local.data.activityLog;
  assert.deepEqual(saved.map((e) => e.step), ["grab_started", "file_saved", "upload_confirmed"]);
  assert.equal(calls.filter((c) => c[0] === "storage.local.set").length, 1);
  assert.equal(calls.filter((c) => c[0].startsWith("storage.sync")).length, 0);
});

test("new steps are added to what is already stored, and capped", async () => {
  const old = [];
  for (let i = 0; i < 499; i++) old.push({ ts: i, step: "file_saved" });
  const { log: fresh, chrome } = load({ local: { activityLog: old } });
  fresh.record("grab_started", {});
  fresh.record("upload_confirmed", {});
  await fresh.flush();
  const saved = chrome.storage.local.data.activityLog;
  assert.equal(saved.length, 500);
  assert.equal(saved[0].ts, 1);
  assert.equal(saved[499].step, "upload_confirmed");
});

test("a storage failure never throws out of the log", async () => {
  const { log: fresh } = load({ failLocalKeys: ["activityLog"] });
  assert.equal(fresh.record("grab_started", {}), true);
  await assert.doesNotReject(fresh.flush());
  assert.equal((await fresh.read()).length, 0);
});

test("clearing empties the log and leaves a note that it was cleared", async () => {
  const { log: fresh, chrome } = load({ local: { activityLog: [{ ts: 1, step: "file_saved" }] } });
  fresh.record("grab_started", {});
  await fresh.clear();
  const saved = chrome.storage.local.data.activityLog;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].step, "log_cleared");
});

test("the log file has no network calls in it", () => {
  const src = read("activitylog.js");
  for (const banned of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "storage.sync"]) {
    assert.ok(!src.includes(banned), banned + " found in activitylog.js");
  }
});
