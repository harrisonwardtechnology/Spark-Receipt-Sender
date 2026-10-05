// Receipt Sender - background service worker
// Sends captured pages and images to SparkReceipt or Expensify.
// Store-friendly build: no debugger permission, full-page capture is done by
// scrolling and stitching screenshots. Broad site access is optional and only
// requested for batch mode.

// Activity Log: a local audit trail of each step. It is extra, never required.
// If it fails to load, grabs carry on exactly as before.
try {
  importScripts("activitylog.js");
} catch (e) {
  console.warn("Receipt Sender: Activity Log is unavailable", e);
}

function logEvent(step, fields) {
  try {
    if (typeof ActivityLog !== "undefined") ActivityLog.record(step, fields);
  } catch (e) {
    // logging must never get in the way of a grab
  }
}

const DEFAULTS = {
  service: "sparkreceipt", // sparkreceipt | expensify
  sparkType: "expense", // expense | income | statement | other
  sparkEmail: "",
  destination: "autodrop", // autodrop | serviceweb | gmail | mailto | none
  format: "full", // full (stitched image) | visible
  reveal: false,
  closeTab: false,
  deleteLocal: false,
  silent: false
};

const SERVICES = {
  sparkreceipt: {
    name: "SparkReceipt",
    appUrl: "https://app.sparkreceipt.com/",
    match: "https://app.sparkreceipt.com/*",
    email: null // uses settings.sparkEmail
  },
  expensify: {
    name: "Expensify",
    appUrl: "https://new.expensify.com/",
    match: "https://new.expensify.com/*",
    email: "receipts@expensify.com"
  }
};

const QUEUE_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SLICES = 12;
const HISTORY_MAX = 10;

function getService(settings) {
  return SERVICES[settings.service] || SERVICES.sparkreceipt;
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  if (settings.destination === "sparkweb") settings.destination = "serviceweb";
  if (settings.format === "pdf" || settings.format === "png") {
    settings.format = settings.format === "pdf" ? "full" : "visible";
  }
  return settings;
}

async function refreshMenus() {
  const settings = await loadSettings();
  const label = getService(settings).name;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "send-to-service",
      title: "Send Page to " + label,
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "send-image-to-service",
      title: "Send This Image to " + label,
      contexts: ["image"]
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  refreshMenus();
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.service) {
    refreshMenus();
  }
  if (area === "sync") {
    logEvent("settings_changed", { detail: settingNames(changes) });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === "send-to-service") {
    run(tab);
  } else if (info.menuItemId === "send-image-to-service" && info.srcUrl) {
    runImage(tab, info.srcUrl);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "send-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) run(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === "send" && msg.tabId) {
    if (fromWebPage(sender)) return false;
    chrome.tabs
      .get(msg.tabId)
      .then(run)
      .catch((e) => console.error(e));
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "sendAllTabs" && msg.windowId) {
    if (fromWebPage(sender)) return false;
    runBatch(msg.windowId).catch((e) => console.error(e));
    sendResponse({ ok: true });
    return false;
  }

  // The three upload messages run one after another, in the order they
  // arrive, so a quick "finished" can't overtake the "consumed" before it.
  if (msg.type === "getPendingReceipt") {
    // Each service page only gets receipts meant for it
    const service = serviceOfSender(sender) || knownService(msg.service);
    if (!service) {
      sendResponse(null);
      return false;
    }
    withQueue(() => getQueueHead(service))
      .then((head) => sendResponse(head))
      .catch(() => sendResponse(null));
    return true;
  }

  if (msg.type === "receiptConsumed") {
    withQueue(() => consumeHead(serviceOfSender(sender), msg.id))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "dropFinished") {
    withQueue(() => handleDropFinished(msg, sender))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "logStep") {
    noteServiceStep(msg, sender);
    return false;
  }

  if (msg.type === "clearActivityLog") {
    if (fromWebPage(sender) || typeof ActivityLog === "undefined") {
      sendResponse({ ok: false });
      return false;
    }
    ActivityLog.clear()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});

// Grabs and log clearing are started from the extension's own pages (the
// popup and the settings page), never from a script running in a web page.
function fromWebPage(sender) {
  try {
    return !!(
      sender &&
      typeof sender.url === "string" &&
      /^https?:/i.test(sender.url)
    );
  } catch (e) {
    return false;
  }
}

// The service page scripts report a few plain steps for the Activity Log.
// Only known steps from the two service sites are kept.
const PAGE_STEPS = [
  "receipt_picked_up",
  "sign_in_needed",
  "file_attached",
  "service_note"
];

// Which service page a message came from, or null.
function serviceOfSender(sender) {
  const url = (sender && typeof sender.url === "string" && sender.url) || "";
  if (url.startsWith(SERVICES.sparkreceipt.appUrl)) return "sparkreceipt";
  if (url.startsWith(SERVICES.expensify.appUrl)) return "expensify";
  return null;
}

function knownService(name) {
  return Object.prototype.hasOwnProperty.call(SERVICES, name) ? name : null;
}

function noteServiceStep(msg, sender) {
  try {
    if (PAGE_STEPS.indexOf(msg.step) === -1) return;
    const service = serviceOfSender(sender);
    if (!service) return;
    logEvent(msg.step, {
      grabId: msg.grabId,
      service: service,
      detail: typeof msg.note === "string" ? msg.note : undefined
    });
  } catch (e) {
    // logging must never get in the way of a grab
  }
}

// ---------- queue ----------

// Every change to the queue and the in-flight receipt goes through this
// chain, one at a time. Without it, two messages that arrive back to back can
// read and write storage in between each other.
let queueLock = Promise.resolve();

function withQueue(fn) {
  const next = queueLock.then(() => fn());
  queueLock = next.catch(() => {});
  return next;
}

async function getQueue() {
  const { queue } = await chrome.storage.local.get("queue");
  const list = Array.isArray(queue) ? queue : [];
  const fresh = list.filter((i) => Date.now() - i.createdAt < QUEUE_MAX_AGE_MS);
  if (fresh.length !== list.length) {
    await chrome.storage.local.set({ queue: fresh });
  }
  return fresh;
}

async function setQueue(queue) {
  await chrome.storage.local.set({ queue: queue });
}

async function enqueue(item) {
  const queue = await getQueue();
  queue.push(item);
  await setQueue(queue);
}

// Queued receipts from before 4.1.1 may not name a service.
function serviceOfItem(item) {
  return (item && knownService(item.service)) || "sparkreceipt";
}

// The oldest receipt for a service (or the oldest of all, with no service).
// Receipts for the other service wait their turn without blocking this one.
async function getQueueHead(service) {
  const queue = await getQueue();
  return queue.find((i) => !service || serviceOfItem(i) === service) || null;
}

// Receipts a service page has taken but not yet reported on. Only what's
// needed to finish up is kept here, never the image itself.
async function getInFlight() {
  const { inFlight } = await chrome.storage.local.get("inFlight");
  const list = Array.isArray(inFlight) ? inFlight : inFlight ? [inFlight] : [];
  return list.filter((i) => i && typeof i === "object");
}

async function setInFlight(list) {
  if (list.length) {
    await chrome.storage.local.set({ inFlight: list });
  } else {
    await chrome.storage.local.remove("inFlight");
  }
}

// Take a receipt off the queue: the one with this id if the page names it,
// otherwise the oldest for that service.
async function consumeHead(service, id) {
  const queue = await getQueue();
  let at = typeof id === "string" ? queue.findIndex((i) => i.id === id) : -1;
  if (at === -1) {
    at = queue.findIndex((i) => !service || serviceOfItem(i) === service);
  }
  if (at === -1) return;
  const item = queue.splice(at, 1)[0];
  await setQueue(queue);
  const list = await getInFlight();
  list.push({
    id: item.id,
    service: serviceOfItem(item),
    downloadId: item.downloadId,
    startedAt: Date.now()
  });
  await setInFlight(list);
}

async function handleDropFinished(msg, sender) {
  await flashBadge(
    msg.success ? "OK" : "!",
    msg.success ? "#188038" : "#d93025"
  );
  const service = serviceOfSender(sender);
  const list = await getInFlight();
  let at = typeof msg.id === "string" ? list.findIndex((i) => i.id === msg.id) : -1;
  if (at === -1 && service) {
    at = list.findIndex((i) => serviceOfItem(i) === service);
  }
  if (at === -1 && list.length) at = 0;
  const inFlight = at === -1 ? null : list[at];
  const settings = await loadSettings();
  const queue = await getQueue();

  logEvent(msg.success ? "upload_confirmed" : "upload_missed", {
    grabId: inFlight ? inFlight.id : undefined,
    service: inFlight ? inFlight.service : undefined
  });

  if (inFlight) {
    await historyUpdate(inFlight.id, msg.success ? "ok" : "fail");
    if (msg.success && settings.deleteLocal && typeof inFlight.downloadId === "number") {
      try {
        await chrome.downloads.removeFile(inFlight.downloadId);
        logEvent("backup_deleted", { grabId: inFlight.id });
      } catch (e) {
        // file already gone
      }
      try {
        await chrome.downloads.erase({ id: inFlight.downloadId });
      } catch (e) {
        // best effort
      }
    }
    list.splice(at, 1);
    await setInFlight(list);
  }

  const here = service || (inFlight ? serviceOfItem(inFlight) : settings.service);
  if (queue.some((i) => serviceOfItem(i) === here)) {
    // More receipts for this service: run the next one through the same tab
    await openServiceTab({ ...settings, service: here });
    return;
  }

  if (msg.success && settings.closeTab && sender && sender.tab && sender.tab.id) {
    try {
      await chrome.tabs.remove(sender.tab.id);
      logEvent("tab_closed", { service: here });
    } catch (e) {
      // tab already closed
    }
  }

  if (queue.length > 0) {
    // Receipts for the other service are waiting: open that one next
    await openServiceTab({ ...settings, service: serviceOfItem(queue[0]) });
  }
}

// ---------- history ----------

async function historyAdd(entry) {
  const { history } = await chrome.storage.local.get("history");
  const list = Array.isArray(history) ? history : [];
  list.unshift(entry);
  await chrome.storage.local.set({ history: list.slice(0, HISTORY_MAX) });
}

async function historyUpdate(id, status) {
  const { history } = await chrome.storage.local.get("history");
  const list = Array.isArray(history) ? history : [];
  const hit = list.find((h) => h.id === id);
  if (hit) {
    hit.status = status;
    await chrome.storage.local.set({ history: list });
  }
}

// ---------- single grabs ----------

async function run(tab) {
  const settings = await loadSettings();
  await setBadge("...", "#5f6368");
  const entryId = crypto.randomUUID();
  await historyAdd({
    id: entryId,
    ts: Date.now(),
    host: hostOf(tab.url),
    service: settings.service,
    status: "working"
  });
  logEvent("grab_started", {
    grabId: entryId,
    host: hostOf(tab.url),
    service: settings.service,
    detail: "Page"
  });
  try {
    const capture = await capturePage(tab, settings.format);
    await deliver(tab, settings, capture, entryId);
  } catch (e) {
    console.error("Receipt Sender failed:", e);
    logEvent("grab_failed", { grabId: entryId, detail: reasonOf(e) });
    await historyUpdate(entryId, "fail");
    await flashBadge("!", "#d93025");
  }
}

async function runImage(tab, srcUrl) {
  const settings = await loadSettings();
  await setBadge("...", "#5f6368");
  const entryId = crypto.randomUUID();
  await historyAdd({
    id: entryId,
    ts: Date.now(),
    host: hostOf(tab.url),
    service: settings.service,
    status: "working"
  });
  logEvent("grab_started", {
    grabId: entryId,
    host: hostOf(tab.url),
    service: settings.service,
    detail: "Image"
  });
  try {
    const capture = await captureImage(tab, srcUrl);
    await deliver(tab, settings, capture, entryId);
  } catch (e) {
    console.error("Receipt Sender image failed:", e);
    logEvent("grab_failed", { grabId: entryId, detail: reasonOf(e) });
    await historyUpdate(entryId, "fail");
    await flashBadge("!", "#d93025");
  }
}

// ---------- batch ----------

async function runBatch(windowId) {
  const settings = await loadSettings();
  const all = await chrome.tabs.query({ windowId: windowId });
  const targets = all.filter(
    (t) =>
      t.id &&
      t.url &&
      /^https?:/.test(t.url) &&
      !t.url.startsWith(SERVICES.sparkreceipt.appUrl) &&
      !t.url.startsWith(SERVICES.expensify.appUrl)
  );
  if (!targets.length) {
    logEvent("grab_failed", { detail: "Grab All Tabs found no web pages" });
    await flashBadge("0", "#d93025");
    return;
  }
  logEvent("batch_started", {
    service: settings.service,
    detail: tabCount(targets.length)
  });

  for (let i = 0; i < targets.length; i++) {
    const tab = targets[i];
    await setBadge(i + 1 + "/" + targets.length, "#5f6368");
    const entryId = crypto.randomUUID();
    await historyAdd({
      id: entryId,
      ts: Date.now(),
      host: hostOf(tab.url),
      service: settings.service,
      status: "working"
    });
    logEvent("grab_started", {
      grabId: entryId,
      host: hostOf(tab.url),
      service: settings.service,
      detail: "Page " + (i + 1) + " of " + targets.length
    });
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await sleep(500);
      const fresh = await chrome.tabs.get(tab.id);
      const capture = await capturePage(fresh, settings.format);
      await deliver(fresh, settings, capture, entryId, true);
    } catch (e) {
      console.warn("Batch grab failed for tab", tab.url, e);
      logEvent("grab_failed", { grabId: entryId, detail: reasonOf(e) });
      await historyUpdate(entryId, "fail");
    }
  }

  if (settings.destination === "autodrop") {
    await openServiceTab(settings);
  }
  logEvent("batch_finished", {
    service: settings.service,
    detail: tabCount(targets.length)
  });
  await flashBadge("OK", "#188038");
}

// ---------- delivery ----------

async function deliver(tab, settings, capture, entryId, batchMode) {
  const filename = buildFilename(capture.ext);

  // Always keep a copy in Downloads/Receipts as a safety net
  const downloadId = await chrome.downloads.download({
    url: capture.url,
    filename: filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
  await waitForDownload(downloadId);
  logEvent("file_saved", { grabId: entryId, detail: filename });

  if (
    settings.reveal &&
    settings.destination !== "none" &&
    settings.destination !== "autodrop"
  ) {
    try {
      chrome.downloads.show(downloadId);
    } catch (e) {
      // not critical
    }
  }

  if (settings.destination === "autodrop") {
    await withQueue(() =>
      enqueueCapture(capture, filename, settings, downloadId, entryId)
    );
    logEvent("receipt_queued", { grabId: entryId, service: settings.service });
    if (!batchMode) {
      await openServiceTab(settings);
    }
  } else {
    await openDestination(tab, settings);
    logEvent(settings.destination === "none" ? "saved_only" : "handoff_opened", {
      grabId: entryId,
      service: settings.service,
      detail: handoffText(settings.destination)
    });
    await historyUpdate(entryId, "saved");
    await flashBadge("OK", "#188038");
  }
}

async function enqueueCapture(capture, filename, settings, downloadId, entryId) {
  const comma = capture.url.indexOf(",");
  const head = capture.url.slice(0, comma);
  const b64 = capture.url.slice(comma + 1);
  const mime = head.slice(5, head.indexOf(";"));
  await enqueue({
    id: entryId,
    service: settings.service,
    sparkType: settings.sparkType,
    b64: b64,
    mime: mime,
    filename: filename.split("/").pop(),
    createdAt: Date.now(),
    downloadId: downloadId,
    closeTab: !!settings.closeTab,
    deleteLocal: !!settings.deleteLocal
  });
}

async function openDestination(tab, settings) {
  const title = (tab && tab.title) || "Receipt";
  const subject = "Receipt: " + title;
  const body =
    "Receipt captured from " +
    ((tab && tab.url) || "a page") +
    "\n\nAttach the newest file from Downloads/Receipts before sending.";

  if (settings.destination === "serviceweb") {
    await chrome.tabs.create({ url: getService(settings).appUrl });
  } else if (settings.destination === "gmail") {
    const url =
      "https://mail.google.com/mail/?view=cm&fs=1&to=" +
      encodeURIComponent(emailFor(settings)) +
      "&su=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    await chrome.tabs.create({ url: url });
  } else if (settings.destination === "mailto") {
    const url =
      "mailto:" +
      encodeURIComponent(emailFor(settings)) +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    const t = await chrome.tabs.create({ url: url, active: false });
    setTimeout(() => {
      if (t && t.id) {
        chrome.tabs.remove(t.id).catch(() => {});
      }
    }, 3000);
  }
  // destination "none": file is saved, nothing else to open
}

function emailFor(settings) {
  const svc = getService(settings);
  return svc.email || settings.sparkEmail || "";
}

// ---------- page capture (no debugger needed) ----------

async function capturePage(tab, format) {
  if (format === "full") {
    try {
      return await captureFullPage(tab);
    } catch (e) {
      console.warn("Full page capture failed, falling back to visible", e);
    }
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "jpeg",
    quality: 92
  });
  return { url: dataUrl, ext: "jpg" };
}

async function captureFullPage(tab) {
  const [metrics] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      scrollHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      ),
      viewport: window.innerHeight,
      width: window.innerWidth,
      dpr: window.devicePixelRatio || 1,
      originalY: window.scrollY
    })
  });
  const m = metrics.result;
  const slices = Math.min(
    MAX_SLICES,
    Math.max(1, Math.ceil(m.scrollHeight / m.viewport))
  );

  const shots = [];
  for (let i = 0; i < slices; i++) {
    const targetY = Math.min(i * m.viewport, m.scrollHeight - m.viewport);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (y, hideFixed) => {
        if (hideFixed && !window.__rsHidden) {
          window.__rsHidden = [];
          document.querySelectorAll("*").forEach((el) => {
            const pos = getComputedStyle(el).position;
            if (pos === "fixed" || pos === "sticky") {
              window.__rsHidden.push([el, el.style.visibility]);
              el.style.visibility = "hidden";
            }
          });
        }
        window.scrollTo(0, y);
      },
      args: [Math.max(0, targetY), i > 0]
    });
    await sleep(650); // render + captureVisibleTab rate limit
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png"
    });
    shots.push({ y: Math.max(0, targetY), dataUrl: dataUrl });
    if (slices === 1) break;
  }

  // Restore hidden elements and scroll position
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (y) => {
      if (window.__rsHidden) {
        window.__rsHidden.forEach(([el, vis]) => {
          el.style.visibility = vis;
        });
        window.__rsHidden = null;
      }
      window.scrollTo(0, y);
    },
    args: [m.originalY]
  });

  if (shots.length === 1) {
    return { url: shots[0].dataUrl, ext: "png" };
  }

  // Stitch
  const bitmaps = [];
  for (const s of shots) {
    const blob = await (await fetch(s.dataUrl)).blob();
    bitmaps.push(await createImageBitmap(blob));
  }
  const sliceW = bitmaps[0].width;
  const scale = sliceW / m.width;
  const fullH = Math.min(m.scrollHeight, slices * m.viewport) * scale;
  const canvas = new OffscreenCanvas(sliceW, Math.round(fullH));
  const ctx = canvas.getContext("2d");
  shots.forEach((s, i) => {
    ctx.drawImage(bitmaps[i], 0, Math.round(s.y * scale));
  });
  const outBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.9
  });
  const buf = await outBlob.arrayBuffer();
  return {
    url: "data:image/jpeg;base64," + bufToBase64(buf),
    ext: "jpg"
  };
}

// ---------- image capture ----------

async function captureImage(tab, srcUrl) {
  // 1) Try fetching from inside the page, where the site's own session applies
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (url) => {
        try {
          const resp = await fetch(url, { credentials: "include" });
          if (!resp.ok) return null;
          const blob = await resp.blob();
          if (!/^image\//.test(blob.type || "")) return null;
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(
              null,
              bytes.subarray(i, i + 0x8000)
            );
          }
          return { b64: btoa(binary), mime: blob.type };
        } catch (e) {
          return null;
        }
      },
      args: [srcUrl]
    });
    if (res && res.result && res.result.b64) {
      return {
        url: "data:" + res.result.mime + ";base64," + res.result.b64,
        ext: extFromMime(res.result.mime)
      };
    }
  } catch (e) {
    // fall through
  }

  // 2) If the user has granted broad access (batch mode), fetch directly
  try {
    const granted = await chrome.permissions.contains({
      origins: ["<all_urls>"]
    });
    if (granted) {
      const resp = await fetch(srcUrl, { credentials: "include" });
      if (resp.ok) {
        const blob = await resp.blob();
        let mime = blob.type || "image/png";
        if (!/^image\//.test(mime)) mime = "image/png";
        const buf = await blob.arrayBuffer();
        return {
          url: "data:" + mime + ";base64," + bufToBase64(buf),
          ext: extFromMime(mime)
        };
      }
    }
  } catch (e) {
    // fall through
  }

  // 3) Last resort: crop the image out of a screenshot of the visible tab
  const [rectRes] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (url) => {
      const img = Array.from(document.images).find(
        (im) => im.currentSrc === url || im.src === url
      );
      if (!img) return null;
      img.scrollIntoView({ block: "center" });
      const r = img.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        dpr: window.devicePixelRatio || 1
      };
    },
    args: [srcUrl]
  });
  const rect = rectRes && rectRes.result;
  if (!rect || rect.w < 4 || rect.h < 4) {
    throw new Error("Couldn't reach that image");
  }
  await sleep(400);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  });
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const x = Math.max(0, rect.x * rect.dpr);
  const y = Math.max(0, rect.y * rect.dpr);
  const w = Math.min(bitmap.width - x, rect.w * rect.dpr);
  const h = Math.min(bitmap.height - y, rect.h * rect.dpr);
  const canvas = new OffscreenCanvas(Math.round(w), Math.round(h));
  canvas.getContext("2d").drawImage(bitmap, -x, -y);
  const outBlob = await canvas.convertToBlob({ type: "image/png" });
  const buf = await outBlob.arrayBuffer();
  return { url: "data:image/png;base64," + bufToBase64(buf), ext: "png" };
}

// ---------- helpers ----------

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "page";
  }
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function extFromMime(mime) {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("heic")) return "heic";
  return "png";
}

function buildFilename(ext) {
  return "Receipts/" + crypto.randomUUID() + "." + ext;
}

// ---------- Activity Log wording (never throws) ----------

function reasonOf(e) {
  try {
    return e && e.message ? String(e.message) : String(e);
  } catch (err) {
    return "Unknown problem";
  }
}

function tabCount(n) {
  return n === 1 ? "1 tab" : n + " tabs";
}

function handoffText(destination) {
  return (
    {
      serviceweb: "Service opened for a manual drop",
      gmail: "Gmail draft",
      mailto: "Mail app draft",
      none: "Backup file only"
    }[destination] || ""
  );
}

// Names of the settings that changed. Values are never logged.
function settingNames(changes) {
  try {
    const names = {
      service: "service",
      sparkType: "document type",
      sparkEmail: "forwarding email",
      destination: "after grabbing",
      format: "save as",
      reveal: "open folder",
      closeTab: "close tab",
      deleteLocal: "delete backup",
      silent: "silent mode"
    };
    return Object.keys(changes)
      .map((k) => names[k])
      .filter(Boolean)
      .sort()
      .join(", ");
  } catch (e) {
    return "";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForDownload(downloadId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      resolve();
    }, 15000);
    const listener = (delta) => {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === "complete") {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        resolve();
      } else if (delta.state.current === "interrupted") {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error("Download failed"));
      }
    };
    chrome.downloads.onChanged.addListener(listener);
  });
}

async function openServiceTab(settings) {
  const svc = getService(settings);
  const silent = !!settings.silent;
  logEvent("service_opened", {
    service: settings.service,
    detail: silent ? "Background tab" : "Front tab"
  });
  try {
    const tabs = await chrome.tabs.query({ url: svc.match });
    if (tabs.length && tabs[0].id) {
      const props = silent
        ? { url: svc.appUrl }
        : { url: svc.appUrl, active: true };
      await chrome.tabs.update(tabs[0].id, props);
      if (!silent && tabs[0].windowId) {
        try {
          await chrome.windows.update(tabs[0].windowId, { focused: true });
        } catch (e) {
          // not critical
        }
      }
      return;
    }
  } catch (e) {
    // fall through to creating a tab
  }
  await chrome.tabs.create({ url: svc.appUrl, active: !silent });
}

async function setBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color: color });
  await chrome.action.setBadgeText({ text: text });
}

async function flashBadge(text, color) {
  await setBadge(text, color);
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 4000);
}
