// Receipt Sender - Activity Log
// A small audit trail of the steps each grab takes. Everything stays in
// chrome.storage.local on this device. Nothing is sent anywhere.
// It never holds page contents or file contents, and web addresses are
// trimmed to the site name before anything is written.
//
// Loaded three ways: by the service worker (importScripts), by the settings
// page (script tag), and by the tests (require).

(function (root) {
  "use strict";

  const KEY = "activityLog";
  const MAX_ENTRIES = 500;
  const MAX_DETAIL = 160;

  // The only steps the log accepts, with the name shown on the settings page.
  const STEPS = {
    grab_started: "Grab Started",
    file_saved: "File Saved",
    page_cut_short: "Page Cut Short",
    receipt_queued: "Receipt Queued",
    service_opened: "Service Opened",
    handoff_opened: "Handoff Opened",
    saved_only: "Saved to Downloads",
    receipt_picked_up: "Receipt Picked Up",
    sign_in_needed: "Waiting for Sign-In",
    file_attached: "File Attached",
    service_note: "Service Message",
    upload_confirmed: "Upload Confirmed",
    upload_missed: "Upload Missed",
    tab_closed: "Tab Closed",
    backup_deleted: "Backup Deleted",
    grab_failed: "Grab Failed",
    batch_started: "Batch Started",
    batch_finished: "Batch Finished",
    settings_changed: "Settings Changed",
    log_cleared: "Log Cleared"
  };

  const GOOD_STEPS = ["upload_confirmed", "saved_only", "batch_finished"];
  const BAD_STEPS = ["upload_missed", "grab_failed"];

  const SERVICE_NAMES = {
    sparkreceipt: "SparkReceipt",
    expensify: "Expensify"
  };

  // Reduce a web address (or anything like one) to its site name.
  function hostOnly(value) {
    if (typeof value !== "string" || !value) return "";
    let host = value.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(host)) {
      try {
        host = new URL(host).hostname;
      } catch (e) {
        return "";
      }
    }
    host = host.split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase();
    return /^[a-z0-9_.-]{1,100}$/.test(host) ? host : "";
  }

  // Make free text safe to keep: no links, no data, no email addresses,
  // one line, and short.
  function scrub(text) {
    let s = String(text === null || text === undefined ? "" : text);
    s = s.replace(/\bdata:[^\s"'<>)]*/gi, "[data]");
    s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, function (m) {
      return hostOnly(m) || "[link]";
    });
    s = s.replace(/[^\s"'<>()@]+@[^\s"'<>()@]+\.[a-z]{2,}/gi, "[email]");
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > MAX_DETAIL) s = s.slice(0, MAX_DETAIL - 3) + "...";
    return s;
  }

  // Build one log entry. Returns null for a step the log doesn't know.
  function makeEntry(step, fields, now) {
    if (!Object.prototype.hasOwnProperty.call(STEPS, step)) return null;
    const f = fields && typeof fields === "object" ? fields : {};
    const entry = {
      ts: typeof now === "number" ? now : Date.now(),
      step: step
    };
    if (typeof f.grabId === "string" && /^[0-9a-f-]{1,40}$/i.test(f.grabId)) {
      entry.grabId = f.grabId;
    }
    const host = hostOnly(f.host);
    if (host) entry.host = host;
    if (Object.prototype.hasOwnProperty.call(SERVICE_NAMES, f.service)) {
      entry.service = f.service;
    }
    if (f.detail !== undefined && f.detail !== null) {
      const detail = scrub(f.detail);
      if (detail) entry.detail = detail;
    }
    return entry;
  }

  // Add an entry to a list and keep only the newest MAX_ENTRIES.
  function append(list, entry) {
    const next = Array.isArray(list) ? list.slice() : [];
    if (entry) next.push(entry);
    return next.length > MAX_ENTRIES
      ? next.slice(next.length - MAX_ENTRIES)
      : next;
  }

  function label(step) {
    return STEPS[step] || "Other Step";
  }

  function tone(step) {
    if (GOOD_STEPS.indexOf(step) !== -1) return "good";
    if (BAD_STEPS.indexOf(step) !== -1) return "bad";
    return "plain";
  }

  function serviceName(service) {
    return SERVICE_NAMES[service] || "";
  }

  // Entries often share a grab. Fill in the site name on later steps of the
  // same grab so each row reads on its own. Returns new objects.
  function withSites(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const sites = {};
    list.forEach(function (e) {
      if (e && e.grabId && e.host && !sites[e.grabId]) sites[e.grabId] = e.host;
    });
    return list.map(function (e) {
      const copy = Object.assign({}, e);
      if (!copy.host && copy.grabId && sites[copy.grabId]) {
        copy.host = sites[copy.grabId];
      }
      return copy;
    });
  }

  function csvCell(value) {
    let s = String(value === null || value === undefined ? "" : value);
    // Keep spreadsheet apps from treating a cell as a formula
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(entries) {
    const rows = [["Time", "Step", "Site", "Service", "Details", "Grab ID"]];
    withSites(entries).forEach(function (e) {
      rows.push([
        new Date(e.ts).toISOString(),
        label(e.step),
        e.host || "",
        serviceName(e.service),
        e.detail || "",
        e.grabId || ""
      ]);
    });
    return (
      rows
        .map(function (r) {
          return r.map(csvCell).join(",");
        })
        .join("\r\n") + "\r\n"
    );
  }

  function toJson(entries, version, now) {
    return JSON.stringify(
      {
        app: "Receipt Sender",
        version: version || "",
        exportedAt: new Date(
          typeof now === "number" ? now : Date.now()
        ).toISOString(),
        entries: withSites(entries).map(function (e) {
          return Object.assign({ time: new Date(e.ts).toISOString() }, e);
        })
      },
      null,
      2
    );
  }

  // ---------- storage (one writer at a time, never throws) ----------
  //
  // Steps are held in memory for a moment and written together once things go
  // quiet. That keeps log writes from landing in the middle of an upload.

  const QUIET_MS = 500; // write this long after the last step
  const MAX_WAIT_MS = 5000; // but never hold a step longer than this

  let pending = [];
  let quietTimer = null;
  let firstPendingAt = 0;
  let chain = Promise.resolve();

  function store() {
    return root.chrome.storage.local;
  }

  async function read() {
    try {
      const got = await store().get(KEY);
      return Array.isArray(got[KEY]) ? got[KEY] : [];
    } catch (e) {
      return [];
    }
  }

  // Add a step to the log. Never waits and never throws, so logging can't get
  // in the way of a grab. The time is taken right away. Returns true if the
  // step was accepted.
  function record(step, fields) {
    try {
      const now = Date.now();
      const entry = makeEntry(step, fields, now);
      if (!entry) return false;
      pending = append(pending, entry);
      if (pending.length === 1) firstPendingAt = now;
      if (quietTimer) clearTimeout(quietTimer);
      const wait = Math.max(
        0,
        Math.min(QUIET_MS, firstPendingAt + MAX_WAIT_MS - now)
      );
      quietTimer = setTimeout(flush, wait);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Write any waiting steps now. Resolves when they are stored.
  function flush() {
    if (quietTimer) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
    if (!pending.length) return chain;
    const batch = pending;
    pending = [];
    chain = chain.then(async function () {
      try {
        const got = await store().get(KEY);
        let list = Array.isArray(got[KEY]) ? got[KEY] : [];
        batch.forEach(function (entry) {
          list = append(list, entry);
        });
        await store().set({ [KEY]: list });
      } catch (e) {
        // best effort
      }
    });
    return chain;
  }

  // Empty the log, then note that it was cleared.
  function clear() {
    if (quietTimer) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
    pending = [];
    const entry = makeEntry("log_cleared", {}, Date.now());
    chain = chain.then(async function () {
      try {
        await store().set({ [KEY]: [entry] });
      } catch (e) {
        // best effort
      }
    });
    return chain;
  }

  const api = {
    KEY: KEY,
    MAX_ENTRIES: MAX_ENTRIES,
    MAX_DETAIL: MAX_DETAIL,
    STEPS: STEPS,
    hostOnly: hostOnly,
    scrub: scrub,
    makeEntry: makeEntry,
    append: append,
    label: label,
    tone: tone,
    serviceName: serviceName,
    withSites: withSites,
    toCsv: toCsv,
    toJson: toJson,
    read: read,
    record: record,
    flush: flush,
    clear: clear
  };

  root.ActivityLog = api;
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
