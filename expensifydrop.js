// Receipt Sender - runs on new.expensify.com
// Picks up a freshly captured receipt from the extension, opens New Expensify's
// scan flow, drops the file on their upload zone, and creates the expense.
// Flow verified against the live app: Scan receipt button -> drop on the
// "drag and drop them here" zone -> Create expense.
// Note: Expensify rejects attachments under 240 bytes.

(async function () {
  let payload = null;
  try {
    payload = await chrome.runtime.sendMessage({
      type: "getPendingReceipt",
      service: "expensify"
    });
  } catch (e) {
    return;
  }
  if (!payload || !payload.b64) return;
  if (payload.service !== "expensify") return;

  let file;
  try {
    const bytes = Uint8Array.from(atob(payload.b64), (c) => c.charCodeAt(0));
    file = new File([bytes], payload.filename || "receipt.pdf", {
      type: payload.mime || "application/pdf"
    });
  } catch (e) {
    return;
  }

  showBanner("Dropping your receipt into Expensify...");
  logStep("receipt_picked_up");

  const start = Date.now();
  let stage = "entry"; // entry -> menu -> attach -> submit
  let attachedAt = 0;
  let signInLogged = false; // Activity Log only

  const timer = setInterval(() => {
    const elapsed = Date.now() - start;

    // Login screen up? Wait for it. The flow restarts after login.
    if (isLoginScreen()) {
      if (elapsed > 180000) {
        finish("Sign in first. Your receipt is saved in Downloads/Receipts.");
      } else {
        showBanner("Sign in and I'll drop the receipt in...");
        if (!signInLogged) {
          signInLogged = true;
          logStep("sign_in_needed");
        }
      }
      return;
    }

    if (elapsed > 75000) {
      finish(
        "Couldn't finish the drop. Drag the file in from Downloads/Receipts instead."
      );
      return;
    }

    try {
      if (stage === "entry") {
        if (getDropZone()) {
          stage = "attach";
          return;
        }
        const scanBtn = document.querySelector(
          '[data-testid="floating-receipt-button"]'
        );
        if (scanBtn) {
          scanBtn.click();
          stage = "attach";
          return;
        }
        // Fallback: FAB menu route
        const fab = document.querySelector(
          '[data-testid="floating-action-button"]'
        );
        if (fab) {
          fab.click();
          stage = "menu";
        }
      } else if (stage === "menu") {
        if (getDropZone()) {
          stage = "attach";
          return;
        }
        const item = clickables().find((e) => {
          const t = textOf(e);
          return (
            /^(create expense|submit expense|track expense|scan receipt)$/i.test(
              t
            ) || /create expense/i.test(t) && t.length < 40
          );
        });
        if (item) {
          item.click();
          stage = "attach";
        }
      } else if (stage === "attach") {
        // A "Scan" tab may need selecting first
        const zone = getDropZone();
        if (!zone) {
          const scanTab = clickables().find((e) => /^scan$/i.test(textOf(e)));
          if (scanTab) scanTab.click();
          return;
        }
        const dt = new DataTransfer();
        dt.items.add(file);
        ["dragenter", "dragover", "drop"].forEach((type) => {
          zone.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            })
          );
        });
        attachedAt = Date.now();
        stage = "submit";
        showBanner("Receipt attached, creating the expense...");
        logStep("file_attached");
      } else if (stage === "submit") {
        // Give the app a moment to build the confirmation screen
        if (Date.now() - attachedAt < 1200) return;
        const submit = getSubmitButton();
        if (submit) {
          submit.click();
          finish("Receipt dropped in. Expensify is scanning it now.", true);
        } else if (Date.now() - attachedAt > 20000) {
          // No Create button means no proof the expense was made: a miss,
          // so the tab stays open and the backup file is kept.
          finish("Receipt attached. Finish the last step in Expensify yourself.");
        }
      }
    } catch (e) {
      // keep polling until timeout
    }
  }, 400);

  function isLoginScreen() {
    const hint = document.querySelector(
      'input[aria-label*="Phone or email" i], input[placeholder*="Phone or email" i]'
    );
    return !!hint || !!document.querySelector('input[type="password"]');
  }

  function textOf(el) {
    return (
      (el.getAttribute && el.getAttribute("aria-label")) ||
      el.textContent ||
      ""
    ).trim();
  }

  function clickables() {
    return Array.from(
      document.querySelectorAll(
        'button, [role="button"], [role="menuitem"], [role="tab"]'
      )
    );
  }

  function getDropZone() {
    const textEl = Array.from(document.querySelectorAll("div, span")).find(
      (e) =>
        e.childElementCount === 0 &&
        /drag and drop them here/i.test(e.textContent || "")
    );
    if (!textEl) return null;
    let zone = textEl;
    for (let i = 0; i < 4 && zone.parentElement; i++) {
      zone = zone.parentElement;
    }
    return zone;
  }

  function getSubmitButton() {
    const wanted = [
      /^create expense$/i,
      /^submit expense$/i,
      /^track expense$/i,
      /^create \$/i,
      /^submit \$/i
    ];
    const els = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const re of wanted) {
      const hit = els.find((e) => re.test(textOf(e)) && textOf(e).length < 35);
      if (hit) return hit;
    }
    return null;
  }

  // Resolves once the extension has taken the receipt off its queue. The
  // result is only reported after that, so the two messages can't cross.
  let consumed = Promise.resolve();

  function finish(message, success) {
    clearInterval(timer);
    consumed = tell({ type: "receiptConsumed", id: payload.id });
    showBanner(message, true);
    if (success && (payload.closeTab || payload.deleteLocal)) {
      settleThenTidy();
    } else {
      sendFinished(!!success);
    }
    consumed.then(() => logStep("service_note", message));
  }

  // Send a message to the extension. Resolves when it replies, or right away
  // if it can't be reached. Never throws.
  function tell(msg) {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (e) {
      // extension context gone, nothing to do
      return Promise.resolve();
    }
  }

  // Activity Log only: tell the extension about a step. Never waits, never
  // throws, and has no say in the upload itself.
  function logStep(step, note) {
    try {
      chrome.runtime
        .sendMessage({
          type: "logStep",
          step: step,
          grabId: payload.id,
          note: note
        })
        .catch(() => {});
    } catch (e) {
      // extension context gone, nothing to do
    }
  }

  function sendFinished(ok) {
    consumed.then(() =>
      tell({ type: "dropFinished", success: ok, id: payload.id })
    );
  }

  // Wait for the create flow to wrap up, then let the extension tidy up.
  function settleThenTidy() {
    const t0 = Date.now();
    let leftCreateAt = 0;
    const iv = setInterval(() => {
      const outOfCreate = !location.pathname.includes("/create");
      if (outOfCreate && !leftCreateAt) leftCreateAt = Date.now();
      const settled = leftCreateAt && Date.now() - leftCreateAt > 6000;
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
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;bottom:20px;right:20px;z-index:2147483647;" +
        "max-width:300px;padding:12px 36px 12px 14px;border-radius:10px;" +
        "background:#03d47c;color:#002e22;font:13px/1.45 -apple-system," +
        "BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:600;" +
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
