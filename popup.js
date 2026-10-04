const DEFAULTS = {
  service: "sparkreceipt",
  sparkType: "expense",
  sparkEmail: "",
  destination: "autodrop",
  format: "full",
  reveal: false,
  closeTab: false,
  deleteLocal: false,
  silent: false
};

const SERVICE_NAMES = {
  sparkreceipt: "SparkReceipt",
  expensify: "Expensify"
};

// What each recent grab mark means, for the tooltip and for screen readers
const STATUS_WORDS = {
  ok: "Uploaded",
  fail: "Missed",
  working: "Working",
  saved: "Saved"
};

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  if (settings.destination === "sparkweb") settings.destination = "serviceweb";

  document.getElementById("pageTitle").textContent =
    tab && tab.title ? tab.title : "This Page";

  const serviceSelect = document.getElementById("service");
  serviceSelect.value = settings.service;
  serviceSelect.addEventListener("change", async () => {
    settings.service = serviceSelect.value;
    await chrome.storage.sync.set({ service: settings.service });
    refresh(settings);
  });

  const typeSelect = document.getElementById("sparkType");
  typeSelect.value = settings.sparkType;
  typeSelect.addEventListener("change", async () => {
    settings.sparkType = typeSelect.value;
    await chrome.storage.sync.set({ sparkType: settings.sparkType });
  });

  refresh(settings);
  renderHistory();

  const sendBtn = document.getElementById("sendBtn");
  const allBtn = document.getElementById("allBtn");

  if (!tab) {
    sendBtn.disabled = true;
    allBtn.disabled = true;
    setStatus("Open a web page first, then try again.");
  } else if (isBlockedPage(tab.url)) {
    setStatus("Heads up: Chrome doesn't let extensions capture this page.");
  }

  sendBtn.addEventListener("click", async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "Working...";
    try {
      await chrome.runtime.sendMessage({ type: "send", tabId: tab.id });
    } catch (e) {
      // service worker handles the rest
    }
    setTimeout(() => window.close(), 500);
  });

  allBtn.addEventListener("click", async () => {
    // Batch capture needs access to every tab, ask once
    let granted = await chrome.permissions.contains({
      origins: ["<all_urls>"]
    });
    if (!granted) {
      granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    }
    if (!granted) {
      setStatus(
        "Grab All Tabs needs your OK to see the other tabs. Choose Allow when Chrome asks."
      );
      return;
    }
    setStatus("");
    allBtn.disabled = true;
    allBtn.textContent = "Grabbing All Tabs...";
    try {
      await chrome.runtime.sendMessage({
        type: "sendAllTabs",
        windowId: tab.windowId
      });
    } catch (e) {
      // service worker handles the rest
    }
    setTimeout(() => window.close(), 500);
  });

  document.getElementById("optionsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

// Chrome's own pages and the Chrome Web Store can't be captured
function isBlockedPage(url) {
  if (typeof url !== "string" || !url) return false;
  return (
    /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url) ||
    /^https:\/\/chromewebstore\.google\.com\//i.test(url) ||
    /^https:\/\/chrome\.google\.com\/webstore\//i.test(url)
  );
}

function refresh(settings) {
  document.getElementById("plan").textContent = planText(settings);
  document.getElementById("typeRow").hidden =
    settings.service !== "sparkreceipt";
}

function planText(s) {
  const svc = SERVICE_NAMES[s.service] || "SparkReceipt";
  const what = s.format === "visible" ? "screenshot" : "full-page image";
  const dest =
    {
      autodrop: ", then drops it into " + svc + " for you.",
      serviceweb: ", then opens " + svc + " so you can drop it in.",
      gmail: ", then opens a Gmail draft to your " + svc + " address.",
      mailto: ", then opens an email draft to your " + svc + " address.",
      none: " in Downloads/Receipts."
    }[s.destination] || ".";
  return "Saves this page as a " + what + dest;
}

async function renderHistory() {
  const { history } = await chrome.storage.local.get("history");
  const list = Array.isArray(history) ? history : [];
  if (!list.length) return;
  const marks = { ok: "✓", fail: "✕", working: "…", saved: "↓" };
  const box = document.getElementById("historyList");
  const ul = document.createElement("ul");
  list.slice(0, 10).forEach((h) => {
    const status = Object.prototype.hasOwnProperty.call(marks, h.status)
      ? h.status
      : "working";
    const row = document.createElement("li");
    row.className = "hrow";
    row.title = STATUS_WORDS[status];
    const mark = document.createElement("span");
    mark.className = "mark " + status;
    mark.textContent = marks[status];
    mark.setAttribute("aria-hidden", "true");
    const word = document.createElement("span");
    word.className = "sr-only";
    word.textContent = STATUS_WORDS[status] + ":";
    const site = document.createElement("span");
    site.className = "site";
    site.textContent = h.host || "page";
    const svc = document.createElement("span");
    svc.className = "svc";
    svc.textContent = SERVICE_NAMES[h.service] || SERVICE_NAMES.sparkreceipt;
    row.appendChild(mark);
    row.appendChild(word);
    row.appendChild(site);
    row.appendChild(svc);
    ul.appendChild(row);
  });
  box.replaceChildren(ul);
  if (ul.scrollHeight > box.clientHeight) {
    // Long list: let keyboard users scroll it
    box.tabIndex = 0;
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Recent Grabs");
  }
}
