// Send to SparkReceipt - background service worker

const DEFAULTS = {
  sparkEmail: "",
  destination: "autodrop", // autodrop | sparkweb | gmail | mailto | none
  format: "pdf", // pdf | png
  reveal: false,
  closeTab: false, // close the SparkReceipt tab after a successful upload
  deleteLocal: false, // delete the backup file after a successful upload
  silent: false // do the drop in a background tab without stealing focus
};

const SPARK_APP_URL = "https://app.sparkreceipt.com/";
const PENDING_MAX_AGE_MS = 3 * 60 * 1000;

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "send-to-spark",
      title: "Send page to SparkReceipt",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "send-image-to-spark",
      title: "Send this image to SparkReceipt",
      contexts: ["image"]
    });
  });
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === "send-to-spark") {
    run(tab);
  } else if (info.menuItemId === "send-image-to-spark" && info.srcUrl) {
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
    chrome.tabs
      .get(msg.tabId)
      .then(run)
      .catch((e) => console.error(e));
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "getPendingReceipt") {
    chrome.storage.session
      .get("pending")
      .then(({ pending }) => {
        if (pending && Date.now() - pending.createdAt < PENDING_MAX_AGE_MS) {
          sendResponse(pending);
        } else {
          sendResponse(null);
        }
      })
      .catch(() => sendResponse(null));
    return true;
  }

  if (msg.type === "receiptConsumed") {
    chrome.storage.session.remove("pending");
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "dropFinished") {
    handleDropFinished(msg, sender)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});

async function handleDropFinished(msg, sender) {
  await flashBadge(
    msg.success ? "OK" : "!",
    msg.success ? "#188038" : "#d93025"
  );
  if (!msg.success) return;
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };

  if (settings.deleteLocal) {
    try {
      const { lastDownloadId } = await chrome.storage.session.get(
        "lastDownloadId"
      );
      if (typeof lastDownloadId === "number") {
        try {
          await chrome.downloads.removeFile(lastDownloadId);
        } catch (e) {
          // file already gone or moved, nothing to do
        }
        try {
          await chrome.downloads.erase({ id: lastDownloadId });
        } catch (e) {
          // history entry cleanup is best effort
        }
        chrome.storage.session.remove("lastDownloadId");
      }
    } catch (e) {
      console.warn("Could not delete the backup file", e);
    }
  }

  if (settings.closeTab && sender && sender.tab && sender.tab.id) {
    try {
      await chrome.tabs.remove(sender.tab.id);
    } catch (e) {
      // tab already closed
    }
  }
}

async function run(tab) {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  await setBadge("...", "#5f6368");
  try {
    const capture = await capturePage(tab, settings.format);
    await deliver(tab, settings, capture);
  } catch (e) {
    console.error("Send to SparkReceipt failed:", e);
    await flashBadge("!", "#d93025");
  }
}

async function runImage(tab, srcUrl) {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  await setBadge("...", "#5f6368");
  try {
    const capture = await fetchImageAsDataUrl(srcUrl);
    await deliver(tab, settings, capture);
  } catch (e) {
    console.error("Send image to SparkReceipt failed:", e);
    await flashBadge("!", "#d93025");
  }
}

async function deliver(tab, settings, capture) {
  const filename = buildFilename(tab, capture.ext);

  // Always keep a copy in Downloads/SparkReceipt as a safety net
  const downloadId = await chrome.downloads.download({
    url: capture.url,
    filename: filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
  await waitForDownload(downloadId);

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

  await openDestination(tab, settings, capture, filename, downloadId);
  if (settings.destination !== "autodrop") {
    // Autodrop flashes its badge when the drop actually finishes
    await flashBadge("OK", "#188038");
  }
}

async function fetchImageAsDataUrl(srcUrl) {
  const resp = await fetch(srcUrl, { credentials: "include" });
  if (!resp.ok) throw new Error("Image fetch failed: " + resp.status);
  const blob = await resp.blob();
  let mime = blob.type || "image/png";
  if (!/^image\//.test(mime)) mime = "image/png";
  const buf = await blob.arrayBuffer();
  return {
    url: "data:" + mime + ";base64," + bufToBase64(buf),
    ext: extFromMime(mime)
  };
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

async function capturePage(tab, format) {
  if (format === "pdf") {
    try {
      const data = await printToPdf(tab.id);
      return { url: "data:application/pdf;base64," + data, ext: "pdf" };
    } catch (e) {
      console.warn("PDF capture failed, falling back to screenshot", e);
    }
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  });
  return { url: dataUrl, ext: "png" };
}

async function printToPdf(tabId) {
  const target = { tabId: tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const result = await chrome.debugger.sendCommand(target, "Page.printToPDF", {
      printBackground: true,
      marginTop: 0.25,
      marginBottom: 0.25,
      marginLeft: 0.25,
      marginRight: 0.25
    });
    return result.data;
  } finally {
    try {
      await chrome.debugger.detach(target);
    } catch (e) {
      // already detached
    }
  }
}

function buildFilename(tab, ext) {
  return "SparkReceipt/" + crypto.randomUUID() + "." + ext;
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

async function openDestination(tab, settings, capture, filename, downloadId) {
  const title = tab.title || "Receipt";
  const subject = "Receipt: " + title;
  const body =
    "Receipt captured from " +
    tab.url +
    "\n\nAttach the newest file from Downloads/SparkReceipt before sending.";

  if (settings.destination === "autodrop") {
    const handedOff = await stashPendingReceipt(
      capture,
      filename,
      settings,
      downloadId
    );
    await openSparkTab(settings);
    if (!handedOff) {
      console.warn(
        "Receipt too large for auto-drop. It is saved in Downloads/SparkReceipt."
      );
    }
  } else if (settings.destination === "sparkweb") {
    await chrome.tabs.create({ url: SPARK_APP_URL });
  } else if (settings.destination === "gmail") {
    const url =
      "https://mail.google.com/mail/?view=cm&fs=1&to=" +
      encodeURIComponent(settings.sparkEmail || "") +
      "&su=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    await chrome.tabs.create({ url: url });
  } else if (settings.destination === "mailto") {
    const url =
      "mailto:" +
      encodeURIComponent(settings.sparkEmail || "") +
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

async function stashPendingReceipt(capture, filename, settings, downloadId) {
  try {
    const comma = capture.url.indexOf(",");
    const head = capture.url.slice(0, comma);
    const b64 = capture.url.slice(comma + 1);
    const mime = head.slice(5, head.indexOf(";"));
    const base = filename.split("/").pop();
    await chrome.storage.session.set({
      pending: {
        b64: b64,
        mime: mime,
        filename: base,
        createdAt: Date.now(),
        closeTab: !!settings.closeTab,
        deleteLocal: !!settings.deleteLocal
      },
      lastDownloadId: downloadId
    });
    return true;
  } catch (e) {
    // Too big for session storage. The downloaded copy is the fallback.
    return false;
  }
}

async function openSparkTab(settings) {
  const silent = !!(settings && settings.silent);
  try {
    const tabs = await chrome.tabs.query({ url: SPARK_APP_URL + "*" });
    if (tabs.length && tabs[0].id) {
      // Send the tab to the app home so the drop flow starts from a known spot
      const props = silent
        ? { url: SPARK_APP_URL }
        : { url: SPARK_APP_URL, active: true };
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
  await chrome.tabs.create({ url: SPARK_APP_URL, active: !silent });
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
