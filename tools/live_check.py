#!/usr/bin/env python3
"""Check that SparkReceipt and Expensify still have the buttons the extension uses.

    python3 tools/live_check.py --profile C:\\ReceiptSenderCheck --headed   # first run: sign in by hand
    python3 tools/live_check.py --profile C:\\ReceiptSenderCheck            # monthly runs
    python3 tools/live_check.py --dry-run                                  # local stand-in pages only

What it does: opens Chromium with the real extension loaded and your own
check profile, goes to app.sparkreceipt.com and new.expensify.com, and walks
only the safe first steps of each upload flow:

  SparkReceipt: Add documents, the document type choices, the upload field,
                then closes the window.
  Expensify:    Scan receipt, the drag and drop zone, then closes the panel.

At each step it looks for the same buttons and fields the extension looks for
(listed in tools/live_selectors.json, which a test keeps in step with
sparkdrop.js and expensifydrop.js), takes a screenshot, and writes a plain
English pass or fail report to a folder.

What it never does: upload anything. No file is ever handed to either site,
nothing is dropped, and it never clicks Confirm, Create expense, or any other
button that finishes an upload. It also never signs in for you or touches
sign-in details. Sign in yourself, once, in the browser window it opens with
--headed. The sign-in is then kept in the --profile folder.

Use a profile folder just for this check, not your everyday Chrome profile.

Needs Python Playwright with Chromium (pip install playwright, then
playwright install chromium). See docs/live-check.md for step by step setup
on Windows.
"""

import argparse
import datetime
import html
import json
import os
import pathlib
import shutil
import sys
import tempfile
import time

sys.dont_write_bytecode = True  # Chrome won't load a folder with __pycache__ in it

from playwright.sync_api import sync_playwright  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import package  # noqa: E402

LIST = json.loads((HERE / "live_selectors.json").read_text(encoding="utf-8"))
SITES = ["sparkreceipt", "expensify"]

PASS, WARN, FAIL, NOTE = "PASS", "LOOK", "FAIL", "NOTE"

# Runs in the page. Finds things the way the content scripts do, and clicks
# only through safeClick, which refuses anything in the site's neverClick list.
PAGE_JS = r"""
(args) => {
  const site = args.site;
  const S = site.selectors;
  const toRe = (lit) => {
    const m = lit.match(/^\/(.*)\/([a-z]*)$/);
    return new RegExp(m[1], m[2]);
  };
  const T = {};
  Object.keys(site.text).forEach((k) => (T[k] = toRe(site.text[k])));
  const textOf = (el) =>
    ((el.getAttribute && el.getAttribute("aria-label")) || el.textContent || "").trim();
  const inMenu = (el) =>
    el.getAttribute("role") === "menuitem" || !!(el.closest && el.closest('[role="menu"]'));
  const forbidden = (el) => site.neverClick.some((k) => T[k].test(textOf(el)));
  const safeClick = (el, menuOnly) => {
    if (!el) return { clicked: false, why: "not found" };
    if (forbidden(el) && !(menuOnly && inMenu(el))) {
      return { clicked: false, why: "refused: it would finish an upload (" + textOf(el) + ")" };
    }
    el.click();
    return { clicked: true, text: textOf(el).slice(0, 60) };
  };
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));

  // SparkReceipt, as in sparkdrop.js
  const sparkAdd = () => {
    const exact = q(S.addButton);
    if (exact) return { el: exact, how: "exact" };
    const byText = qa(S.anyButton).find((b) => {
      const t = (b.textContent || "").trim();
      return T.addButton.test(t) && t.length < 30;
    });
    return byText ? { el: byText, how: "text" } : { el: null, how: null };
  };
  const sparkInput = () =>
    q(S.fileInput) ? "main" : q(S.fileInputBackup) ? "backup" : null;
  const sparkTypes = () => qa(S.typeOption);

  // Expensify, as in expensifydrop.js
  const expZone = () => {
    const textEl = qa(S.textHolders).find(
      (e) => e.childElementCount === 0 && T.dropZone.test(e.textContent || "")
    );
    if (!textEl) return null;
    let zone = textEl;
    for (let i = 0; i < 4 && zone.parentElement; i++) zone = zone.parentElement;
    return zone;
  };
  const expMenuItem = () =>
    qa(S.clickables).find((e) => {
      const t = textOf(e);
      return T.menuItem.test(t) || (T.menuItemLoose.test(t) && t.length < 40);
    });

  switch (args.op) {
    case "signedOut":
      return !!((S.signInHint && q(S.signInHint)) || q(S.signInField));
    case "sparkAdd": {
      const hit = sparkAdd();
      const out = { how: hit.how };
      if (hit.el && args.click) out.click = safeClick(hit.el);
      return out;
    }
    case "sparkTypes": {
      const opts = sparkTypes();
      const names = ["typeExpense", "typeIncome", "typeStatement", "typeOther"];
      return {
        count: opts.length,
        found: names.filter((n) => opts.some((o) => T[n].test(o.textContent || ""))),
        missing: names.filter((n) => !opts.some((o) => T[n].test(o.textContent || "")))
      };
    }
    case "sparkPickType": {
      const opts = sparkTypes();
      const pick = opts.find((o) => T.typeExpense.test(o.textContent || "")) || opts[0];
      return safeClick(pick);
    }
    case "sparkInput":
      return sparkInput();
    case "sparkConfirm":
      return qa(S.anyButton).some((b) => T.confirmButton.test((b.textContent || "").trim()));
    case "sparkModal":
      return !!q(S.modal);
    case "sparkClose": {
      const body = q(S.modal);
      const scope = (body && (body.closest('[role="dialog"]') || (body.parentElement && body.parentElement.parentElement))) || document;
      const near = Array.from(scope.querySelectorAll('[aria-label*="close" i], button')).find((el) => {
        if (el.closest("#spark-sender-banner")) return false; // the extension's own note
        const t = textOf(el);
        return /^(close|cancel|\u00d7|x)$/i.test(t) || /close/i.test(el.getAttribute("aria-label") || "");
      });
      return safeClick(near);
    }
    case "expScan": {
      const scan = q(S.scanButton);
      if (scan) return { how: "scan", click: args.click ? safeClick(scan) : null };
      const fab = q(S.actionButton);
      if (fab) return { how: "menu", click: args.click ? safeClick(fab) : null };
      return { how: null };
    }
    case "expMenu":
      return safeClick(expMenuItem(), true);
    case "expZone":
      return !!expZone();
    case "expScanTab":
      return safeClick(qa(S.clickables).find((e) => T.scanTab.test(textOf(e))));
    case "expSubmit":
      return qa(S.buttons).some(
        (e) => site.neverClick.some((k) => T[k].test(textOf(e))) && textOf(e).length < 35
      );
    case "events":
      return window.__events || null;
  }
  return null;
}
"""


class Run:
    """Collects steps, screenshots and the final report."""

    def __init__(self, out, dry_run):
        self.out = out
        self.dry_run = dry_run
        self.steps = []
        self.version = "?"
        self.pages = {}  # the page each site's steps are screenshotted from

    def step(self, site, title, status, detail, page=None):
        shot = None
        page = page or self.pages.get(site)
        if page is not None:
            n = len([s for s in self.steps if s["site"] == site]) + 1
            shot = "%s-%02d.png" % (site, n)
            try:
                page.screenshot(path=str(self.out / shot))
            except Exception:
                shot = None
        self.steps.append(dict(site=site, title=title, status=status, detail=detail, shot=shot))
        print("  %-4s  %s. %s" % (status, title, detail))
        return status != FAIL

    def failed(self):
        return any(s["status"] == FAIL for s in self.steps)

    def write(self):
        when = datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p").replace(" 0", " ")
        fails = sum(1 for s in self.steps if s["status"] == FAIL)
        looks = sum(1 for s in self.steps if s["status"] == WARN)
        if fails:
            verdict = ("%d check%s failed. The extension may miss on that site until it's updated. "
                       "The backup file in Downloads/Receipts still works." % (fails, "" if fails == 1 else "s"))
        elif looks:
            verdict = ("Everything the extension needs is there, but %d check%s used a backup way to find "
                       "something. Worth a look." % (looks, "" if looks == 1 else "s"))
        else:
            verdict = "Everything the extension needs is still there."
        mode = "Dry run against local stand-in pages." if self.dry_run else "Live sites."
        lines = ["Receipt Sender Live Check", "", "Run on %s. %s" % (when, mode),
                 "Extension version %s. Nothing was uploaded." % self.version, "", verdict, ""]
        for site in ["setup"] + SITES:
            rows = [s for s in self.steps if s["site"] == site]
            if not rows:
                continue
            name = "Setup" if site == "setup" else LIST[site]["name"]
            bad = any(r["status"] == FAIL for r in rows)
            lines.append("%s: %s" % (name, "needs attention" if bad else "OK"))
            for r in rows:
                lines.append("  %-4s  %s. %s%s" % (r["status"], r["title"], r["detail"],
                                                   "  [%s]" % r["shot"] if r["shot"] else ""))
            lines.append("")
        lines.append("PASS means found. LOOK means found a backup way. NOTE is for your information. "
                     "FAIL means the extension won't find it.")
        (self.out / "report.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

        rows = []
        for s in self.steps:
            img = ('<a href="%s"><img src="%s" alt="Screenshot of this step"></a>' % (s["shot"], s["shot"])
                   if s["shot"] else "")
            site = "Setup" if s["site"] == "setup" else LIST[s["site"]]["name"]
            rows.append('<tr class="%s"><td>%s</td><td>%s</td><td><strong>%s</strong><br>%s</td><td>%s</td></tr>'
                        % (s["status"].lower(), s["status"], html.escape(site), html.escape(s["title"]),
                           html.escape(s["detail"]), img))
        page = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Receipt Sender Live Check</title><style>
body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 24px; color: #1b1f1e; }
table { border-collapse: collapse; width: 100%%; } td { border-top: 1px solid #ccd6d4; padding: 8px; vertical-align: top; }
td:first-child { font-weight: 700; } tr.fail td:first-child { color: #b3261e; } tr.pass td:first-child { color: #18703a; }
tr.look td:first-child { color: #8a5300; } img { width: 320px; border: 1px solid #ccd6d4; }
</style></head><body><h1>Receipt Sender Live Check</h1><p>%s</p><p><strong>%s</strong></p><table>%s</table></body></html>
""" % (html.escape("Run on %s. %s Extension version %s. Nothing was uploaded." % (when, mode, self.version)),
       html.escape(verdict), "".join(rows))
        (self.out / "report.html").write_text(page, encoding="utf-8")
        print("\n" + verdict)
        print("Report and screenshots: %s" % self.out)


def call(page, site, op, **extra):
    return page.evaluate(PAGE_JS, dict(site=LIST[site], op=op, **extra))


def wait_for(fn, seconds, every=0.5):
    """Ask fn() until it gives something truthy or time runs out."""
    end = time.time() + seconds
    while True:
        try:
            got = fn()
        except Exception:
            got = None  # the page is busy navigating
        if got or time.time() >= end:
            return got
        time.sleep(every)


def open_site(run, ctx, site, args):
    """Open the site and make sure it's signed in. Returns the page or None."""
    name, url = LIST[site]["name"], LIST[site]["url"]
    page = ctx.new_page()
    run.pages[site] = page
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
    except Exception as e:
        run.step(site, "Open " + name, FAIL, "The page didn't load (%s)." % str(e).splitlines()[0])
        return None
    first = "sparkAdd" if site == "sparkreceipt" else "expScan"

    def ready():
        if call(page, site, "signedOut"):
            return "signed out"
        hit = call(page, site, first)
        return "ready" if hit and hit.get("how") else None

    state = wait_for(ready, 45)
    if state == "signed out" and args.headed and args.sign_in_wait > 0:
        print("  Sign in to %s in the browser window. I'll wait up to %d minutes."
              % (name, args.sign_in_wait // 60))
        state = wait_for(lambda: ready() == "ready" and "ready", args.sign_in_wait, every=2)
        if state:
            page.wait_for_timeout(3000)
    if state == "signed out" or (state is None and call(page, site, "signedOut")):
        run.step(site, "Open %s, Signed In" % name, FAIL,
                 "This profile isn't signed in. Run once with --headed and sign in by hand.", page)
        return None
    if not state:
        run.step(site, "Open %s, Signed In" % name, FAIL,
                 "The page loaded but never showed the screen the extension starts from.", page)
        return None
    run.step(site, "Open %s, Signed In" % name, PASS, "The app is open and signed in.", page)
    return page


def check_spark(run, ctx, args):
    site = "sparkreceipt"
    page = open_site(run, ctx, site, args)
    if not page:
        return
    add = call(page, site, "sparkAdd", click=True)
    if not add["how"]:
        run.step(site, "Find Add Documents", FAIL, "The Add documents button is gone.", page)
        return
    if add["how"] == "exact":
        run.step(site, "Find Add Documents", PASS, "Found by its usual class name, and opened.")
    else:
        run.step(site, "Find Add Documents", WARN,
                 "The usual class name is gone, but the button text still matches, so the extension "
                 "will still find it.")
    if not add.get("click", {}).get("clicked"):
        run.step(site, "Open Add Documents", FAIL, "Couldn't click it: %s." % add.get("click", {}).get("why"), page)
        return

    got = wait_for(lambda: call(page, site, "sparkInput") or (call(page, site, "sparkTypes")["count"] and "types"), 15)
    if got == "types":
        types = call(page, site, "sparkTypes")
        if types["missing"]:
            run.step(site, "Find the Document Types", WARN,
                     "Found %d choices, but not these: %s. Grabs set to those types will use the first "
                     "choice instead." % (types["count"], ", ".join(types["missing"])), page)
        else:
            run.step(site, "Find the Document Types", PASS,
                     "All four choices are there (expense, income, statement, other).", page)
        pick = call(page, site, "sparkPickType")
        if not pick.get("clicked"):
            run.step(site, "Pick Expense or Receipt", FAIL, "Couldn't click it: %s." % pick.get("why"))
            return
        got = wait_for(lambda: call(page, site, "sparkInput"), 15)
    elif not got:
        run.step(site, "Find the Document Types", FAIL, "No document type choices showed up.", page)
        close_spark(run, page, site)
        return

    if got == "main":
        run.step(site, "Find the Upload Field", PASS, "The drop zone's file field is there. Nothing was attached.", page)
    elif got == "backup":
        run.step(site, "Find the Upload Field", WARN,
                 "The drop zone's class name changed, but there's a file field in the add document "
                 "window, which the extension falls back to. Nothing was attached.", page)
    else:
        run.step(site, "Find the Upload Field", FAIL, "No file field showed up after picking a type.", page)
        close_spark(run, page, site)
        return

    if call(page, site, "sparkConfirm"):
        run.step(site, "See the Confirm Button", PASS, "It's there. Not clicked.")
    else:
        run.step(site, "See the Confirm Button", NOTE,
                 "Not showing yet. It may only appear once a file is attached, which this check never "
                 "does. Not clicked.")
    if run.dry_run:
        stand_in_untouched(run, page, site, ["click:add", "click:type:Expense or receipt"])
    close_spark(run, page, site)


def close_spark(run, page, site):
    page.keyboard.press("Escape")
    page.wait_for_timeout(1000)
    how = "with the Escape key"
    if call(page, site, "sparkModal"):
        click = call(page, site, "sparkClose")
        page.wait_for_timeout(1000)
        how = "with its close button"
        if not click.get("clicked") or call(page, site, "sparkModal"):
            page.goto(LIST[site]["url"], wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            how = "by reloading the page"
    if call(page, site, "sparkModal"):
        run.step(site, "Close the Window", FAIL, "The add document window is still open. Close it by hand.", page)
    else:
        run.step(site, "Close the Window", PASS, "Closed %s. Nothing was saved." % how, page)


def check_expensify(run, ctx, args):
    site = "expensify"
    page = open_site(run, ctx, site, args)
    if not page:
        return
    scan = call(page, site, "expScan", click=True)
    if not (scan.get("click") or {}).get("clicked"):
        run.step(site, "Open Scan Receipt", FAIL, "Couldn't click it: %s." % (scan.get("click") or {}).get("why"), page)
        return
    if scan["how"] == "scan":
        run.step(site, "Find Scan Receipt", PASS, "The Scan receipt button is there, and opened.")
    else:
        run.step(site, "Find Scan Receipt", WARN,
                 "No Scan receipt button, so it used the + menu the extension falls back to.")
        item = wait_for(lambda: (lambda r: r if r.get("clicked") else None)(call(page, site, "expMenu")), 10)
        if not item:
            run.step(site, "Pick From the + Menu", FAIL, "No create expense item in the menu.", page)
            close_expensify(run, page, site)
            return
        run.step(site, "Pick From the + Menu", PASS, "Picked \"%s\"." % item.get("text"))

    zone = wait_for(lambda: call(page, site, "expZone"), 15)
    if not zone:
        tab = call(page, site, "expScanTab")
        if tab.get("clicked"):
            zone = wait_for(lambda: call(page, site, "expZone"), 10)
    if zone:
        run.step(site, "Find the Drop Zone", PASS, "The \"drag and drop them here\" zone is there. Nothing was dropped.", page)
    else:
        run.step(site, "Find the Drop Zone", FAIL, "The drag and drop zone never showed up.", page)
        close_expensify(run, page, site)
        return
    if call(page, site, "expSubmit"):
        run.step(site, "See Create Expense", NOTE, "A create button is already showing. Not clicked.")
    else:
        run.step(site, "See Create Expense", NOTE,
                 "Only shows up after a file is dropped, which this check never does, so it can't be "
                 "checked here.")
    if run.dry_run:
        stand_in_untouched(run, page, site, ["click:scan"])
    close_expensify(run, page, site)


def close_expensify(run, page, site):
    page.keyboard.press("Escape")
    page.wait_for_timeout(1500)
    how = "with the Escape key"
    if "/create" in page.url:
        page.go_back()
        page.wait_for_timeout(1500)
        how = "by going back"
    if "/create" in page.url:
        page.goto(LIST[site]["url"], wait_until="domcontentloaded")
        page.wait_for_timeout(2000)
        how = "by going to the home screen"
    if "/create" in page.url:
        run.step(site, "Close the Scan Panel", FAIL, "The scan panel is still open. Close it by hand.", page)
    else:
        run.step(site, "Close the Scan Panel", PASS, "Closed %s. No expense was made." % how, page)


def stand_in_untouched(run, page, site, expected):
    """Dry run only: the stand-in page notes every click and file it gets."""
    events = call(page, site, "events")
    if events == expected:
        run.step(site, "Nothing Attached or Confirmed", PASS,
                 "The stand-in page saw only %s." % ", ".join(events))
    else:
        run.step(site, "Nothing Attached or Confirmed", FAIL,
                 "The stand-in page saw %s, expected only %s." % (events, expected))


def stage_extension(folder):
    """Copy just the runtime files (the same ones the store zip gets)."""
    if folder.exists():
        shutil.rmtree(folder)
    for name in package.runtime_files():
        target = folder / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target)
    return folder


def main():
    parser = argparse.ArgumentParser(
        description="Check, without uploading anything, that SparkReceipt and Expensify still have the "
                    "buttons and fields the extension uses.")
    parser.add_argument("--profile", help="a folder for this check's own browser profile, where you stay "
                                          "signed in (made if it doesn't exist)")
    parser.add_argument("--headed", action="store_true", help="show the browser window (use this to sign in)")
    parser.add_argument("--sign-in-wait", type=int, default=300,
                        help="with --headed, seconds to wait for you to sign in (default 300)")
    parser.add_argument("--out", help="folder for the report and screenshots (default live-check-results/<time>)")
    parser.add_argument("--only", choices=SITES, help="check one site")
    parser.add_argument("--dry-run", action="store_true",
                        help="use the local stand-in pages from tools/mock_flow_check.py instead of the live sites")
    args = parser.parse_args()
    if not args.dry_run and not args.profile:
        parser.error("--profile is required (a folder just for this check). Use --dry-run to test the script.")

    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    out = pathlib.Path(args.out) if args.out else ROOT / "live-check-results" / stamp
    out.mkdir(parents=True, exist_ok=True)
    run = Run(out, args.dry_run)
    temp = None
    launch = []
    if args.dry_run:
        import mock_flow_check  # the same stand-in pages the flow check uses
        temp = pathlib.Path(tempfile.mkdtemp(prefix="rs-live-"))
        port = mock_flow_check.start_server(str(temp))
        profile = temp / "profile"
        launch = ["--no-proxy-server", "--ignore-certificate-errors",
                  "--host-resolver-rules=MAP *:443 127.0.0.1:%d" % port]
    else:
        profile = pathlib.Path(args.profile).expanduser().resolve()
        profile.mkdir(parents=True, exist_ok=True)
    ext = stage_extension(profile / "receipt-sender-extension")

    print("Receipt Sender live check%s. Nothing will be uploaded.\n" % (" (dry run)" if args.dry_run else ""))
    code = 0
    try:
        with sync_playwright() as p:
            try:
                ctx = p.chromium.launch_persistent_context(
                    str(profile), channel="chromium", headless=not args.headed,
                    viewport={"width": 1280, "height": 800},
                    args=["--disable-extensions-except=" + str(ext), "--load-extension=" + str(ext)] + launch)
            except Exception as e:
                print("Couldn't start Chromium: %s" % str(e).splitlines()[0])
                print("If the profile folder is open in another window, close it first.")
                return 2
            try:
                sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=30000)
                run.version = sw.evaluate("() => chrome.runtime.getManifest().version")
                waiting = sw.evaluate("async () => { const s = await chrome.storage.local.get(['queue', 'inFlight']);"
                                      " return (s.queue || []).length + [].concat(s.inFlight || []).length; }")
                if waiting:
                    run.step("setup", "Load the Extension", FAIL,
                             "This profile has %d receipt(s) waiting to upload, so the check stopped before "
                             "opening either site. Use a profile just for this check." % waiting)
                else:
                    run.step("setup", "Load the Extension", PASS,
                             "Version %s loaded with nothing waiting to upload." % run.version)
                time.sleep(1)
                for pg in list(ctx.pages):
                    if pg.url.startswith("chrome-extension://"):
                        pg.close()  # the settings page that opens on first install
                for site in SITES:
                    if waiting or (args.only and site != args.only):
                        continue
                    print("\n%s" % LIST[site]["name"])
                    try:
                        (check_spark if site == "sparkreceipt" else check_expensify)(run, ctx, args)
                    except Exception as e:
                        run.step(site, "Finish the Check", FAIL, "Stopped early: %s" % str(e).splitlines()[0])
            finally:
                ctx.close()
        run.write()
        code = 1 if run.failed() else 0
    finally:
        if temp:
            shutil.rmtree(temp, ignore_errors=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
