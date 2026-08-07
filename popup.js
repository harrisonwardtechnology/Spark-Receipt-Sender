const DEFAULTS = {
  service: "sparkreceipt",
  sparkEmail: "",
  destination: "autodrop",
  format: "pdf",
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

  refresh(settings);

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

  document.getElementById("optionsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

function refresh(settings) {
  document.getElementById("plan").textContent = planText(settings);
  const needsEmail =
    (settings.destination === "gmail" || settings.destination === "mailto") &&
    settings.service === "sparkreceipt" &&
    !settings.sparkEmail;
  document.getElementById("emailHint").style.display = needsEmail
    ? "block"
    : "none";
}

function planText(s) {
  const svc = SERVICE_NAMES[s.service] || "SparkReceipt";
  const what = s.format === "pdf" ? "full page PDF" : "screenshot";
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
