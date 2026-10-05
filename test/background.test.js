// Tests for the service worker (background.js), run in a sandbox with a fake
// chrome object. They cover the helpers, the settings, the upload queue, the
// Recent Grabs list, message handling, and the Activity Log hooks.
//
// What they can't cover: the real page capture and the real SparkReceipt and
// Expensify sites. Those are checked by hand against the live apps.

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { read, clone, loadBackground, callsTo } = require("./helpers");

const TAB = {
  id: 5,
  windowId: 1,
  url: "https://www.amazon.com/gp/css/order-details?orderID=114-22&token=SECRETTOKEN",
  title: "Private Order Title"
};
const SPARK_SENDER = { id: "testextensionid", url: "https://app.sparkreceipt.com/", tab: { id: 100 } };
const POPUP_SENDER = { id: "testextensionid", url: "chrome-extension://testextensionid/popup.html" };

function steps(bg) {
  return (bg.chrome.storage.local.data.activityLog || []).map((e) => e.step);
}

// ---------- helpers ----------

test("hostOf gives the site name, or 'page' when there is none", () => {
  const { sandbox } = loadBackground();
  assert.equal(sandbox.hostOf("https://www.amazon.com/orders?id=1"), "amazon.com");
  assert.equal(sandbox.hostOf("https://riders.uber.com/trips"), "riders.uber.com");
  assert.equal(sandbox.hostOf(undefined), "page");
  assert.equal(sandbox.hostOf("not a url"), "page");
});

test("extFromMime picks the right file ending", () => {
  const { sandbox } = loadBackground();
  assert.equal(sandbox.extFromMime("image/jpeg"), "jpg");
  assert.equal(sandbox.extFromMime("image/webp"), "webp");
  assert.equal(sandbox.extFromMime("image/gif"), "gif");
  assert.equal(sandbox.extFromMime("image/heic"), "heic");
  assert.equal(sandbox.extFromMime("image/png"), "png");
  assert.equal(sandbox.extFromMime("application/octet-stream"), "png");
});

test("file names are a unique id inside the Receipts folder", () => {
  const { sandbox } = loadBackground();
  const a = sandbox.buildFilename("jpg");
  const b = sandbox.buildFilename("png");
  assert.match(a, /^Receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/);
  assert.match(b, /\.png$/);
  assert.notEqual(a.slice(0, -4), b.slice(0, -4));
});

test("bufToBase64 handles small and large buffers", () => {
  const { sandbox } = loadBackground();
  const small = Uint8Array.from([72, 105]);
  assert.equal(sandbox.bufToBase64(small.buffer), "SGk=");
  const big = new Uint8Array(100000).map((_, i) => i % 251);
  assert.equal(sandbox.bufToBase64(big.buffer), Buffer.from(big).toString("base64"));
});

test("email drafts go to the right address for each service", () => {
  const { sandbox } = loadBackground();
  assert.equal(sandbox.emailFor({ service: "expensify", sparkEmail: "me@spark.example" }), "receipts@expensify.com");
  assert.equal(sandbox.emailFor({ service: "sparkreceipt", sparkEmail: "me@spark.example" }), "me@spark.example");
  assert.equal(sandbox.emailFor({ service: "sparkreceipt", sparkEmail: "" }), "");
  assert.equal(sandbox.getService({ service: "something-else" }).name, "SparkReceipt");
});

// ---------- settings ----------

test("settings fall back to safe defaults", async () => {
  const { sandbox } = loadBackground();
  assert.deepEqual(clone(await sandbox.loadSettings()), {
    service: "sparkreceipt",
    sparkType: "expense",
    sparkEmail: "",
    destination: "autodrop",
    format: "full",
    reveal: false,
    closeTab: false,
    deleteLocal: false,
    silent: false
  });
});

test("old setting names from earlier versions still work", async () => {
  let bg = loadBackground({ sync: { destination: "sparkweb", format: "pdf" } });
  let s = await bg.sandbox.loadSettings();
  assert.equal(s.destination, "serviceweb");
  assert.equal(s.format, "full");
  bg = loadBackground({ sync: { format: "png" } });
  s = await bg.sandbox.loadSettings();
  assert.equal(s.format, "visible");
});

test("the popup, settings page and service worker agree on the defaults", () => {
  const grab = (file) => {
    const src = read(file);
    const start = src.indexOf("const DEFAULTS = {");
    const end = src.indexOf("};", start) + 2;
    return vm.runInNewContext(src.slice(start, end) + " DEFAULTS;");
  };
  const worker = clone(grab("background.js"));
  assert.deepEqual(clone(grab("popup.js")), worker);
  assert.deepEqual(clone(grab("options.js")), worker);
});

// ---------- right-click menus ----------

test("the two right-click items follow the chosen service", async () => {
  const bg = loadBackground({ sync: { service: "expensify" } });
  bg.sandbox.refreshMenus();
  await bg.settle();
  const made = callsTo(bg.calls, "contextMenus.create").map((c) => c[1]);
  assert.deepEqual(made, [
    { id: "send-to-service", title: "Send Page to Expensify", contexts: ["page"] },
    { id: "send-image-to-service", title: "Send This Image to Expensify", contexts: ["image"] }
  ]);
});

// ---------- upload queue ----------

test("the queue is first in, first out", async () => {
  const { sandbox } = loadBackground();
  await sandbox.enqueue({ id: "a", createdAt: Date.now() });
  await sandbox.enqueue({ id: "b", createdAt: Date.now() });
  assert.equal((await sandbox.getQueueHead()).id, "a");
  await sandbox.consumeHead();
  assert.equal((await sandbox.getQueueHead()).id, "b");
});

test("receipts older than ten minutes drop out of the queue", async () => {
  const stale = Date.now() - 11 * 60 * 1000;
  const bg = loadBackground({
    local: { queue: [{ id: "old", createdAt: stale }, { id: "new", createdAt: Date.now() }] }
  });
  const queue = await bg.sandbox.getQueue();
  assert.deepEqual(queue.map((q) => q.id), ["new"]);
  assert.deepEqual(bg.chrome.storage.local.data.queue.map((q) => q.id), ["new"]);
});

test("taking the head of the queue marks it as in flight, without the image", async () => {
  const bg = loadBackground({ local: { queue: [{ id: "a", service: "sparkreceipt", b64: "/9j/AAAA", downloadId: 3, createdAt: Date.now() }] } });
  await bg.sandbox.consumeHead();
  const inFlight = clone(bg.chrome.storage.local.data.inFlight);
  assert.equal(inFlight.length, 1);
  assert.equal(inFlight[0].id, "a");
  assert.equal(inFlight[0].service, "sparkreceipt");
  assert.equal(inFlight[0].downloadId, 3);
  assert.equal(typeof inFlight[0].startedAt, "number");
  assert.equal(inFlight[0].b64, undefined);
  assert.equal(bg.chrome.storage.local.data.queue.length, 0);
  assert.equal(await bg.sandbox.getQueueHead(), null);
});

test("each service page gets the oldest receipt for its own service", async () => {
  const now = Date.now();
  const bg = loadBackground({
    local: {
      queue: [
        { id: "e1", service: "expensify", createdAt: now },
        { id: "s1", service: "sparkreceipt", createdAt: now },
        { id: "e2", service: "expensify", createdAt: now },
        { id: "s2", service: "sparkreceipt", createdAt: now }
      ]
    }
  });
  const EXP_SENDER = { id: "testextensionid", url: "https://new.expensify.com/", tab: { id: 101 } };
  assert.equal((await bg.send({ type: "getPendingReceipt", service: "sparkreceipt" }, SPARK_SENDER)).reply.id, "s1");
  assert.equal((await bg.send({ type: "getPendingReceipt", service: "expensify" }, EXP_SENDER)).reply.id, "e1");
  // The page that sent the message decides, not what the message claims
  assert.equal((await bg.send({ type: "getPendingReceipt", service: "expensify" }, SPARK_SENDER)).reply.id, "s1");
  // Anything else gets nothing
  assert.equal((await bg.send({ type: "getPendingReceipt" }, { url: "https://evil.example.com/" })).reply, null);

  await bg.send({ type: "receiptConsumed", id: "s1" }, SPARK_SENDER);
  assert.deepEqual(bg.chrome.storage.local.data.queue.map((q) => q.id), ["e1", "e2", "s2"]);
  assert.equal((await bg.send({ type: "getPendingReceipt", service: "sparkreceipt" }, SPARK_SENDER)).reply.id, "s2");
  await bg.send({ type: "receiptConsumed", id: "e1" }, EXP_SENDER);
  assert.deepEqual(bg.chrome.storage.local.data.queue.map((q) => q.id), ["e2", "s2"]);
  assert.deepEqual(bg.chrome.storage.local.data.inFlight.map((q) => q.id), ["s1", "e1"]);

  // Each page's result goes to its own receipt
  await bg.send({ type: "dropFinished", success: true, id: "e1" }, EXP_SENDER);
  assert.deepEqual(bg.chrome.storage.local.data.inFlight.map((q) => q.id), ["s1"]);
  await bg.send({ type: "dropFinished", success: true }, SPARK_SENDER);
  assert.equal(bg.chrome.storage.local.data.inFlight, undefined);
});

test("a receipt for the other service doesn't hold up this one, and is opened next", async () => {
  const bg = loadBackground();
  await bg.sandbox.enqueue({ id: "e1", service: "expensify", createdAt: Date.now() });
  await bg.sandbox.historyAdd({ id: "e1", status: "working" });
  await bg.sandbox.run(TAB); // SparkReceipt is the chosen service
  await bg.settle();
  const head = (await bg.send({ type: "getPendingReceipt", service: "sparkreceipt" }, SPARK_SENDER)).reply;
  assert.equal(head.service, "sparkreceipt");
  await bg.send({ type: "receiptConsumed", id: head.id }, SPARK_SENDER);
  await bg.send({ type: "dropFinished", success: true, id: head.id }, SPARK_SENDER);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "ok");
  assert.equal(bg.chrome.storage.local.data.history[1].status, "working");
  assert.deepEqual(bg.chrome.storage.local.data.queue.map((q) => q.id), ["e1"]);
  const opened = callsTo(bg.calls, "tabs.create").map((c) => c[1].url);
  assert.deepEqual(opened, ["https://app.sparkreceipt.com/", "https://new.expensify.com/"]);
});

test("a captured image is queued without its folder or data URL wrapper", async () => {
  const bg = loadBackground();
  await bg.sandbox.enqueueCapture(
    { url: "data:image/jpeg;base64,/9j/AAAA", ext: "jpg" },
    "Receipts/abc.jpg",
    { service: "expensify", sparkType: "income", closeTab: 1, deleteLocal: 0 },
    7,
    "grab-1"
  );
  const item = bg.chrome.storage.local.data.queue[0];
  assert.equal(item.id, "grab-1");
  assert.equal(item.service, "expensify");
  assert.equal(item.sparkType, "income");
  assert.equal(item.b64, "/9j/AAAA");
  assert.equal(item.mime, "image/jpeg");
  assert.equal(item.filename, "abc.jpg");
  assert.equal(item.downloadId, 7);
  assert.equal(item.closeTab, true);
  assert.equal(item.deleteLocal, false);
  assert.equal(typeof item.createdAt, "number");
});

// ---------- receipts that never finish ----------

function missedSteps(bg) {
  return (bg.chrome.storage.local.data.activityLog || [])
    .filter((e) => e.step === "upload_missed")
    .map((e) => [e.grabId, e.service, e.detail]);
}

function badges(bg) {
  return callsTo(bg.calls, "action.setBadgeText").map((c) => c[1].text);
}

test("on start, receipts that waited too long are cleared and marked as missed", async () => {
  const now = Date.now();
  const bg = loadBackground({
    local: {
      queue: [
        { id: "aa01", service: "expensify", b64: "AAAA", createdAt: now - 11 * 60 * 1000 },
        { id: "bb02", service: "sparkreceipt", b64: "AAAA", createdAt: now }
      ],
      inFlight: { id: "cc03", service: "sparkreceipt", downloadId: 4 },
      history: [
        { id: "bb02", ts: now, status: "working" },
        { id: "aa01", ts: now - 11 * 60 * 1000, status: "working" },
        { id: "cc03", ts: now - 60 * 60 * 1000, status: "working" },
        { id: "dd04", ts: now - 60 * 60 * 1000, status: "working" },
        { id: "ee05", ts: now - 60 * 60 * 1000, status: "ok" }
      ]
    }
  });
  await bg.settle();
  const data = bg.chrome.storage.local.data;
  assert.deepEqual(data.queue.map((q) => q.id), ["bb02"]);
  assert.equal(data.inFlight, undefined);
  assert.deepEqual(data.history.map((h) => h.status), ["working", "fail", "fail", "fail", "ok"]);
  assert.deepEqual(missedSteps(bg).sort(), [
    ["aa01", "expensify", "No word back from Expensify"],
    ["cc03", "sparkreceipt", "No word back from SparkReceipt"]
  ]);
  assert.ok(badges(bg).includes("!"));
  // Something is still waiting, so it keeps watching
  assert.equal(bg.intervals.filter((i) => i.live).length, 1);
});

test("on start with nothing waiting, nothing changes", async () => {
  const bg = loadBackground({ local: { history: [{ id: "a", ts: Date.now(), status: "working" }] } });
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "working");
  assert.equal(callsTo(bg.calls, "action.setBadgeText").length, 0);
  assert.equal(bg.intervals.length, 0);
  assert.equal(bg.chrome.storage.local.data.activityLog, undefined);
});

test("a receipt stuck in flight is cleared when the next grab starts", async () => {
  const bg = loadBackground({ sync: { destination: "none" }, local: { inFlight: [{ id: "ff01", service: "expensify", startedAt: Date.now() }] } });
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.inFlight.length, 1);
  bg.chrome.storage.local.data.inFlight[0].startedAt = Date.now() - 4 * 60 * 1000;
  await bg.sandbox.run(TAB);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.inFlight, undefined);
  assert.deepEqual(missedSteps(bg), [["ff01", "expensify", "No word back from Expensify"]]);
});

test("if the service page never reports back, the grab is marked missed and the badge shows !", async () => {
  const bg = loadBackground();
  await bg.sandbox.run(TAB);
  await bg.settle();
  assert.equal(badges(bg).pop(), "...");
  assert.equal(bg.intervals.filter((i) => i.live).length, 1);
  const id = bg.chrome.storage.local.data.history[0].id;

  // Four minutes in: still waiting
  const start = Date.now();
  bg.evalIn("Date.now = () => " + (start + 4 * 60 * 1000));
  bg.fireIntervals();
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "working");
  assert.equal(bg.chrome.storage.local.data.queue.length, 1);

  // Six minutes with no word from the page: a miss
  bg.evalIn("Date.now = () => " + (start + 6 * 60 * 1000));
  bg.fireIntervals();
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "fail");
  assert.equal(bg.chrome.storage.local.data.queue.length, 0);
  assert.equal(badges(bg).pop(), "", "the ! is flashed, then cleared");
  assert.ok(badges(bg).includes("!"));
  assert.deepEqual(missedSteps(bg), [[id, "sparkreceipt", "No word back from SparkReceipt"]]);
  assert.equal(callsTo(bg.calls, "downloads.removeFile").length, 0, "the backup file is kept");

  // Nothing left to watch
  bg.fireIntervals();
  await bg.settle();
  assert.equal(bg.intervals.filter((i) => i.live).length, 0);
});

test("a page that is still talking isn't timed out", async () => {
  const bg = loadBackground();
  await bg.sandbox.run(TAB);
  await bg.settle();
  const start = Date.now();
  bg.evalIn("Date.now = () => " + (start + 4 * 60 * 1000));
  await bg.send({ type: "logStep", step: "sign_in_needed" }, SPARK_SENDER);
  bg.evalIn("Date.now = () => " + (start + 8 * 60 * 1000));
  bg.fireIntervals();
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "working");
  assert.equal(bg.chrome.storage.local.data.queue.length, 1);
  assert.deepEqual(missedSteps(bg), []);
});

test("the privacy policy's limit on waiting receipts matches the code", () => {
  const { evalIn } = loadBackground();
  const minutes = evalIn("QUEUE_MAX_AGE_MS") / 60000;
  assert.equal(minutes, 10);
  for (const doc of ["PRIVACY.md", "privacy.html"]) {
    assert.match(read(doc), new RegExp("still waiting after " + minutes + " minutes is cleared"), doc);
  }
});

// ---------- Recent Grabs ----------

test("Recent Grabs keeps the newest ten, newest first", async () => {
  const bg = loadBackground();
  for (let i = 1; i <= 13; i++) {
    await bg.sandbox.historyAdd({ id: "g" + i, status: "working" });
  }
  const list = bg.chrome.storage.local.data.history;
  assert.equal(list.length, 10);
  assert.equal(list[0].id, "g13");
  assert.equal(list[9].id, "g4");
  await bg.sandbox.historyUpdate("g13", "ok");
  await bg.sandbox.historyUpdate("missing", "ok");
  assert.equal(bg.chrome.storage.local.data.history[0].status, "ok");
});

// ---------- manual handoffs ----------

test("Gmail and mail app drafts are addressed and encoded correctly", async () => {
  const bg = loadBackground();
  const tab = { title: "Order #1 & more", url: "https://shop.example.com/o?id=1" };
  await bg.sandbox.openDestination(tab, { service: "expensify", destination: "gmail" });
  const gmail = callsTo(bg.calls, "tabs.create")[0][1].url;
  assert.ok(gmail.startsWith("https://mail.google.com/mail/?view=cm&fs=1&to=receipts%40expensify.com&su=Receipt%3A%20Order%20%231%20%26%20more&body="));
  await bg.sandbox.openDestination(tab, { service: "sparkreceipt", sparkEmail: "me@spark.example", destination: "mailto" });
  const mail = callsTo(bg.calls, "tabs.create")[1][1];
  assert.ok(mail.url.startsWith("mailto:me%40spark.example?subject=Receipt%3A%20Order"));
  assert.equal(mail.active, false);
  await bg.sandbox.openDestination(tab, { service: "expensify", destination: "serviceweb" });
  assert.equal(callsTo(bg.calls, "tabs.create")[2][1].url, "https://new.expensify.com/");
  await bg.sandbox.openDestination(tab, { service: "expensify", destination: "none" });
  assert.equal(callsTo(bg.calls, "tabs.create").length, 3);
});

test("the service tab is reused when one is open, and silent mode stays in the background", async () => {
  let bg = loadBackground({ tabs: () => [{ id: 9, windowId: 3 }] });
  await bg.sandbox.openServiceTab({ service: "sparkreceipt", silent: false });
  assert.deepEqual(callsTo(bg.calls, "tabs.update")[0].slice(1), [9, { url: "https://app.sparkreceipt.com/", active: true }]);
  assert.equal(callsTo(bg.calls, "windows.update").length, 1);
  assert.equal(callsTo(bg.calls, "tabs.create").length, 0);

  bg = loadBackground({ tabs: () => [{ id: 9, windowId: 3 }] });
  await bg.sandbox.openServiceTab({ service: "sparkreceipt", silent: true });
  assert.deepEqual(callsTo(bg.calls, "tabs.update")[0].slice(1), [9, { url: "https://app.sparkreceipt.com/" }]);
  assert.equal(callsTo(bg.calls, "windows.update").length, 0);

  bg = loadBackground();
  await bg.sandbox.openServiceTab({ service: "expensify", silent: true });
  assert.deepEqual(callsTo(bg.calls, "tabs.create")[0][1], { url: "https://new.expensify.com/", active: false });
});

// ---------- a whole grab ----------

test("save-only grab: file saved, list updated, nothing opened", async () => {
  const bg = loadBackground({ sync: { destination: "none" } });
  await bg.sandbox.run(TAB);
  await bg.settle();
  const dl = callsTo(bg.calls, "downloads.download")[0][1];
  assert.match(dl.filename, /^Receipts\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(dl.saveAs, false);
  assert.equal(dl.conflictAction, "uniquify");
  const row = bg.chrome.storage.local.data.history[0];
  assert.equal(row.host, "amazon.com");
  assert.equal(row.service, "sparkreceipt");
  assert.equal(row.status, "saved");
  assert.equal(callsTo(bg.calls, "tabs.create").length, 0);
  assert.equal(bg.chrome.storage.local.data.queue, undefined);
  assert.deepEqual(steps(bg), ["grab_started", "file_saved", "saved_only"]);
});

test("automatic grab: receipt is queued and the service is opened", async () => {
  const bg = loadBackground({ sync: { service: "expensify", silent: true } });
  await bg.sandbox.run(TAB);
  await bg.settle();
  const item = bg.chrome.storage.local.data.queue[0];
  assert.equal(item.service, "expensify");
  assert.equal(item.b64, "/9j/AAAA");
  assert.equal(item.mime, "image/jpeg");
  assert.match(item.filename, /^[0-9a-f-]{36}\.jpg$/);
  assert.equal(item.id, bg.chrome.storage.local.data.history[0].id);
  assert.deepEqual(callsTo(bg.calls, "tabs.create")[0][1], { url: "https://new.expensify.com/", active: false });
  assert.equal(bg.chrome.storage.local.data.history[0].status, "working");
  assert.deepEqual(steps(bg), ["grab_started", "file_saved", "receipt_queued", "service_opened"]);
});

test("a failed grab is marked, badged and logged with the reason", async () => {
  const bg = loadBackground({ captureFails: 'Cannot access contents of url "https://www.amazon.com/gp/css/order-details?token=SECRETTOKEN"' });
  await bg.sandbox.run(TAB);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "fail");
  assert.ok(callsTo(bg.calls, "action.setBadgeText").some((c) => c[1].text === "!"));
  const log = bg.chrome.storage.local.data.activityLog;
  assert.deepEqual(log.map((e) => e.step), ["grab_started", "grab_failed"]);
  assert.equal(log[1].detail, 'Cannot access contents of url "amazon.com"');
});

test("an interrupted download fails the grab", async () => {
  const bg = loadBackground({ downloadFails: true });
  await bg.sandbox.run(TAB);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "fail");
  assert.equal(bg.chrome.storage.local.data.queue, undefined);
});

test("a download that finishes before anyone is listening is still noticed", async () => {
  // Failed before the listener was in place: the grab must fail, not carry on
  let bg = loadBackground({ downloadEarly: true, downloadFails: true });
  await bg.sandbox.run(TAB);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "fail");
  assert.equal(bg.chrome.storage.local.data.queue, undefined);
  assert.deepEqual(steps(bg), ["grab_started", "grab_failed"]);
  assert.equal(bg.chrome.downloads.onChanged.listeners.length, 0);

  // Finished before the listener was in place: no waiting, carry on
  bg = loadBackground({ downloadEarly: true });
  await bg.sandbox.run(TAB);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.queue.length, 1);
  assert.equal(bg.chrome.downloads.onChanged.listeners.length, 0);
});

test("nothing private reaches extension storage besides the queued image", async () => {
  const bg = loadBackground({ sync: { destination: "none" } });
  await bg.sandbox.run(TAB);
  await bg.settle();
  const stored = JSON.stringify(bg.chrome.storage.local.data);
  assert.ok(!stored.includes("SECRETTOKEN"));
  assert.ok(!stored.includes("order-details"));
  assert.ok(!stored.includes("Private Order Title"));
  for (const entry of bg.chrome.storage.local.data.activityLog) {
    assert.deepEqual(
      Object.keys(entry).filter((k) => !["ts", "step", "grabId", "host", "service", "detail"].includes(k)),
      []
    );
  }
});

// ---------- full-page capture ----------

// A stand-in page that can be scrolled and captured, `height` pixels tall in
// a 700 pixel window. Notes the arguments of every script run in it.
function fakePage(bg, opts) {
  const o = opts || {};
  const scripts = [];
  let shots = 0;
  bg.chrome.scripting.executeScript = async (details) => {
    scripts.push(details.args ? details.args.slice() : "metrics");
    if (!details.args) {
      return [{ result: { scrollHeight: o.height, viewport: 700, width: 1000, dpr: 1, originalY: 120 } }];
    }
    return [{ result: null }];
  };
  bg.chrome.tabs.captureVisibleTab = async () => {
    shots++;
    if (shots === o.failOnShot) throw new Error("Too many captures");
    return "data:image/png;base64,iVBORw0KGgo=";
  };
  bg.sandbox.fetch = async () => ({ blob: async () => ({}) });
  bg.sandbox.createImageBitmap = async () => ({ width: 1000, height: 700 });
  bg.sandbox.OffscreenCanvas = class {
    constructor(w, h) {
      this.size = [w, h];
    }
    getContext() {
      return { drawImage() {} };
    }
    async convertToBlob() {
      return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    }
  };
  return { scripts, shots: () => shots };
}

test("a full-page capture puts the page back the way it was", async () => {
  const bg = loadBackground();
  const page = fakePage(bg, { height: 2000 });
  const capture = await bg.sandbox.captureFullPage(TAB);
  assert.equal(capture.ext, "jpg");
  assert.equal(page.shots(), 3);
  assert.deepEqual(clone(page.scripts), ["metrics", [0, false], [700, true], [1300, true], [120]]);
});

test("a full-page capture that fails partway still puts the page back", async () => {
  const bg = loadBackground();
  const page = fakePage(bg, { height: 3000, failOnShot: 2 });
  await assert.rejects(bg.sandbox.captureFullPage(TAB), /Too many captures/);
  assert.deepEqual(clone(page.scripts), ["metrics", [0, false], [700, true], [120]]);
});

// ---------- finishing an upload ----------

async function finishedGrab(sync, success, opts) {
  const bg = loadBackground({ sync, ...(opts || {}) });
  await bg.sandbox.run(TAB);
  await bg.settle();
  const head = (await bg.send({ type: "getPendingReceipt" }, SPARK_SENDER)).reply;
  await bg.send({ type: "receiptConsumed" }, SPARK_SENDER);
  await bg.send({ type: "dropFinished", success }, SPARK_SENDER);
  await bg.settle();
  return { bg, head };
}

test("a confirmed upload marks the grab OK and clears the in-flight copy", async () => {
  const { bg, head } = await finishedGrab({}, true);
  assert.equal(head.b64, "/9j/AAAA");
  assert.equal(bg.chrome.storage.local.data.history[0].status, "ok");
  assert.equal(bg.chrome.storage.local.data.inFlight, undefined);
  assert.equal(bg.chrome.storage.local.data.queue.length, 0);
  assert.equal(callsTo(bg.calls, "downloads.removeFile").length, 0);
  assert.equal(callsTo(bg.calls, "tabs.remove").length, 0);
  assert.ok(callsTo(bg.calls, "action.setBadgeText").some((c) => c[1].text === "OK"));
  assert.deepEqual(steps(bg), ["grab_started", "file_saved", "receipt_queued", "service_opened", "upload_confirmed"]);
});

test("a finished message right behind the consumed message still records the upload", async () => {
  // The service page sends both back to back. They must not cross.
  for (const success of [true, false]) {
    const bg = loadBackground({ slowStorage: true });
    await bg.sandbox.run(TAB);
    await bg.settle();
    await Promise.all([
      bg.send({ type: "receiptConsumed" }, SPARK_SENDER),
      bg.send({ type: "dropFinished", success }, SPARK_SENDER)
    ]);
    await bg.settle();
    assert.equal(bg.chrome.storage.local.data.history[0].status, success ? "ok" : "fail");
    assert.equal(bg.chrome.storage.local.data.inFlight, undefined);
    assert.equal(bg.chrome.storage.local.data.queue.length, 0);
    assert.equal(steps(bg).pop(), success ? "upload_confirmed" : "upload_missed");
    const missed = bg.chrome.storage.local.data.activityLog.filter((e) => /^upload_/.test(e.step));
    assert.equal(missed[0].grabId, bg.chrome.storage.local.data.history[0].id);
  }
});

test("cleanup extras run only after a confirmed upload", async () => {
  const on = await finishedGrab({ closeTab: true, deleteLocal: true }, true);
  assert.deepEqual(callsTo(on.bg.calls, "downloads.removeFile")[0].slice(1), [1]);
  assert.deepEqual(callsTo(on.bg.calls, "downloads.erase")[0].slice(1), [{ id: 1 }]);
  assert.deepEqual(callsTo(on.bg.calls, "tabs.remove")[0].slice(1), [100]);
  assert.deepEqual(steps(on.bg).slice(-3), ["upload_confirmed", "backup_deleted", "tab_closed"]);

  const missed = await finishedGrab({ closeTab: true, deleteLocal: true }, false);
  assert.equal(missed.bg.chrome.storage.local.data.history[0].status, "fail");
  assert.equal(callsTo(missed.bg.calls, "downloads.removeFile").length, 0);
  assert.equal(callsTo(missed.bg.calls, "tabs.remove").length, 0);
  assert.ok(callsTo(missed.bg.calls, "action.setBadgeText").some((c) => c[1].text === "!"));
  assert.equal(steps(missed.bg).pop(), "upload_missed");
});

test("with more receipts waiting, the service opens again and the tab stays", async () => {
  const bg = loadBackground({ sync: { closeTab: true } });
  await bg.sandbox.run(TAB);
  await bg.sandbox.run({ ...TAB, id: 6, url: "https://www.homedepot.com/order/2" });
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.queue.length, 2);
  const opensBefore = callsTo(bg.calls, "tabs.create").length;
  await bg.send({ type: "receiptConsumed" }, SPARK_SENDER);
  await bg.send({ type: "dropFinished", success: true }, SPARK_SENDER);
  await bg.settle();
  assert.equal(callsTo(bg.calls, "tabs.create").length, opensBefore + 1);
  assert.equal(callsTo(bg.calls, "tabs.remove").length, 0);
  assert.equal(bg.chrome.storage.local.data.queue.length, 1);
});

// ---------- messages ----------

test("the popup can start a grab, a web page script cannot", async () => {
  let bg = loadBackground();
  let res = await bg.send({ type: "send", tabId: 5 }, POPUP_SENDER);
  assert.deepEqual(clone(res.reply), { ok: true });
  assert.equal(callsTo(bg.calls, "tabs.get").length, 1);

  bg = loadBackground();
  res = await bg.send({ type: "send", tabId: 5 }, SPARK_SENDER);
  assert.equal(res.replied, false);
  assert.equal(callsTo(bg.calls, "tabs.get").length, 0);

  bg = loadBackground();
  res = await bg.send({ type: "sendAllTabs", windowId: 1 }, SPARK_SENDER);
  assert.equal(res.replied, false);
  assert.equal(callsTo(bg.calls, "tabs.query").length, 0);
});

test("unknown and empty messages are ignored", async () => {
  const bg = loadBackground();
  assert.equal((await bg.send(null, POPUP_SENDER)).keptOpen, false);
  assert.equal((await bg.send({ type: "nope" }, POPUP_SENDER)).keptOpen, false);
  assert.equal((await bg.send({ type: "send" }, POPUP_SENDER)).replied, false);
});

test("service pages can add known steps to the log, nothing else can", async () => {
  const bg = loadBackground();
  await bg.send({ type: "logStep", step: "file_attached", grabId: "abc-1" }, SPARK_SENDER);
  await bg.send({ type: "logStep", step: "service_note", grabId: "abc-1", note: "Receipt dropped in. See https://app.sparkreceipt.com/doc/991?k=1" }, SPARK_SENDER);
  await bg.send({ type: "logStep", step: "upload_confirmed" }, SPARK_SENDER);
  await bg.send({ type: "logStep", step: "log_cleared" }, SPARK_SENDER);
  await bg.send({ type: "logStep", step: "file_attached" }, { url: "https://evil.example.com/" });
  await bg.send({ type: "logStep", step: "file_attached" }, { url: "https://app.sparkreceipt.com.evil.example/" });
  await bg.send({ type: "logStep", step: "file_attached" }, {});
  await bg.settle();
  const log = clone(bg.chrome.storage.local.data.activityLog);
  assert.deepEqual(log.map((e) => [e.step, e.service, e.grabId]), [
    ["file_attached", "sparkreceipt", "abc-1"],
    ["service_note", "sparkreceipt", "abc-1"]
  ]);
  assert.equal(log[1].detail, "Receipt dropped in. See app.sparkreceipt.com");
});

test("only the extension's own pages can clear the log", async () => {
  const bg = loadBackground({ local: { activityLog: [{ ts: 1, step: "file_saved" }] } });
  let res = await bg.send({ type: "clearActivityLog" }, SPARK_SENDER);
  assert.deepEqual(clone(res.reply), { ok: false });
  assert.equal(bg.chrome.storage.local.data.activityLog[0].step, "file_saved");
  res = await bg.send({ type: "clearActivityLog" }, { id: "testextensionid", url: "chrome-extension://testextensionid/options.html" });
  assert.deepEqual(clone(res.reply), { ok: true });
  assert.deepEqual(bg.chrome.storage.local.data.activityLog.map((e) => e.step), ["log_cleared"]);
});

test("setting changes are logged by name, never by value", async () => {
  const bg = loadBackground();
  await bg.chrome.storage.sync.set({ service: "expensify", sparkEmail: "private@spark.example" });
  await bg.settle();
  const log = bg.chrome.storage.local.data.activityLog;
  assert.equal(log.length, 1);
  assert.equal(log[0].step, "settings_changed");
  assert.equal(log[0].detail, "forwarding email, service");
  assert.ok(!JSON.stringify(log).includes("private@"));
  assert.equal(callsTo(bg.calls, "contextMenus.create").length, 2);
});

// ---------- the log can never break a grab ----------

test("grabs work the same when the Activity Log fails to load", async () => {
  const bg = loadBackground({ importFails: true });
  assert.equal(bg.sandbox.ActivityLog, undefined);
  await bg.sandbox.run(TAB);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.queue.length, 1);
  await bg.send({ type: "receiptConsumed" }, SPARK_SENDER);
  await bg.send({ type: "dropFinished", success: true }, SPARK_SENDER);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "ok");
  assert.equal(bg.chrome.storage.local.data.activityLog, undefined);
  const res = await bg.send({ type: "clearActivityLog" }, POPUP_SENDER);
  assert.deepEqual(clone(res.reply), { ok: false });
});

test("grabs work the same when the log can't be written", async () => {
  const bg = loadBackground({ failLocalKeys: ["activityLog"] });
  await bg.sandbox.run(TAB);
  await bg.settle();
  await bg.send({ type: "receiptConsumed" }, SPARK_SENDER);
  await bg.send({ type: "dropFinished", success: true }, SPARK_SENDER);
  await bg.settle();
  assert.equal(bg.chrome.storage.local.data.history[0].status, "ok");
  assert.equal(bg.chrome.storage.local.data.inFlight, undefined);
});

test("log wording helpers never throw", () => {
  const { sandbox } = loadBackground();
  assert.equal(sandbox.reasonOf(new Error("boom")), "boom");
  assert.equal(sandbox.reasonOf("plain text"), "plain text");
  assert.equal(sandbox.reasonOf(undefined), "undefined");
  assert.equal(sandbox.tabCount(1), "1 tab");
  assert.equal(sandbox.tabCount(4), "4 tabs");
  assert.equal(sandbox.handoffText("gmail"), "Gmail draft");
  assert.equal(sandbox.handoffText("???"), "");
  assert.equal(sandbox.settingNames(null), "");
  assert.equal(sandbox.settingNames({ silent: {}, unknownKey: {} }), "silent mode");
});
