// Tests for the two service page scripts (sparkdrop.js and expensifydrop.js).
//
// Each script is run in a sandbox against a tiny stand-in page that answers
// the exact selectors the script uses, with a clock the test controls. That
// checks the order of clicks, the file handoff, and the messages sent back to
// the extension. It does not prove the real sites still look like this: the
// selectors were verified by hand against the live apps (August 2026), and
// the "tripwire" test at the bottom fails if anyone changes them, as a
// reminder to verify by hand again.

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { read, clone } = require("./helpers");

const PAYLOAD = {
  id: "3f6c1c1e-8a54-4d0b-9a57-0f6f4a1b2c01",
  service: "sparkreceipt",
  sparkType: "expense",
  b64: Buffer.from("fake image bytes").toString("base64"),
  mime: "image/jpeg",
  filename: "3f6c1c1e.jpg",
  closeTab: false,
  deleteLocal: false
};

function el(text, extra) {
  const node = {
    textContent: text || "",
    childElementCount: 0,
    parentElement: null,
    clicks: 0,
    events: [],
    attrs: {},
    getAttribute(name) {
      return this.attrs[name] || null;
    },
    click() {
      this.clicks++;
      if (this.onclick) this.onclick();
    },
    dispatchEvent(ev) {
      this.events.push(ev.type);
      if (this.onevent) this.onevent(ev);
      return true;
    }
  };
  return Object.assign(node, extra || {});
}

// Run a content script against a stand-in page. `page` maps a selector to the
// list of elements it should find right now; tests change it as "the app"
// reacts to clicks.
async function start(file, payload, page, pathname, opts) {
  const o = opts || {};
  const clock = { t: 1000000 };
  const messages = [];
  const intervals = [];
  const byId = {};
  class FakeDate extends Date {
    static now() {
      return clock.t;
    }
  }
  class FakeDataTransfer {
    constructor() {
      this.files = [];
      this.items = { add: (f) => this.files.push(f) };
    }
  }
  class FakeEvent {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init || {});
    }
  }
  const made = () => {
    const node = el("");
    node.style = {};
    node.children = [];
    node.setAttribute = (k, v) => (node.attrs[k] = v);
    node.addEventListener = () => {};
    node.appendChild = (child) => node.children.push(child);
    node.remove = () => {};
    return node;
  };
  const sandbox = {
    chrome: {
      runtime: {
        sendMessage(msg) {
          messages.push(clone(msg));
          if (o.reply) {
            const custom = o.reply(msg);
            if (custom) return custom;
          }
          return Promise.resolve(msg.type === "getPendingReceipt" ? clone(payload) : { ok: true });
        }
      }
    },
    document: {
      querySelector: (sel) => (page[sel] || [])[0] || null,
      querySelectorAll: (sel) => page[sel] || [],
      getElementById: (id) => byId[id] || null,
      createElement: made,
      documentElement: {
        appendChild(node) {
          byId[node.id] = node;
          node.children.forEach((c) => (byId[c.id] = c));
        }
      },
      images: []
    },
    location: { pathname: pathname || "/" },
    Date: FakeDate,
    DataTransfer: FakeDataTransfer,
    Event: FakeEvent,
    DragEvent: FakeEvent,
    File,
    Uint8Array,
    atob,
    setInterval(fn, ms) {
      intervals.push({ fn, ms, live: true });
      return intervals.length;
    },
    clearInterval(id) {
      if (intervals[id - 1]) intervals[id - 1].live = false;
    },
    setTimeout() {
      return 0;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox, { filename: file });
  await new Promise((r) => setImmediate(r));
  return {
    messages,
    intervals,
    location: sandbox.location,
    banner: () => (byId["spark-sender-banner-text"] || {}).textContent,
    // Move the clock, run every live timer once, then let any replies from
    // the extension land.
    async tick(ms) {
      clock.t += ms === undefined ? 400 : ms;
      intervals.filter((i) => i.live).forEach((i) => i.fn());
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    },
    // Messages that drive the upload, without the Activity Log notes.
    flow: () => messages.filter((m) => m.type !== "logStep").map((m) => (m.type === "dropFinished" ? "dropFinished:" + m.success : m.type)),
    notes: () => messages.filter((m) => m.type === "logStep")
  };
}

// ---------- SparkReceipt ----------

function sparkPage(opts) {
  const o = opts || {};
  const page = {};
  const add = el("Add documents");
  const input = el("", { files: null });
  const confirm = el("Confirm");
  const types = ["Expense or receipt", "Income or invoice", "Bank or credit card statement", "Other document"].map((t) => el(t));
  page["button.sidebar-add-document-cta"] = [add];
  page["button"] = [add];
  add.onclick = () => {
    page["button.add-document-type-option"] = types;
  };
  types.forEach((t) => {
    t.onclick = () => {
      page[".add-document-modal-body"] = [el("")];
      page['.file-dropzone input[type="file"]'] = [input];
      page["button"] = o.noConfirm ? [add] : [add, confirm];
    };
  });
  return { page, add, input, confirm, types };
}

test("SparkReceipt: Add documents, pick the type, attach, Confirm", async () => {
  const app = sparkPage();
  const run = await start("sparkdrop.js", PAYLOAD, app.page);
  assert.equal(run.intervals[0].ms, 400);
  assert.equal(run.banner(), "Dropping your receipt into SparkReceipt...");

  await run.tick();
  assert.equal(app.add.clicks, 1);
  await run.tick();
  assert.deepEqual(app.types.map((t) => t.clicks), [1, 0, 0, 0]);
  await run.tick();
  assert.equal(app.input.files.length, 1);
  assert.equal(app.input.files[0].name, "3f6c1c1e.jpg");
  assert.equal(app.input.files[0].type, "image/jpeg");
  assert.equal(app.input.files[0].size, 16);
  assert.deepEqual(app.input.events, ["input", "change"]);

  await run.tick(); // too soon after attaching: wait
  assert.equal(app.confirm.clicks, 0);
  await run.tick(600);
  assert.equal(app.confirm.clicks, 1);
  assert.equal(run.intervals[0].live, false);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:true"]);
  assert.equal(run.banner(), "Receipt dropped in. SparkReceipt is scanning it now.");

  await run.tick(5000);
  assert.equal(app.add.clicks, 1);
  assert.equal(app.confirm.clicks, 1);
});

test("SparkReceipt: the chosen document type is the one clicked", async () => {
  for (const [sparkType, index] of [["income", 1], ["statement", 2], ["other", 3], ["made-up", 0]]) {
    const app = sparkPage();
    const run = await start("sparkdrop.js", { ...PAYLOAD, sparkType }, app.page);
    await run.tick();
    await run.tick();
    assert.equal(app.types[index].clicks, 1, sparkType);
  }
});

test("SparkReceipt: cleanup waits for the upload window to close", async () => {
  const app = sparkPage();
  const run = await start("sparkdrop.js", { ...PAYLOAD, closeTab: true }, app.page);
  await run.tick();
  await run.tick();
  await run.tick();
  await run.tick(1000);
  assert.equal(app.confirm.clicks, 1);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed"]);
  assert.equal(run.intervals[1].ms, 500);

  await run.tick(10000); // window still open: keep waiting
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed"]);
  delete app.page[".add-document-modal-body"];
  await run.tick(500);
  await run.tick(5000); // closed, but not for 6 seconds yet
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed"]);
  await run.tick(1500);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:true"]);
  assert.equal(run.banner(), "Upload done. Closing this tab...");
});

test("SparkReceipt: waits at the sign-in screen, then gives up politely", async () => {
  const page = { 'input[type="password"]': [el("")] };
  const run = await start("sparkdrop.js", PAYLOAD, page);
  await run.tick();
  await run.tick(100000);
  assert.equal(run.banner(), "Sign in and I'll drop the receipt in...");
  assert.deepEqual(run.flow(), ["getPendingReceipt"]);
  assert.equal(run.notes().filter((n) => n.step === "sign_in_needed").length, 1);
  await run.tick(80000);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:false"]);
  assert.equal(run.banner(), "Sign in first. Your receipt is saved in Downloads/Receipts.");
});

test("SparkReceipt: gives up after a minute if the page never matches", async () => {
  const run = await start("sparkdrop.js", PAYLOAD, {});
  await run.tick(59000);
  assert.deepEqual(run.flow(), ["getPendingReceipt"]);
  await run.tick(1500);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:false"]);
  assert.equal(run.banner(), "Couldn't finish the drop. Drag the file in from Downloads/Receipts instead.");
});

test("SparkReceipt: no Confirm button means a miss, with the file left attached", async () => {
  const app = sparkPage({ noConfirm: true });
  const run = await start("sparkdrop.js", PAYLOAD, app.page);
  await run.tick();
  await run.tick();
  await run.tick();
  await run.tick(14000);
  assert.deepEqual(run.flow(), ["getPendingReceipt"]);
  await run.tick(1500);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:false"]);
});

test("SparkReceipt: ignores a receipt meant for Expensify, or no receipt", async () => {
  let run = await start("sparkdrop.js", { ...PAYLOAD, service: "expensify" }, sparkPage().page);
  assert.equal(run.intervals.length, 0);
  assert.deepEqual(run.flow(), ["getPendingReceipt"]);
  run = await start("sparkdrop.js", null, sparkPage().page);
  assert.equal(run.intervals.length, 0);
});

// ---------- Expensify ----------

const CLICKABLE = 'button, [role="button"], [role="menuitem"], [role="tab"]';
const BUTTONS = 'button, [role="button"]';
const EXP = { ...PAYLOAD, service: "expensify" };

function expensifyPage(opts) {
  const o = opts || {};
  const page = {};
  const scan = el("");
  const fab = el("");
  const menuItem = el("Create expense");
  const create = el("Create expense");
  const zone = el("");
  let node = el("Choose files or drag and drop them here");
  const leaf = node;
  for (let i = 0; i < 3; i++) {
    const parent = el("");
    parent.childElementCount = 1;
    node.parentElement = parent;
    node = parent;
  }
  node.parentElement = zone;
  zone.childElementCount = 1;
  const showZone = () => {
    page["div, span"] = [zone, leaf];
  };
  zone.onevent = (ev) => {
    if (ev.type === "drop") {
      zone.dropped = ev.dataTransfer.files[0];
      if (!o.noSubmit) page[BUTTONS] = [create];
    }
  };
  if (o.fabOnly) {
    page['[data-testid="floating-action-button"]'] = [fab];
    fab.onclick = () => {
      page[CLICKABLE] = [menuItem];
    };
    menuItem.onclick = showZone;
  } else {
    page['[data-testid="floating-receipt-button"]'] = [scan];
    scan.onclick = showZone;
  }
  return { page, scan, fab, menuItem, create, zone };
}

test("Expensify: Scan receipt, drop the file on the upload zone, Create expense", async () => {
  const app = expensifyPage();
  const run = await start("expensifydrop.js", EXP, app.page, "/create/scan");
  assert.equal(run.intervals[0].ms, 400);
  assert.equal(run.banner(), "Dropping your receipt into Expensify...");

  await run.tick();
  assert.equal(app.scan.clicks, 1);
  await run.tick();
  assert.deepEqual(app.zone.events, ["dragenter", "dragover", "drop"]);
  assert.equal(app.zone.dropped.name, "3f6c1c1e.jpg");
  assert.equal(app.zone.dropped.type, "image/jpeg");

  await run.tick(); // too soon after dropping: wait
  assert.equal(app.create.clicks, 0);
  await run.tick(1000);
  assert.equal(app.create.clicks, 1);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:true"]);
  assert.equal(run.banner(), "Receipt dropped in. Expensify is scanning it now.");
});

test("Expensify: falls back to the + menu when there is no Scan button", async () => {
  const app = expensifyPage({ fabOnly: true });
  const run = await start("expensifydrop.js", EXP, app.page);
  await run.tick();
  assert.equal(app.fab.clicks, 1);
  await run.tick();
  assert.equal(app.menuItem.clicks, 1);
  await run.tick();
  assert.deepEqual(app.zone.events, ["dragenter", "dragover", "drop"]);
});

test("Expensify: cleanup waits until the app leaves the create screen", async () => {
  const app = expensifyPage();
  const run = await start("expensifydrop.js", { ...EXP, deleteLocal: true }, app.page, "/create/scan");
  await run.tick();
  await run.tick();
  await run.tick(1300);
  assert.equal(app.create.clicks, 1);
  await run.tick(10000);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed"]);
  run.location.pathname = "/home";
  await run.tick(500);
  await run.tick(6100);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:true"]);
  assert.equal(run.banner(), "Upload done. Cleaning up the backup file...");
});

test("Expensify: waits at the sign-in screen", async () => {
  const page = { 'input[aria-label*="Phone or email" i], input[placeholder*="Phone or email" i]': [el("")] };
  const run = await start("expensifydrop.js", EXP, page);
  await run.tick(1000);
  assert.equal(run.banner(), "Sign in and I'll drop the receipt in...");
  await run.tick(180000);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:false"]);
});

test("Expensify: gives up after 75 seconds if the page never matches", async () => {
  const run = await start("expensifydrop.js", EXP, {});
  await run.tick(74000);
  assert.deepEqual(run.flow(), ["getPendingReceipt"]);
  await run.tick(1500);
  assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:false"]);
});

test("Expensify: ignores a receipt meant for SparkReceipt", async () => {
  const run = await start("expensifydrop.js", PAYLOAD, expensifyPage().page);
  assert.equal(run.intervals.length, 0);
});

// ---------- reporting back ----------

test("the result is only sent once the extension has taken the receipt", async () => {
  for (const [file, app, payload] of [
    ["sparkdrop.js", sparkPage(), PAYLOAD],
    ["expensifydrop.js", expensifyPage(), EXP]
  ]) {
    let release;
    const held = new Promise((r) => (release = r));
    const run = await start(file, payload, app.page, "/create/scan", {
      reply: (msg) => (msg.type === "receiptConsumed" ? held : null)
    });
    for (let i = 0; i < 4; i++) await run.tick(1300);
    assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed"], file);
    release({ ok: true });
    await run.tick(0);
    assert.deepEqual(run.flow(), ["getPendingReceipt", "receiptConsumed", "dropFinished:true"], file);
    assert.equal(run.messages[run.messages.length - 1].step, "service_note", file);
  }
});

// ---------- Activity Log notes ----------

test("log notes ride along but never change the upload messages", async () => {
  const app = sparkPage();
  const run = await start("sparkdrop.js", PAYLOAD, app.page);
  await run.tick();
  await run.tick();
  await run.tick();
  await run.tick(1000);
  assert.deepEqual(run.notes().map((n) => n.step), ["receipt_picked_up", "file_attached", "service_note"]);
  for (const note of run.notes()) {
    assert.equal(note.grabId, PAYLOAD.id);
    assert.deepEqual(Object.keys(note).sort(), ["grabId", "note", "step", "type"].filter((k) => k !== "note" || note.note !== undefined).sort());
  }
  // The note about the result goes out after the messages that matter.
  assert.deepEqual(run.messages.map((m) => m.type).slice(-3), ["receiptConsumed", "dropFinished", "logStep"]);
  assert.ok(!JSON.stringify(run.notes()).includes(PAYLOAD.b64));
});

// ---------- wording and tripwires ----------

function bannerTexts(file) {
  const src = read(file);
  return [...src.matchAll(/(?:showBanner|finish)\(\s*"([^"]+)"/g)].map((m) => m[1]);
}

test("corner notes can't be mistaken for the page elements the scripts look for", () => {
  for (const file of ["sparkdrop.js", "expensifydrop.js"]) {
    const texts = bannerTexts(file);
    assert.ok(texts.length >= 7, file);
    for (const text of texts) {
      assert.doesNotMatch(text, /drag and drop them here/i);
      assert.doesNotMatch(text, /^(confirm|scan|create expense|submit expense|track expense)$/i);
    }
  }
});

test("tripwire: the hand-verified selectors and timings are unchanged", () => {
  const spark = read("sparkdrop.js");
  for (const needle of [
    'document.querySelector("button.sidebar-add-document-cta")',
    'document.querySelectorAll("button.add-document-type-option")',
    "document.querySelector('.file-dropzone input[type=\"file\"]')",
    "document.querySelector('input[type=\"file\"]')",
    'document.querySelector(".add-document-modal-body")',
    "/add documents?/i",
    "/^confirm$/i",
    "expense: /expense or receipt/i",
    "income: /income or invoice/i",
    "statement: /bank or credit card statement/i",
    "other: /other document/i",
    "}, 400);",
    "elapsed > 180000",
    "elapsed > 60000",
    "Date.now() - attachedAt < 900",
    "Date.now() - attachedAt > 15000",
    "Date.now() - modalGoneAt > 6000",
    "Date.now() - t0 > 45000"
  ]) {
    assert.ok(spark.includes(needle), "sparkdrop.js no longer has: " + needle);
  }
  const exp = read("expensifydrop.js");
  for (const needle of [
    '[data-testid="floating-receipt-button"]',
    '[data-testid="floating-action-button"]',
    "/drag and drop them here/i",
    "i < 4 && zone.parentElement",
    '["dragenter", "dragover", "drop"]',
    "/^create expense$/i",
    "/^submit expense$/i",
    "/^track expense$/i",
    "/^create \\$/i",
    "/^submit \\$/i",
    "/^scan$/i",
    'input[aria-label*="Phone or email" i], input[placeholder*="Phone or email" i]',
    "}, 400);",
    "elapsed > 180000",
    "elapsed > 75000",
    "Date.now() - attachedAt < 1200",
    "Date.now() - attachedAt > 20000",
    "Date.now() - leftCreateAt > 6000",
    "Date.now() - t0 > 45000",
    'location.pathname.includes("/create")'
  ]) {
    assert.ok(exp.includes(needle), "expensifydrop.js no longer has: " + needle);
  }
});
