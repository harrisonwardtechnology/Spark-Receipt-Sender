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

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  if (settings.destination === "sparkweb") settings.destination = "serviceweb";

  document.getElementById("pageTitle").textContent =
    tab && tab.title ? tab.title : "This page";

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

  document.getElementById("sendBtn").addEventListener("click", async () => {
    const btn = document.getElementById("sendBtn");
    btn.disabled = true;
    btn.textContent = "Working...";
    try {
      await chrome.runtime.sendMessage({ type: "send", tabId: tab.id });
    } catch (e) {
      // service worker handles the rest
    }
    setTimeout(() => window.close(), 500);
  });

  document.getElementById("allBtn").addEventListener("click", async () => {
    const btn = document.getElementById("allBtn");
    // Batch capture needs access to every tab, ask once
    let granted = await chrome.permissions.contains({
      origins: ["<all_urls>"]
    });
    if (!granted) {
      granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    }
    if (!granted) {
      btn.textContent = "Needs site access to see other tabs";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Grabbing all tabs...";
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

function refresh(settings) {
  document.getElementById("plan").textContent = planText(settings);
  document.getElementById("typeRow").style.display =
    settings.service === "sparkreceipt" ? "flex" : "none";
}

function planText(s) {
  const svc = SERVICE_NAMES[s.service] || "SparkReceipt";
  const what = s.format === "visible" ? "screenshot" : "full page image";
  const dest =
    {
      autodrop: "then drops it into " + svc + " for you.",
      serviceweb: "then opens " + svc + " so you can drop it in.",
      gmail: "then opens a Gmail draft to your " + svc + " address.",
      mailto: "then opens an email draft to your " + svc + " address.",
      none: "and saves it to Downloads/Receipts."
    }[s.destination] || "";
  return "Saves this page as a " + what + " " + dest;
}

async function renderHistory() {
  const { history } = await chrome.storage.local.get("history");
  const list = Array.isArray(history) ? history : [];
  if (!list.length) return;
  const marks = { ok: "✓", fail: "✕", working: "…", saved: "↓" };
  const box = document.getElementById("historyList");
  box.innerHTML = "";
  list.slice(0, 10).forEach((h) => {
    const row = document.createElement("div");
    row.className = "hrow";
    const mark = document.createElement("span");
    mark.className = "mark " + (h.status || "working");
    mark.textContent = marks[h.status] || "…";
    const site = document.createElement("span");
    site.className = "site";
    site.textContent = h.host || "page";
    const svc = document.createElement("span");
    svc.className = "svc";
    svc.textContent = SERVICE_NAMES[h.service] === "Expensify" ? "Exp" : "Spark";
    row.appendChild(mark);
    row.appendChild(site);
    row.appendChild(svc);
    box.appendChild(row);
  });
}
