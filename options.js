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

// The page shows the newest steps. Export always includes everything kept.
const LOG_ROWS_SHOWN = 100;

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const s = { ...DEFAULTS, ...stored };
  if (s.destination === "sparkweb") s.destination = "serviceweb";
  if (s.format === "pdf") s.format = "full";
  if (s.format === "png") s.format = "visible";

  const serviceInput = document.querySelector(
    'input[name="service"][value="' + s.service + '"]'
  );
  if (serviceInput) serviceInput.checked = true;
  document.getElementById("sparkEmail").value = s.sparkEmail;
  const destInput = document.querySelector(
    'input[name="destination"][value="' + s.destination + '"]'
  );
  if (destInput) destInput.checked = true;
  const formatInput = document.querySelector(
    'input[name="format"][value="' + s.format + '"]'
  );
  if (formatInput) formatInput.checked = true;
  document.getElementById("reveal").checked = !!s.reveal;
  document.getElementById("closeTab").checked = !!s.closeTab;
  document.getElementById("deleteLocal").checked = !!s.deleteLocal;
  document.getElementById("silent").checked = !!s.silent;

  document
    .getElementById("settingsForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const service = document.querySelector('input[name="service"]:checked');
      const destination = document.querySelector(
        'input[name="destination"]:checked'
      );
      const format = document.querySelector('input[name="format"]:checked');
      const { sparkType } = await chrome.storage.sync.get({
        sparkType: DEFAULTS.sparkType
      });
      const settings = {
        service: service ? service.value : DEFAULTS.service,
        sparkType: sparkType,
        sparkEmail: document.getElementById("sparkEmail").value.trim(),
        destination: destination ? destination.value : DEFAULTS.destination,
        format: format ? format.value : DEFAULTS.format,
        reveal: document.getElementById("reveal").checked,
        closeTab: document.getElementById("closeTab").checked,
        deleteLocal: document.getElementById("deleteLocal").checked,
        silent: document.getElementById("silent").checked
      };
      await chrome.storage.sync.set(settings);
      const status = document.getElementById("status");
      status.textContent = savedText(settings);
      setTimeout(() => {
        status.textContent = "";
      }, needsEmail(settings) ? 6000 : 2000);
    });

  try {
    document.getElementById("version").textContent =
      "Version " + chrome.runtime.getManifest().version;
  } catch (e) {
    // not critical
  }

  setUpActivityLog();
});

// Email drafts to SparkReceipt need the forwarding address
function needsEmail(settings) {
  return (
    settings.service === "sparkreceipt" &&
    (settings.destination === "gmail" || settings.destination === "mailto") &&
    !settings.sparkEmail
  );
}

function savedText(settings) {
  return needsEmail(settings)
    ? "Saved. Add your forwarding email so drafts know where to go."
    : "Saved";
}

// ---------- Activity Log ----------

function setUpActivityLog() {
  renderLog();

  // Keep the list fresh while grabs run
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[ActivityLog.KEY]) renderLog();
  });

  document.getElementById("exportCsv").addEventListener("click", async () => {
    const entries = await ActivityLog.read();
    saveFile(ActivityLog.toCsv(entries), "text/csv", "csv");
    announce("Exported " + countText(entries.length) + " as CSV.");
  });

  document.getElementById("exportJson").addEventListener("click", async () => {
    const entries = await ActivityLog.read();
    let version = "";
    try {
      version = chrome.runtime.getManifest().version;
    } catch (e) {
      // not critical
    }
    saveFile(ActivityLog.toJson(entries, version), "application/json", "json");
    announce("Exported " + countText(entries.length) + " as JSON.");
  });

  document.getElementById("clearLog").addEventListener("click", async () => {
    if (!window.confirm("Clear the Activity Log? You can't undo this.")) return;
    let cleared = false;
    try {
      // The service worker is the one writer, so it does the clearing
      const res = await chrome.runtime.sendMessage({ type: "clearActivityLog" });
      cleared = !!(res && res.ok);
    } catch (e) {
      cleared = false;
    }
    if (!cleared) await ActivityLog.clear();
    await renderLog();
    announce("Log cleared.");
  });
}

function countText(n) {
  return n === 1 ? "1 step" : n + " steps";
}

function announce(text) {
  document.getElementById("logCount").textContent = text;
}

async function renderLog() {
  const entries = ActivityLog.withSites(await ActivityLog.read());
  const table = document.getElementById("logTable");
  const empty = document.getElementById("logEmpty");
  const body = document.getElementById("logRows");
  const hasRows = entries.length > 0;

  table.hidden = !hasRows;
  empty.hidden = hasRows;
  document.getElementById("exportCsv").disabled = !hasRows;
  document.getElementById("exportJson").disabled = !hasRows;
  document.getElementById("clearLog").disabled = !hasRows;

  const shown = entries.slice(-LOG_ROWS_SHOWN).reverse();
  body.replaceChildren(...shown.map(logRow));

  if (!hasRows) {
    announce("");
  } else if (entries.length > shown.length) {
    announce(
      "Showing the newest " +
        shown.length +
        " of " +
        countText(entries.length) +
        ". Export to get them all."
    );
  } else {
    announce(countText(entries.length) + ", newest first.");
  }
}

function logRow(entry) {
  const row = document.createElement("tr");
  row.appendChild(cell("time", timeText(entry.ts)));
  row.appendChild(
    cell("step " + ActivityLog.tone(entry.step), ActivityLog.label(entry.step))
  );
  const site = cell("site", entry.host || "");
  const service = ActivityLog.serviceName(entry.service);
  if (service) {
    const small = document.createElement("small");
    small.textContent = service;
    site.appendChild(small);
  }
  row.appendChild(site);
  row.appendChild(cell("detail", entry.detail || ""));
  return row;
}

function cell(className, text) {
  const td = document.createElement("td");
  td.className = className;
  td.textContent = text;
  return td;
}

function timeText(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (e) {
    return "";
  }
}

// Hand the file to the browser as a normal download. Nothing is uploaded.
function saveFile(text, mime, ext) {
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "receipt-sender-activity-" + stamp + "." + ext;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
