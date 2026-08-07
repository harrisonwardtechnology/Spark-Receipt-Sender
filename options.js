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

  document.getElementById("save").addEventListener("click", async () => {
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
    status.textContent = "Saved";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  });
});
