#!/usr/bin/env python3
"""Regenerate the README screenshots in docs/screenshots and the store images in store/.

Run from anywhere:

    python3 tools/screenshots.py            # docs/screenshots and store/
    python3 tools/screenshots.py --docs     # docs/screenshots only
    python3 tools/screenshots.py --store    # store/ only (uses the docs popup and settings shots)

Needs Python Playwright with Chromium. Nothing is installed or downloaded by
this script. The pages are opened as plain files with a stand-in for the
chrome.* APIs (tools/chrome_stub.js) and made-up sample data, so no account or
real receipt is involved.

The run fails if any page logs a console error, so it doubles as a smoke test
of the popup, settings and privacy pages in light and dark mode.
"""

import datetime
import json
import pathlib
import sys
import tempfile
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"
STUB = ROOT / "tools" / "chrome_stub.js"
MANIFEST = json.loads((ROOT / "manifest.json").read_text())

LOCALE = "en-US"
TIMEZONE = "America/Chicago"
BASE_TS = 1790968325000  # Fri Oct 2 2026, 2:12:05 PM in Dallas

problems = []


def sample_log():
    """A believable afternoon of grabs. Site names only, like the real log."""
    t = [BASE_TS]

    def step(name, after=1.0, **fields):
        t[0] += int(after * 1000)
        return dict(ts=t[0], step=name, **fields)

    def saved(site, short, ext="jpg"):
        """A backup file name the way the extension makes them, in Dallas time."""
        local = datetime.datetime.fromtimestamp(t[0] / 1000, ZoneInfo(TIMEZONE))
        return "Receipts/%s-%s-%s.%s" % (site, local.strftime("%Y-%m-%d-%H%M"), short, ext)

    a, b, c, d, e = (
        "3f6c1c1e-8a54-4d0b-9a57-0f6f4a1b2c01",
        "9b1d7e42-1c3a-4f8e-b2a6-5d4c3b2a1f02",
        "c47a2f90-6e1b-4a3d-8c9e-7f6e5d4c3b03",
        "e85b3a61-2d4c-4b7f-a1d0-9e8f7a6b5c04",
        "f12c4d73-5e6f-4a8b-b9c0-1d2e3f4a5b05",
    )
    spark, exp = "sparkreceipt", "expensify"
    log = [
        step("grab_started", grabId=a, host="amazon.com", service=spark, detail="Page"),
        step("file_saved", 2.4, grabId=a, detail=saved("amazon.com", "a7k2")),
        step("receipt_queued", 0.1, grabId=a, service=spark),
        step("service_opened", 0.1, service=spark, detail="Background tab"),
        step("receipt_picked_up", 1.6, grabId=a, service=spark),
        step("file_attached", 1.3, grabId=a, service=spark),
        step("service_note", 1.1, grabId=a, service=spark,
             detail="Receipt dropped in. SparkReceipt is scanning it now."),
        step("upload_confirmed", 6.6, grabId=a, service=spark),
        step("backup_deleted", 0.1, grabId=a),
        step("tab_closed", 0.1, service=spark),

        step("grab_started", 412, grabId=b, host="homedepot.com", service=spark, detail="Page"),
        step("file_saved", 3.1, grabId=b, detail=saved("homedepot.com", "m3qd")),
        step("receipt_queued", 0.1, grabId=b, service=spark),
        step("service_opened", 0.1, service=spark, detail="Background tab"),
        step("receipt_picked_up", 1.4, grabId=b, service=spark),
        step("file_attached", 1.2, grabId=b, service=spark),
        step("service_note", 1.0, grabId=b, service=spark,
             detail="Receipt dropped in. SparkReceipt is scanning it now."),
        step("upload_confirmed", 6.5, grabId=b, service=spark),
        step("backup_deleted", 0.1, grabId=b),
        step("tab_closed", 0.1, service=spark),

        step("settings_changed", 1264, detail="service"),
        step("grab_started", 9, grabId=c, host="riders.uber.com", service=exp, detail="Page"),
        step("file_saved", 1.2, grabId=c, detail=saved("riders.uber.com", "x9p4", "png")),
        step("receipt_queued", 0.1, grabId=c, service=exp),
        step("service_opened", 0.1, service=exp, detail="Background tab"),
        step("receipt_picked_up", 2.2, grabId=c, service=exp),
        step("file_attached", 1.0, grabId=c, service=exp),
        step("service_note", 1.6, grabId=c, service=exp,
             detail="Receipt dropped in. Expensify is scanning it now."),
        step("upload_confirmed", 6.4, grabId=c, service=exp),
        step("backup_deleted", 0.1, grabId=c),
        step("tab_closed", 0.1, service=exp),

        step("settings_changed", 2890, detail="service"),
        step("grab_started", 14, grabId=d, host="harborfreight.com", service=spark, detail="Page"),
        step("file_saved", 2.8, grabId=d, detail=saved("harborfreight.com", "h2fw")),
        step("receipt_queued", 0.1, grabId=d, service=spark),
        step("service_opened", 0.1, service=spark, detail="Background tab"),
        step("receipt_picked_up", 1.5, grabId=d, service=spark),
        step("sign_in_needed", 0.4, grabId=d, service=spark),
        step("service_note", 180, grabId=d, service=spark,
             detail="Sign in first. Your receipt is saved in Downloads/Receipts."),
        step("upload_missed", 0.1, grabId=d, service=spark),

        step("settings_changed", 655, detail="after grabbing"),
        step("grab_started", 21, grabId=e, host="microcenter.com", service=spark, detail="Page"),
        step("file_saved", 2.2, grabId=e, detail=saved("microcenter.com", "r6tb")),
        step("saved_only", 0.1, grabId=e, service=spark, detail="Backup file only"),
        step("settings_changed", 48, detail="after grabbing"),
    ]
    history = [
        dict(id=e, ts=log[-3]["ts"], host="microcenter.com", service=spark, status="saved"),
        dict(id=d, ts=log[-8]["ts"], host="harborfreight.com", service=spark, status="fail"),
        dict(id=c, ts=log[22]["ts"], host="riders.uber.com", service=exp, status="ok"),
        dict(id=b, ts=log[10]["ts"], host="homedepot.com", service=spark, status="ok"),
        dict(id=a, ts=log[0]["ts"], host="amazon.com", service=spark, status="ok"),
    ]
    return log, history


def stub_config(empty=False):
    log, history = sample_log()
    return {
        "manifest": MANIFEST,
        "sync": {"silent": True, "closeTab": True, "deleteLocal": True},
        "local": {} if empty else {"activityLog": log, "history": history},
        "tab": {
            "id": 42,
            "windowId": 7,
            "title": "Amazon.com: Order Details",
            "url": "https://www.amazon.com/gp/your-account/order-details",
        },
        "grantAllSites": True,
    }


def open_page(browser, name, scheme, width, height, config=None):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=2,
        color_scheme=scheme,
        locale=LOCALE,
        timezone_id=TIMEZONE,
    )
    page = context.new_page()
    label = "%s (%s)" % (name, scheme)
    page.on(
        "console",
        lambda m: problems.append("%s console %s: %s" % (label, m.type, m.text))
        if m.type in ("error", "warning")
        else None,
    )
    page.on("pageerror", lambda e: problems.append("%s page error: %s" % (label, e)))
    page.on(
        "requestfailed",
        lambda r: problems.append("%s failed to load %s" % (label, r.url)),
    )
    if config is not None:
        page.add_init_script("window.__RS_STUB = %s;" % json.dumps(config))
        page.add_init_script(path=str(STUB))
    page.goto((ROOT / name).as_uri())
    page.wait_for_timeout(250)
    return context, page


def shoot_popup(browser, scheme, out_name, empty=False):
    context, page = open_page(browser, "popup.html", scheme, 320, 600, stub_config(empty))
    height = page.evaluate("document.documentElement.getBoundingClientRect().height")
    page.set_viewport_size({"width": 320, "height": int(height + 0.5)})
    page.screenshot(path=str(OUT / out_name))
    context.close()


def shoot_options(browser, scheme, out_name, empty=False):
    context, page = open_page(browser, "options.html", scheme, 1280, 800, stub_config(empty))
    page.screenshot(path=str(OUT / out_name))
    context.close()


def shoot_log(browser, scheme, out_name):
    context, page = open_page(browser, "options.html", scheme, 1280, 900, stub_config())
    page.locator("section.log").screenshot(path=str(OUT / out_name))
    context.close()


def shoot_options_phone(browser, scheme, out_name):
    context, page = open_page(browser, "options.html", scheme, 400, 760, stub_config())
    page.screenshot(path=str(OUT / out_name))
    context.close()


def shoot_privacy(browser, scheme, out_name):
    context, page = open_page(browser, "privacy.html", scheme, 1280, 800)
    page.screenshot(path=str(OUT / out_name))
    context.close()


HERO = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Receipt Sender</title>
<style>
  :root {{ --bg1: {bg1}; --bg2: {bg2}; --ink: {ink}; --soft: {soft}; --frame: {frame}; --bar: {bar}; --dot: {dot}; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; height: 100%; }}
  body {{
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    background: radial-gradient(1100px 620px at 12% 0%, var(--bg2), var(--bg1));
    overflow: hidden;
    position: relative;
  }}
  .copy {{ position: absolute; left: 64px; top: 96px; width: 400px; }}
  .brand {{ display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }}
  .brand img {{ width: 52px; height: 52px; border-radius: 12px; }}
  h1 {{ margin: 28px 0 0; font-size: 42px; line-height: 1.1; letter-spacing: -0.03em; font-weight: 750; }}
  p {{ margin: 16px 0 0; font-size: 19px; line-height: 1.45; color: var(--soft); }}
  .popup {{
    position: absolute; left: 968px; top: 150px; width: 264px;
    border-radius: 12px; overflow: hidden; z-index: 2;
    box-shadow: 0 30px 70px rgba(4, 33, 30, 0.34), 0 4px 14px rgba(4, 33, 30, 0.18);
    outline: 1px solid var(--frame);
  }}
  .popup img {{ display: block; width: 264px; }}
  .window {{
    position: absolute; left: 500px; top: 64px; width: 660px;
    border-radius: 12px; overflow: hidden;
    box-shadow: 0 30px 80px rgba(4, 33, 30, 0.28);
    outline: 1px solid var(--frame);
    background: var(--bar);
  }}
  .bar {{ height: 26px; display: flex; align-items: center; gap: 6px; padding: 0 12px; }}
  .bar i {{ width: 8px; height: 8px; border-radius: 50%; background: var(--dot); }}
  .window img {{ display: block; width: 660px; }}
</style></head>
<body>
  <div class="copy">
    <div class="brand"><img src="{icon}" alt="">Receipt Sender</div>
    <h1>Any Page to a Filed Receipt, in One Click</h1>
    <p>Grabs the page, opens SparkReceipt or Expensify, and uploads it for you.</p>
  </div>
  <div class="popup"><img src="{popup}" alt=""></div>
  <div class="window"><div class="bar"><i></i><i></i><i></i></div><img src="{options}" alt=""></div>
</body></html>
"""

HERO_COLORS = {
    "light": dict(bg1="#d9efeb", bg2="#f4fbfa", ink="#0c2b28", soft="#2f4a46",
                  frame="rgba(12, 43, 40, 0.10)", bar="#e6eeec", dot="#b9c9c5"),
    "dark": dict(bg1="#061110", bg2="#12302c", ink="#e8f6f3", soft="#a9c4bf",
                 frame="rgba(255, 255, 255, 0.10)", bar="#1a2725", dot="#3a4d49"),
}


def shoot_hero(browser, scheme, out_name):
    html = HERO.format(
        icon=(ROOT / "icons" / "icon128.png").as_uri(),
        popup=(OUT / ("popup-%s.png" % scheme)).as_uri(),
        options=(OUT / ("options-%s.png" % scheme)).as_uri(),
        **HERO_COLORS[scheme],
    )
    with tempfile.TemporaryDirectory() as tmp:
        wrapper = pathlib.Path(tmp) / "hero.html"
        wrapper.write_text(html)
        context = browser.new_context(
            viewport={"width": 1280, "height": 640}, device_scale_factor=2, color_scheme=scheme
        )
        page = context.new_page()
        page.on("pageerror", lambda e: problems.append("hero page error: %s" % e))
        page.on("requestfailed", lambda r: problems.append("hero failed to load %s" % r.url))
        page.goto(wrapper.as_uri())
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / out_name))
        context.close()


# ---------- Chrome Web Store assets (store/) ----------
#
# The store wants screenshots at exactly 1280x800 and a 440x280 small promo
# tile, as PNG without see-through parts, plus a 128x128 icon. They're drawn
# at 1x so the sizes come out exact. Light mode only.

STORE = ROOT / "store"
STORE_SHOTS = STORE / "screenshots"

STORE_FRAME = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Receipt Sender</title>
<style>
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; width: 1280px; height: 800px; }}
  body {{
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0c2b28;
    background: radial-gradient(1200px 760px at 12% 0%, #f4fbfa, #d9efeb);
    overflow: hidden; position: relative;
  }}
  .copy {{ position: absolute; left: 72px; top: {copy_top}px; width: {copy_w}px; }}
  .brand {{ display: flex; align-items: center; gap: 14px; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }}
  .brand img {{ width: 48px; height: 48px; border-radius: 11px; }}
  h1 {{ margin: 28px 0 0; font-size: 44px; line-height: 1.1; letter-spacing: -0.03em; font-weight: 750; }}
  p {{ margin: 18px 0 0; font-size: 20px; line-height: 1.45; color: #2f4a46; }}
  .shot {{ position: absolute; border-radius: 12px; overflow: hidden; outline: 1px solid rgba(12, 43, 40, 0.10);
           box-shadow: 0 30px 70px rgba(4, 33, 30, 0.28), 0 4px 14px rgba(4, 33, 30, 0.14); background: #e6eeec; }}
  .shot img {{ display: block; width: 100%; }}
  .bar {{ height: 26px; display: flex; align-items: center; gap: 6px; padding: 0 12px; }}
  .bar i {{ width: 8px; height: 8px; border-radius: 50%; background: #b9c9c5; }}
</style></head>
<body>
  <div class="copy">
    <div class="brand"><img src="{icon}" alt="">Receipt Sender</div>
    <h1>{title}</h1>
    <p>{line}</p>
  </div>
  {shots}
</body></html>
"""

PROMO_TILE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Receipt Sender</title>
<style>
  html, body { margin: 0; width: 440px; height: 280px; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(135deg, #0f766e, #0b4f4a); color: #ffffff; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center; padding: 0 36px; box-sizing: border-box;
  }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 750; letter-spacing: -0.02em; }
  .brand img { width: 64px; height: 64px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25); }
  p { margin: 18px 0 0; font-size: 19px; line-height: 1.35; color: #d7f2ee; }
</style></head>
<body>
  <div class="brand"><img src="ICON" alt="">Receipt Sender</div>
  <p>Any page or image to SparkReceipt or Expensify, in one click.</p>
</body></html>
"""

ICON_PADDED = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Icon</title>
<style>html, body { margin: 0; width: 128px; height: 128px; background: transparent; }
img { position: absolute; left: 16px; top: 16px; width: 96px; height: 96px; }</style></head>
<body><img src="ICON" alt=""></body></html>
"""


def render_html(browser, html, width, height, out, transparent=False):
    with tempfile.TemporaryDirectory() as tmp:
        wrapper = pathlib.Path(tmp) / "frame.html"
        wrapper.write_text(html)
        context = browser.new_context(viewport={"width": width, "height": height},
                                      device_scale_factor=1, color_scheme="light")
        page = context.new_page()
        page.on("pageerror", lambda e: problems.append("%s page error: %s" % (out.name, e)))
        page.on("requestfailed", lambda r: problems.append("%s failed to load %s" % (out.name, r.url)))
        page.goto(wrapper.as_uri())
        page.wait_for_timeout(300)
        page.screenshot(path=str(out), omit_background=transparent)
        context.close()


def store_frame(title, line, shots, copy_top=230, copy_w=420):
    return STORE_FRAME.format(icon=(ROOT / "icons" / "icon128.png").as_uri(), title=title, line=line,
                              shots=shots, copy_top=copy_top, copy_w=copy_w)


def shoot_store(browser):
    STORE_SHOTS.mkdir(parents=True, exist_ok=True)
    popup = (OUT / "popup-light.png").as_uri()
    options = (OUT / "options-light.png").as_uri()

    # 1. The popup over the settings page
    shots = ('<div class="shot" style="left:530px;top:110px;width:680px">'
             '<div class="bar"><i></i><i></i><i></i></div><img src="%s" alt=""></div>'
             '<div class="shot" style="left:950px;top:210px;width:280px;background:none"><img src="%s" alt=""></div>'
             % (options, popup))
    render_html(browser, store_frame("Any Page to a Filed Receipt, in One Click",
                                     "Grabs the page, opens SparkReceipt or Expensify, and uploads it for you.",
                                     shots, copy_top=230, copy_w=445),
                1280, 800, STORE_SHOTS / "1-popup-over-settings.png")

    # 2. The popup on its own, large enough to read
    shots = ('<div class="shot" style="left:690px;top:60px;width:370px;background:none">'
             '<img src="%s" alt=""></div>' % popup)
    render_html(browser, store_frame("Pick a Service, Then Grab the Page",
                                     "Switch between SparkReceipt and Expensify for each grab. Your last 10 grabs "
                                     "show right in the popup, marked uploaded, saved, or missed.",
                                     shots, copy_top=250, copy_w=480),
                1280, 800, STORE_SHOTS / "2-popup.png")

    # 3. The settings page with the Activity Log, as it really looks
    context, page = open_page_1x(browser, "options.html", stub_config())
    page.screenshot(path=str(STORE_SHOTS / "3-settings-and-activity-log.png"))
    context.close()

    # 4. The privacy policy
    context, page = open_page_1x(browser, "privacy.html", None)
    page.screenshot(path=str(STORE_SHOTS / "4-privacy.png"))
    context.close()

    icon = (ROOT / "icons" / "icon128.png").as_uri()
    render_html(browser, PROMO_TILE.replace("ICON", icon), 440, 280, STORE / "promo-small-440x280.png")
    # 96x96 artwork with 16px of clear space around it, as the store suggests
    render_html(browser, ICON_PADDED.replace("ICON", icon), 128, 128, STORE / "icon-128.png", transparent=True)


def open_page_1x(browser, name, config):
    """A page at exactly 1280x800 for the store."""
    context = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1,
                                  color_scheme="light", locale=LOCALE, timezone_id=TIMEZONE)
    page = context.new_page()
    page.on("console", lambda m: problems.append("store %s console %s: %s" % (name, m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: problems.append("store %s page error: %s" % (name, e)))
    if config is not None:
        page.add_init_script("window.__RS_STUB = %s;" % json.dumps(config))
        page.add_init_script(path=str(STUB))
    page.goto((ROOT / name).as_uri())
    page.wait_for_timeout(250)
    return context, page


def png_info(path):
    """Width, height and PNG color type (2 is RGB, 6 has see-through parts)."""
    head = path.read_bytes()[:26]
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big"), head[25]


def check_store():
    want = {path: (1280, 800) for path in STORE_SHOTS.glob("*.png")}
    want[STORE / "promo-small-440x280.png"] = (440, 280)
    if len(want) != 5:
        problems.append("expected 4 store screenshots and a promo tile, found %d files" % len(want))
    for path, size in want.items():
        w, h, color = png_info(path)
        if (w, h) != size:
            problems.append("%s is %dx%d, the store needs %dx%d" % (path.name, w, h, size[0], size[1]))
        if color != 2:
            problems.append("%s has see-through parts, the store wants plain RGB" % path.name)
    if png_info(STORE / "icon-128.png")[:2] != (128, 128):
        problems.append("store/icon-128.png isn't 128x128")


def main():
    only = sys.argv[1:]
    if only and only not in (["--docs"], ["--store"]):
        print("Use --docs for docs/screenshots only, --store for store/ only, or nothing for both.")
        return 2
    docs, store = only != ["--store"], only != ["--docs"]
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for scheme in (("light", "dark") if docs else ()):
            shoot_popup(browser, scheme, "popup-%s.png" % scheme)
            shoot_options(browser, scheme, "options-%s.png" % scheme)
            shoot_log(browser, scheme, "activity-log-%s.png" % scheme)
            shoot_privacy(browser, scheme, "privacy-%s.png" % scheme)
            shoot_hero(browser, scheme, "hero-%s.png" % scheme)
        if docs:
            shoot_popup(browser, "light", "popup-empty-light.png", empty=True)
            shoot_options(browser, "light", "options-empty-light.png", empty=True)
            shoot_options_phone(browser, "light", "options-narrow-light.png")
        if store:
            shoot_store(browser)  # built from the docs popup and settings shots
        browser.close()
    if store:
        check_store()

    if problems:
        print("Problems found while rendering:")
        for line in problems:
            print("  " + line)
        return 1
    for path in sorted(OUT.glob("*.png")) + sorted(STORE.rglob("*.png")):
        print("%7.0f KB  %s" % (path.stat().st_size / 1024, path.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
