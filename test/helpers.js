// Shared test helpers. No dependencies, only Node built-ins.
//
// The extension's scripts are plain browser scripts, not modules. To test
// them without changing them, each one is run inside a node:vm sandbox with a
// small fake `chrome` object that records every call.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// RS_ROOT lets the same tests run against another checkout (for example the
// previous release) to compare behavior.
const ROOT = process.env.RS_ROOT
  ? path.resolve(process.env.RS_ROOT)
  : path.join(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function exists(name) {
  return fs.existsSync(path.join(ROOT, name));
}

function manifest() {
  return JSON.parse(read("manifest.json"));
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function event() {
  const listeners = [];
  return {
    listeners,
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    },
    fire: (...args) => listeners.slice().map((fn) => fn(...args))
  };
}

function storageArea(name, start, calls, onChanged, failKeys) {
  const data = clone(start || {});
  return {
    data,
    async get(query) {
      calls.push(["storage." + name + ".get", clone(query)]);
      if (query === null || query === undefined) return clone(data);
      const out = {};
      if (typeof query === "string") {
        if (query in data) out[query] = clone(data[query]);
      } else if (Array.isArray(query)) {
        query.forEach((k) => {
          if (k in data) out[k] = clone(data[k]);
        });
      } else {
        Object.keys(query).forEach((k) => {
          out[k] = k in data ? clone(data[k]) : clone(query[k]);
        });
      }
      return out;
    },
    async set(items) {
      calls.push(["storage." + name + ".set", clone(items)]);
      if (failKeys && Object.keys(items).some((k) => failKeys.includes(k))) {
        throw new Error("storage is full");
      }
      const changes = {};
      Object.keys(items).forEach((k) => {
        changes[k] = { oldValue: clone(data[k]), newValue: clone(items[k]) };
        data[k] = clone(items[k]);
      });
      onChanged.fire(changes, name);
    },
    async remove(key) {
      calls.push(["storage." + name + ".remove", key]);
      delete data[key];
    }
  };
}

// A fake chrome.* that covers what the extension uses.
function fakeChrome(opts) {
  const o = opts || {};
  const calls = [];
  const note = (api) => (...args) => {
    calls.push([api, ...clone(args)]);
    return Promise.resolve();
  };
  const onChanged = event();
  const downloadsChanged = event();
  let nextDownload = 1;
  let nextTab = 100;
  const chrome = {
    runtime: {
      id: "testextensionid",
      getURL: (p) => "chrome-extension://testextensionid/" + (p || ""),
      getManifest: () => manifest(),
      onInstalled: event(),
      onMessage: event(),
      openOptionsPage: note("runtime.openOptionsPage")
    },
    storage: {
      onChanged,
      sync: storageArea("sync", o.sync, calls, onChanged),
      local: storageArea("local", o.local, calls, onChanged, o.failLocalKeys)
    },
    contextMenus: {
      onClicked: event(),
      removeAll: (cb) => {
        calls.push(["contextMenus.removeAll"]);
        if (cb) cb();
      },
      create: (props) => {
        calls.push(["contextMenus.create", clone(props)]);
      }
    },
    commands: { onCommand: event() },
    action: {
      setBadgeText: note("action.setBadgeText"),
      setBadgeBackgroundColor: note("action.setBadgeBackgroundColor")
    },
    tabs: {
      async query(q) {
        calls.push(["tabs.query", clone(q)]);
        return clone(o.tabs ? o.tabs(q) : []);
      },
      async get(id) {
        calls.push(["tabs.get", id]);
        return { id, windowId: 1, url: "https://www.example.com/order/1", title: "Order" };
      },
      async create(props) {
        calls.push(["tabs.create", clone(props)]);
        return { id: nextTab++, windowId: 1 };
      },
      async update(id, props) {
        calls.push(["tabs.update", id, clone(props)]);
        return { id, windowId: 1 };
      },
      async remove(id) {
        calls.push(["tabs.remove", id]);
      },
      async captureVisibleTab(windowId, options) {
        calls.push(["tabs.captureVisibleTab", windowId, clone(options)]);
        if (o.captureFails) throw new Error(o.captureFails);
        return "data:image/jpeg;base64,/9j/AAAA";
      }
    },
    windows: { update: note("windows.update") },
    scripting: {
      async executeScript(details) {
        calls.push(["scripting.executeScript", details.target]);
        // Tests take the simple path: no page access, so the visible
        // screenshot fallback is used.
        throw new Error("Cannot access contents of the page");
      }
    },
    permissions: {
      async contains() {
        return false;
      }
    },
    downloads: {
      onChanged: downloadsChanged,
      async download(options) {
        const id = nextDownload++;
        calls.push(["downloads.download", { ...clone(options), url: options.url.slice(0, 22) }]);
        setImmediate(() =>
          downloadsChanged.fire({
            id,
            state: { current: o.downloadFails ? "interrupted" : "complete" }
          })
        );
        return id;
      },
      removeFile: note("downloads.removeFile"),
      erase: note("downloads.erase"),
      show: (id) => {
        calls.push(["downloads.show", id]);
      }
    }
  };
  return { chrome, calls };
}

// Timers inside the sandbox fire right away (in order), so tests never wait
// on the real 4 second badge timer or the 500 ms batch pause.
function fastTimers() {
  let seq = 0;
  const live = new Map();
  return {
    setTimeout: (fn) => {
      const id = ++seq;
      live.set(id, setImmediate(() => {
        live.delete(id);
        fn();
      }));
      return id;
    },
    clearTimeout: (id) => {
      if (live.has(id)) {
        clearImmediate(live.get(id));
        live.delete(id);
      }
    }
  };
}

// Load background.js (the service worker) into a sandbox.
function loadBackground(opts) {
  const o = opts || {};
  const { chrome, calls } = fakeChrome(o);
  const timers = fastTimers();
  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    crypto: globalThis.crypto,
    URL,
    btoa,
    atob,
    fetch: async () => {
      throw new Error("no network in tests");
    }
  };
  sandbox.self = sandbox;
  sandbox.importScripts = (name) => {
    if (o.importFails) throw new Error("could not load " + name);
    vm.runInContext(read(name), sandbox, { filename: name });
  };
  vm.createContext(sandbox);
  vm.runInContext(read("background.js"), sandbox, { filename: "background.js" });
  const evalIn = (code) => vm.runInContext(code, sandbox);
  // Let every pending promise and fast timer finish.
  const settle = async () => {
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setImmediate(r));
    }
    if (sandbox.ActivityLog) await sandbox.ActivityLog.flush();
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setImmediate(r));
    }
  };
  // Send a message the way Chrome would and wait for the reply (if any).
  const send = async (msg, sender) => {
    let reply;
    let replied = false;
    let wake;
    const waiting = new Promise((r) => (wake = r));
    const keptOpen = chrome.runtime.onMessage.listeners[0](
      msg,
      sender || {},
      (value) => {
        reply = value;
        replied = true;
        wake();
      }
    );
    if (keptOpen && !replied) await waiting;
    return { keptOpen, reply, replied };
  };
  return { sandbox, chrome, calls, evalIn, settle, send };
}

function callsTo(calls, api) {
  return calls.filter((c) => c[0] === api);
}

// Pull every attribute value for a tag out of an HTML string (regex is fine
// for these small hand-written pages).
function attrs(html, tag, attr) {
  const out = [];
  const tagRe = new RegExp("<" + tag + "\\b[^>]*>", "gi");
  const attrRe = new RegExp("\\b" + attr + '="([^"]*)"', "i");
  for (const m of html.matchAll(tagRe)) {
    const hit = m[0].match(attrRe);
    if (hit) out.push(hit[1]);
  }
  return out;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  ROOT,
  read,
  exists,
  manifest,
  clone,
  fakeChrome,
  fastTimers,
  loadBackground,
  callsTo,
  attrs,
  stripTags
};
