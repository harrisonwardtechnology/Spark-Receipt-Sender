// Send to SparkReceipt - runs on app.sparkreceipt.com
// Picks up a freshly captured receipt from the extension, walks SparkReceipt's
// own add-document flow, attaches the file, and confirms it.
// Flow verified against the live app: Add documents -> document type ->
// .file-dropzone input[type=file] -> Confirm.

(async function () {
  let payload = null;
  try {
    payload = await chrome.runtime.sendMessage({ type: "getPendingReceipt" });
  } catch (e) {
    return;
  }
  if (!payload || !payload.b64) return;
  if (payload.service && payload.service !== "sparkreceipt") return;

  let file;
  try {
    const bytes = Uint8Array.from(atob(payload.b64), (c) => c.charCodeAt(0));
    file = new File([bytes], payload.filename || "receipt.pdf", {
      type: payload.mime || "application/pdf"
    });
  } catch (e) {
    return;
  }

  showBanner("Dropping your receipt into SparkReceipt...");

  const start = Date.now();
  let stage = "openMenu"; // openMenu -> pickType -> attach -> confirm
  let attachedAt = 0;

  const timer = setInterval(() => {
    const elapsed = Date.now() - start;

    // Login screen up? Wait for it. The flow restarts after login.
    if (document.querySelector('input[type="password"]')) {
      if (elapsed > 180000) {
        finish(
          "Log in first. Your receipt is saved in Downloads/Receipts."
        );
      } else {
        showBanner("Log in and I will drop the receipt in...");
      }
      return;
    }

    if (elapsed > 60000) {
      finish(
        "Could not finish the drop. Drag the file from Downloads/Receipts instead."
      );
      return;
    }

    try {
      if (stage === "openMenu") {
        if (getInput()) {
          stage = "attach";
          return;
        }
        if (getTypeButton()) {
          stage = "pickType";
          return;
        }
        const add = getAddButton();
        if (add) {
          add.click();
          stage = "pickType";
        }
      } else if (stage === "pickType") {
        if (getInput()) {
          stage = "attach";
          return;
        }
        const type = getTypeButton();
        if (type) {
          type.click();
          stage = "attach";
        }
      } else if (stage === "attach") {
        const input = getInput();
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          attachedAt = Date.now();
          stage = "confirm";
          showBanner("Receipt attached, confirming...");
        }
      } else if (stage === "confirm") {
        // Give the app a moment to register the file before confirming
        if (Date.now() - attachedAt < 900) return;
        const confirm = getConfirmButton();
        if (confirm) {
          confirm.click();
          finish("Receipt dropped in. SparkReceipt is scanning it now.", true);
        } else if (Date.now() - attachedAt > 15000) {
          finish("Receipt attached. Hit Confirm in SparkReceipt to finish.");
        }
      }
    } catch (e) {
      // keep polling until timeout
    }
  }, 400);

  function getAddButton() {
    const exact = document.querySelector("button.sidebar-add-document-cta");
    if (exact) return exact;
    return (
      Array.from(document.querySelectorAll("button")).find((b) => {
        const t = (b.textContent || "").trim();
        return /add documents?/i.test(t) && t.length < 30;
      }) || null
    );
  }

  function getTypeButton() {
    const options = Array.from(
      document.querySelectorAll("button.add-document-type-option")
    );
    if (!options.length) return null;
    const wanted = {
      expense: /expense or receipt/i,
      income: /income or invoice/i,
      statement: /bank or credit card statement/i,
      other: /other document/i
    }[payload.sparkType || "expense"] || /expense or receipt/i;
    return (
      options.find((o) => wanted.test(o.textContent || "")) ||
      options.find((o) => /expense or receipt/i.test(o.textContent || "")) ||
      options[0]
    );
  }

  function getInput() {
    return (
      document.querySelector('.file-dropzone input[type="file"]') ||
      document.querySelector('input[type="file"]')
    );
  }

  function getConfirmButton() {
    return (
      Array.from(document.querySelectorAll("button")).find((b) =>
        /^confirm$/i.test((b.textContent || "").trim())
      ) || null
    );
  }

  function finish(message, success) {
    clearInterval(timer);
    try {
      chrome.runtime.sendMessage({ type: "receiptConsumed" }).catch(() => {});
    } catch (e) {
      // extension context gone, nothing to do
    }
    showBanner(message, true);
    if (success && (payload.closeTab || payload.deleteLocal)) {
      settleThenTidy();
    } else {
      sendFinished(!!success);
    }
  }

  function sendFinished(ok) {
    try {
      chrome.runtime
        .sendMessage({ type: "dropFinished", success: ok })
        .catch(() => {});
    } catch (e) {
      // extension context gone, nothing to do
    }
  }

  // Wait until the upload has had time to finish, then let the extension
  // close the tab and/or delete the backup file per settings.
  function settleThenTidy() {
    const t0 = Date.now();
    let modalGoneAt = 0;
    const iv = setInterval(() => {
      const modalGone = !document.querySelector(".add-document-modal-body");
      if (modalGone && !modalGoneAt) modalGoneAt = Date.now();
      const settled = modalGoneAt && Date.now() - modalGoneAt > 6000;
      const cappedOut = Date.now() - t0 > 45000;
      if (settled || cappedOut) {
        clearInterval(iv);
        if (payload.closeTab) {
          showBanner("Upload done. Closing this tab...", true);
        } else {
          showBanner("Upload done. Cleaning up the backup file...", true);
        }
        sendFinished(true);
      }
    }, 500);
  }

  function showBanner(text, final) {
    let el = document.getElementById("spark-sender-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "spark-sender-banner";
      el.style.cssText =
        "position:fixed;bottom:20px;right:20px;z-index:2147483647;" +
        "max-width:300px;padding:12px 36px 12px 14px;border-radius:10px;" +
        "background:#0d9488;color:#ffffff;font:13px/1.45 -apple-system," +
        "BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "box-shadow:0 4px 14px rgba(0,0,0,0.25);";
      const close = document.createElement("span");
      close.textContent = "×";
      close.style.cssText =
        "position:absolute;top:6px;right:12px;cursor:pointer;" +
        "font-size:16px;opacity:0.85;";
      close.addEventListener("click", () => el.remove());
      const msg = document.createElement("span");
      msg.id = "spark-sender-banner-text";
      el.appendChild(msg);
      el.appendChild(close);
      document.documentElement.appendChild(el);
    }
    const msgEl = document.getElementById("spark-sender-banner-text");
    if (msgEl) msgEl.textContent = text;
    if (final) {
      setTimeout(() => {
        const gone = document.getElementById("spark-sender-banner");
        if (gone) gone.remove();
      }, 12000);
    }
  }
})();
