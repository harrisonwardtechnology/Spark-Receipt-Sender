// Stand-in for the chrome.* extension APIs, so the popup, settings and privacy
// pages can be opened as plain files for screenshots and checks.
// Used by tools/screenshots.py and tools/ui_check.py. Never shipped to users:
// nothing in manifest.json points here.
//
// The Python scripts set window.__RS_STUB before this runs:
//   { manifest, sync, local, tab, grantAllSites }
// Every call the page makes is noted in window.__calls.

(function () {
  const cfg = window.__RS_STUB || {};
  const calls = (window.__calls = []);
  const note = (api, arg) => calls.push({ api: api, arg: arg === undefined ? null : arg });
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const changeListeners = [];

  function area(name, start) {
    const data = clone(start || {});
    return {
      _data: data,
      get(query) {
        note("storage." + name + ".get", typeof query === "string" ? query : Object.keys(query || {}));
        let out = {};
        if (query === null || query === undefined) {
          out = clone(data);
        } else if (typeof query === "string") {
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
        return Promise.resolve(out);
      },
      set(items) {
        note("storage." + name + ".set", clone(items));
        const changes = {};
        Object.keys(items).forEach((k) => {
          if (JSON.stringify(data[k]) !== JSON.stringify(items[k])) {
            changes[k] = { oldValue: clone(data[k]), newValue: clone(items[k]) };
          }
          data[k] = clone(items[k]);
        });
        if (Object.keys(changes).length) {
          setTimeout(() => changeListeners.forEach((fn) => fn(changes, name)), 0);
        }
        return Promise.resolve();
      }
    };
  }

  const sync = area("sync", cfg.sync);
  const local = area("local", cfg.local);

  window.chrome = {
    storage: {
      sync: sync,
      local: local,
      onChanged: { addListener: (fn) => changeListeners.push(fn) }
    },
    runtime: {
      id: "stubstubstubstubstubstubstubstub",
      getManifest: () => clone(cfg.manifest || { version: "0.0.0" }),
      getURL: (path) => path,
      openOptionsPage: () => {
        note("runtime.openOptionsPage");
        return Promise.resolve();
      },
      sendMessage: (msg) => {
        note("runtime.sendMessage", clone(msg));
        if (msg && msg.type === "clearActivityLog") {
          // What the service worker does: empty the log, note the clearing
          return local
            .set({ activityLog: [{ ts: Date.now(), step: "log_cleared" }] })
            .then(() => ({ ok: true }));
        }
        return Promise.resolve({ ok: true });
      }
    },
    tabs: {
      query: (q) => {
        note("tabs.query", clone(q));
        return Promise.resolve(cfg.tab === null ? [] : [clone(cfg.tab || { id: 42, windowId: 7, title: "Example", url: "https://example.com/" })]);
      }
    },
    permissions: {
      contains: (p) => {
        note("permissions.contains", clone(p));
        return Promise.resolve(!!cfg.grantAllSites);
      },
      request: (p) => {
        note("permissions.request", clone(p));
        return Promise.resolve(!!cfg.grantAllSites);
      }
    }
  };

  // The popup closes itself after a grab. Keep the page open for the check.
  window.close = () => note("window.close");
})();
