const DEFAULTS = {
  sparkEmail: "",
  destination: "autodrop",
  format: "pdf",
  reveal: false,
  closeTab: false,
  deleteLocal: false,
  silent: false
};

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };

  document.getElementById("pageTitle").textContent =
    tab && tab.title ? tab.title : "This page";
  document.getElementById("plan").textContent = planText(settings);

  if (
    (settings.destination === "gmail" || settings.destination === "mailto") &&
    !settings.sparkEmail
  ) {
    document.getElementById("emailHint").style.display = "block";
  }

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

function planText(s) {
  const what = s.format === "pdf" ? "full page PDF" : "screenshot";
  const dest =
    {
      autodrop: "then drops it into SparkReceipt for you.",
      sparkweb: "then opens SparkReceipt so you can drop it in.",
      gmail: "then opens a Gmail draft to your SparkReceipt address.",
      mailto: "then opens an email draft to your SparkReceipt address.",
      none: "and saves it to Downloads/SparkReceipt."
    }[s.destination] || "";
  return "Saves this page as a " + what + " " + dest;
}
