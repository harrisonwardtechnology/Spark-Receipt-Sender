#!/usr/bin/env python3
"""Click through the popup and settings page and check they behave.

    python3 tools/ui_check.py

Needs Python Playwright with Chromium. The pages are opened as plain files
with a stand-in for the chrome.* APIs (tools/chrome_stub.js) that notes every
call, so this checks that each control makes the calls the service worker
expects. It can't check Chrome itself or the live receipt sites.

Options:
    --root DIR     check the pages in another checkout (for comparing versions)
    --trace FILE   also write the list of chrome.* calls each action made
    --trace-only   skip the checks that only apply to this version's pages
"""

import argparse
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
STUB = HERE / "chrome_stub.js"

parser = argparse.ArgumentParser()
parser.add_argument("--root", default=str(HERE.parent))
parser.add_argument("--trace")
parser.add_argument("--trace-only", action="store_true")
args = parser.parse_args()
ROOT = pathlib.Path(args.root).resolve()
MANIFEST = json.loads((ROOT / "manifest.json").read_text())

TAB = {"id": 42, "windowId": 7, "title": "Amazon.com: Order Details",
       "url": "https://www.amazon.com/gp/your-account/order-details"}
HISTORY = [
    {"id": "a", "ts": 3, "host": "microcenter.com", "service": "sparkreceipt", "status": "saved"},
    {"id": "b", "ts": 2, "host": "harborfreight.com", "service": "sparkreceipt", "status": "fail"},
    {"id": "c", "ts": 1, "host": "riders.uber.com", "service": "expensify", "status": "ok"},
]
LOG = [
    {"ts": 1790968325000, "step": "grab_started", "grabId": "a1", "host": "amazon.com",
     "service": "sparkreceipt", "detail": "Page"},
    {"ts": 1790968327000, "step": "file_saved", "grabId": "a1", "detail": "Receipts/a1.jpg"},
    {"ts": 1790968336000, "step": "upload_confirmed", "grabId": "a1", "service": "sparkreceipt"},
]

failures = []
problems = []
trace = {}
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        failures.append(message)


def config(**over):
    base = {"manifest": MANIFEST, "sync": {}, "local": {"history": HISTORY, "activityLog": LOG},
            "tab": TAB, "grantAllSites": True}
    base.update(over)
    return base


def open_page(browser, name, cfg, width=1280, height=800):
    context = browser.new_context(viewport={"width": width, "height": height},
                                  locale="en-US", timezone_id="America/Chicago", accept_downloads=True)
    page = context.new_page()
    page.on("console", lambda m: problems.append("%s console %s: %s" % (name, m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: problems.append("%s page error: %s" % (name, e)))
    page.add_init_script("window.__RS_STUB = %s;" % json.dumps(cfg))
    page.add_init_script(path=str(STUB))
    page.goto((ROOT / name).as_uri())
    page.wait_for_timeout(200)
    return context, page


def calls(page, clear=True):
    """The chrome.* calls made since the last look, without storage reads."""
    out = page.evaluate("window.__calls")
    if clear:
        page.evaluate("window.__calls.length = 0")
    return [c for c in out if not c["api"].endswith(".get")]


def no_sideways_scroll(page, label):
    wide = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    check(not wide, label + " scrolls sideways")


# ---------- popup ----------

def popup_checks(browser):
    context, page = open_page(browser, "popup.html", config(), 320, 600)
    trace["popup load"] = calls(page)
    check(page.text_content("#pageTitle") == TAB["title"], "popup shows the tab title")
    check(page.input_value("#service") == "sparkreceipt", "popup starts on the saved service")
    check(page.is_visible("#typeRow"), "type picker shows for SparkReceipt")

    page.select_option("#service", "expensify")
    page.wait_for_timeout(50)
    trace["popup change service"] = calls(page)
    check(trace["popup change service"] == [{"api": "storage.sync.set", "arg": {"service": "expensify"}}],
          "changing the service saves just the service")
    check(not page.is_visible("#typeRow"), "type picker hides for Expensify")
    check("Expensify" in page.text_content("#plan"), "plan text follows the service")

    page.select_option("#service", "sparkreceipt")
    page.wait_for_timeout(50)
    calls(page)
    page.select_option("#sparkType", "income")
    page.wait_for_timeout(50)
    trace["popup change type"] = calls(page)
    check(trace["popup change type"] == [{"api": "storage.sync.set", "arg": {"sparkType": "income"}}],
          "changing the type saves just the type")

    page.click("#sendBtn")
    page.wait_for_timeout(700)
    trace["popup grab this page"] = calls(page)
    check(trace["popup grab this page"] == [
        {"api": "runtime.sendMessage", "arg": {"type": "send", "tabId": 42}},
        {"api": "window.close", "arg": None},
    ], "Grab This Page sends the grab message for this tab, then closes")
    check(page.is_disabled("#sendBtn"), "Grab This Page turns off while working")
    context.close()

    context, page = open_page(browser, "popup.html", config(), 320, 600)
    calls(page)
    page.click("#allBtn")
    page.wait_for_timeout(700)
    trace["popup grab all tabs, allowed"] = calls(page)
    check(trace["popup grab all tabs, allowed"] == [
        {"api": "permissions.contains", "arg": {"origins": ["<all_urls>"]}},
        {"api": "runtime.sendMessage", "arg": {"type": "sendAllTabs", "windowId": 7}},
        {"api": "window.close", "arg": None},
    ], "Grab All Tabs checks access, sends the batch message, then closes")
    context.close()

    context, page = open_page(browser, "popup.html", config(grantAllSites=False), 320, 600)
    calls(page)
    page.click("#allBtn")
    page.wait_for_timeout(700)
    trace["popup grab all tabs, declined"] = calls(page)
    check(trace["popup grab all tabs, declined"] == [
        {"api": "permissions.contains", "arg": {"origins": ["<all_urls>"]}},
        {"api": "permissions.request", "arg": {"origins": ["<all_urls>"]}},
    ], "Grab All Tabs asks for access and stops when declined")
    page.click("#optionsLink")
    page.wait_for_timeout(50)
    trace["popup settings"] = calls(page)
    check(trace["popup settings"] == [{"api": "runtime.openOptionsPage", "arg": None}],
          "Settings opens the settings page")
    if not args.trace_only:
        check("Grab All Tabs needs your OK" in page.text_content("#status"),
              "declining access explains what to do")
        check(not page.is_disabled("#allBtn"), "Grab All Tabs can be tried again")
    context.close()

    if args.trace_only:
        return

    context, page = open_page(browser, "popup.html", config(), 320, 600)
    rows = page.locator("#historyList li")
    check(rows.count() == 3, "Recent Grabs lists each grab")
    check(rows.nth(1).inner_text().split() == ["✕", "Missed:", "harborfreight.com", "SparkReceipt"],
          "a missed grab is marked and named for screen readers")
    check(rows.nth(2).locator(".svc").inner_text() == "Expensify", "each grab names its service")
    no_sideways_scroll(page, "popup")
    order = []
    for _ in range(5):
        page.keyboard.press("Tab")
        order.append(page.evaluate("document.activeElement.id"))
    check(order == ["service", "sparkType", "sendBtn", "allBtn", "optionsLink"],
          "Tab moves through the popup in reading order, got %s" % order)
    outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
    check(outline == "solid", "keyboard focus is visible in the popup")
    context.close()

    context, page = open_page(browser, "popup.html", config(local={}), 320, 600)
    check("No Grabs Yet" in page.text_content("#historyList"), "empty Recent Grabs shows a friendly note")
    context.close()

    blocked = dict(TAB, url="chrome://extensions/", title="Extensions")
    context, page = open_page(browser, "popup.html", config(tab=blocked), 320, 600)
    check("doesn't let extensions capture this page" in page.text_content("#status"),
          "popup warns on pages Chrome won't capture")
    check(not page.is_disabled("#sendBtn"), "the warning doesn't block the button")
    context.close()

    context, page = open_page(browser, "popup.html", config(tab=None), 320, 600)
    check(page.is_disabled("#sendBtn") and page.is_disabled("#allBtn"), "no tab, no grab buttons")
    context.close()


# ---------- settings ----------

SAVED = {"service": "expensify", "sparkType": "statement", "sparkEmail": "me@in.example.com",
         "destination": "gmail", "format": "visible", "reveal": True, "closeTab": False,
         "deleteLocal": True, "silent": True}


def options_checks(browser):
    context, page = open_page(browser, "options.html", config(sync=SAVED))
    trace["settings load"] = calls(page)
    shown = page.evaluate("""() => ({
        service: document.querySelector('input[name="service"]:checked').value,
        sparkEmail: document.getElementById('sparkEmail').value,
        destination: document.querySelector('input[name="destination"]:checked').value,
        format: document.querySelector('input[name="format"]:checked').value,
        reveal: document.getElementById('reveal').checked,
        closeTab: document.getElementById('closeTab').checked,
        deleteLocal: document.getElementById('deleteLocal').checked,
        silent: document.getElementById('silent').checked,
    })""")
    expected = {k: v for k, v in SAVED.items() if k != "sparkType"}
    check(shown == expected, "settings page shows what was saved, got %s" % shown)

    page.check('input[name="service"][value="sparkreceipt"]')
    page.check('input[name="destination"][value="autodrop"]')
    page.check('input[name="format"][value="full"]')
    page.uncheck("#reveal")
    page.check("#closeTab")
    page.fill("#sparkEmail", "  new@in.example.com ")
    calls(page)
    page.click("#save")
    page.wait_for_timeout(100)
    trace["settings save"] = calls(page)
    want = {"service": "sparkreceipt", "sparkType": "statement", "sparkEmail": "new@in.example.com",
            "destination": "autodrop", "format": "full", "reveal": False, "closeTab": True,
            "deleteLocal": True, "silent": True}
    check(trace["settings save"] == [{"api": "storage.sync.set", "arg": want}],
          "Save writes every setting once and keeps the popup's type, got %s" % trace["settings save"])
    check(page.text_content("#status") == "Saved", "Save confirms with a message")
    context.close()

    # What was saved is what loads next time
    context, page = open_page(browser, "options.html", config(sync=want))
    check(page.is_checked('input[name="destination"][value="autodrop"]') and page.is_checked("#closeTab")
          and page.input_value("#sparkEmail") == "new@in.example.com", "saved settings load back")
    context.close()

    if args.trace_only:
        return

    context, page = open_page(browser, "options.html", config())
    check(page.text_content("#version") == "Version " + MANIFEST["version"], "footer shows the version")
    page.check('input[name="destination"][value="mailto"]')
    page.focus("#sparkEmail")
    calls(page)
    page.keyboard.press("Enter")
    page.wait_for_timeout(100)
    saved = calls(page)
    check(len(saved) == 1 and saved[0]["api"] == "storage.sync.set", "Enter in the email field saves")
    check("Add your forwarding email" in page.text_content("#status"),
          "saving an email draft choice without an address says what's missing")

    # Activity Log
    rows = page.locator("#logRows tr")
    check(rows.count() == 3, "Activity Log lists each step")
    first = [c.strip() for c in rows.nth(0).locator("td").all_inner_texts()]
    check(first[1] == "Upload Confirmed" and first[2].split() == ["amazon.com", "SparkReceipt"],
          "newest step is first and carries its site, got %s" % first)
    check(first[0] == "Oct 2, 2:12:16 PM", "times show in local time, got %s" % first[0])
    check(page.text_content("#logCount") == "3 steps, newest first.", "the log says how many steps it holds")

    with page.expect_download() as got:
        page.click("#exportCsv")
    csv_file = got.value
    text = pathlib.Path(csv_file.path()).read_text()
    check(csv_file.suggested_filename.startswith("receipt-sender-activity-")
          and csv_file.suggested_filename.endswith(".csv"), "CSV export has a clear file name")
    check(text.splitlines()[0] == "Time,Step,Site,Service,Details,Grab ID" and len(text.splitlines()) == 4,
          "CSV export has a header and every step")
    with page.expect_download() as got:
        page.click("#exportJson")
    data = json.loads(pathlib.Path(got.value.path()).read_text())
    check(data["app"] == "Receipt Sender" and data["version"] == MANIFEST["version"]
          and len(data["entries"]) == 3, "JSON export is complete")
    calls(page)

    page.once("dialog", lambda d: d.dismiss())
    page.click("#clearLog")
    page.wait_for_timeout(100)
    check(calls(page) == [] and rows.count() == 3, "Clear Log does nothing if you cancel")
    page.once("dialog", lambda d: d.accept())
    page.click("#clearLog")
    page.wait_for_timeout(200)
    cleared = calls(page)
    check(cleared[0] == {"api": "runtime.sendMessage", "arg": {"type": "clearActivityLog"}},
          "Clear Log asks the service worker to clear")
    check(rows.count() == 1 and "Log Cleared" in rows.nth(0).inner_text(), "after clearing, only the note remains")
    no_sideways_scroll(page, "settings page")
    context.close()

    context, page = open_page(browser, "options.html", config(local={}))
    check(page.is_visible("#logEmpty") and not page.is_visible("#logTable"), "empty log shows a friendly note")
    check(page.is_disabled("#exportCsv") and page.is_disabled("#exportJson") and page.is_disabled("#clearLog"),
          "nothing to export or clear when the log is empty")
    page.keyboard.press("Tab")
    first_stop = page.evaluate("document.activeElement.name")
    check(first_stop == "service", "Tab starts at the first setting, got %s" % first_stop)
    context.close()

    for width in (400, 760):
        context, page = open_page(browser, "options.html", config(), width, 800)
        no_sideways_scroll(page, "settings page at %dpx" % width)
        context.close()
    context, page = open_page(browser, "privacy.html", config(), 400, 800)
    no_sideways_scroll(page, "privacy page at 400px")
    context.close()

    # Larger text: the popup still fits its width
    context, page = open_page(browser, "popup.html", config(), 320, 600)
    page.add_style_tag(content="html { font-size: 125%; } body { font-size: 16px !important; }")
    no_sideways_scroll(page, "popup with larger text")
    context.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        popup_checks(browser)
        options_checks(browser)
        browser.close()
    if args.trace:
        pathlib.Path(args.trace).write_text(json.dumps(trace, indent=1, sort_keys=True))
    for line in problems:
        failures.append(line)
    if failures:
        print("FAILED %d of %d checks:" % (len(failures), checks))
        for line in failures:
            print("  " + line)
        return 1
    print("OK: %d checks passed, no console errors." % checks)
    return 0


if __name__ == "__main__":
    sys.exit(main())
