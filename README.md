# Receipt Sender

![Version](https://img.shields.io/badge/version-4.1.1-0d9488) ![Platform](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4) ![Status](https://img.shields.io/badge/status-working-188038) [![Tests](https://github.com/HarrisonWard/Spark-Receipt-Sender/actions/workflows/test.yml/badge.svg)](https://github.com/HarrisonWard/Spark-Receipt-Sender/actions/workflows/test.yml)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/hero-dark.png">
  <img src="docs/screenshots/hero-light.png" alt="The Receipt Sender popup and settings page" width="100%">
</picture>

A Chrome extension that turns any web page or image into a receipt inside [SparkReceipt](https://sparkreceipt.com) or [Expensify](https://expensify.com) with one click. No dragging, no forwarding, no babysitting. Pick the service in the popup, click the button, done.

Built because SparkReceipt has no browser extension and Expensify retired theirs. This fills both gaps.

## What It Does

One click on a receipt page and the extension grabs the whole page as a stitched full-page image, opens your receipt service, walks its own upload screens, and the scan starts.

- **SparkReceipt:** Add documents, Expense or receipt, attach, Confirm.
- **Expensify:** Scan receipt, drop on the upload zone, Create expense.

A small note in the corner of the service page tells you each step as it happens. A backup copy of every grab lands in Downloads/Receipts.

### The Longer Version

Receipt Sender is for anyone who keeps their receipts in SparkReceipt or Expensify and is tired of the download, drag, and drop routine. Online orders, invoices, and payment confirmations mostly live on web pages, not in your inbox, so getting them into your receipt app usually means saving a file, finding it, and uploading it by hand.

This extension does all of that with one click. It takes a picture of the page you are on (the whole thing, top to bottom, not just what fits on screen), saves a backup copy to Downloads/Receipts, opens your receipt service, and clicks through the service's own upload screens for you. SparkReceipt: Add documents, pick the document type, attach, Confirm. Expensify: Scan receipt, drop the file on the upload zone, Create expense. A small note in the corner of the page tells you what it is doing at each step.

If anything goes sideways (you are signed out, the site changed, a button never shows up), nothing is lost. The backup file stays in Downloads/Receipts and the tab stays open so you can finish by hand. The toolbar badge shows OK when it worked and ! when you should take a look.

## Screenshots

| Light | Dark |
|---|---|
| <img src="docs/screenshots/popup-light.png" alt="The popup in light mode" width="320"> | <img src="docs/screenshots/popup-dark.png" alt="The popup in dark mode" width="320"> |
| The popup: pick a service, grab the page, see your recent grabs. | Dark mode follows your device setting. |
| <img src="docs/screenshots/options-light.png" alt="The settings page in light mode"> | <img src="docs/screenshots/options-dark.png" alt="The settings page in dark mode"> |
| Settings on the left, the Activity Log on the right. | The same page in dark mode. |
| <img src="docs/screenshots/activity-log-light.png" alt="The Activity Log in light mode"> | <img src="docs/screenshots/activity-log-dark.png" alt="The Activity Log in dark mode"> |
| The Activity Log: every step of every grab, kept on your computer. | Export it as CSV or JSON, or clear it. |
| <img src="docs/screenshots/privacy-light.png" alt="The privacy policy in light mode"> | <img src="docs/screenshots/privacy-dark.png" alt="The privacy policy in dark mode"> |
| The privacy policy that ships with the extension. | The same page in dark mode. |

More in [docs/screenshots](docs/screenshots): the popup and settings page before your first grab, and the settings page on a narrow window.

## Features

| Feature | How |
|---|---|
| Grab a Whole Page | Stitched full-page image, from the toolbar, a right-click, or Alt+Shift+S |
| Grab Just an Image | Right-click any image and send only that |
| Grab All Tabs | One click sends every tab in the window through the queue |
| Two Services | SparkReceipt and Expensify, switchable for each grab in the popup |
| Auto Drop | Walks each service's real upload screens and confirms for you |
| Silent Mode | Runs in a background tab so you never leave your page |
| Auto Close the Tab | Optional, waits for the upload to finish first |
| Auto Delete the Backup File | Optional, only after a fully successful drop |
| Recent Grabs | Your last 10 grabs in the popup, each marked uploaded, saved, or missed |
| Activity Log | A timestamped record of every step, kept on your computer, with export and clear |
| Type Picker | SparkReceipt grabs can be filed as an expense, invoice, statement, or other document |
| Unique File Names | Every grab saves under a unique ID, so names never collide |
| Safety Net | Any miss leaves the tab open and the file in Downloads/Receipts |
| Light and Dark Mode | The popup, settings, and privacy pages follow your device setting |

### Feature Details

#### Grabbing Receipts

- Grab the whole page as one tall image, stitched together from screenshots as it scrolls down
- Sticky headers and floating bars are hidden after the first screen so they do not repeat down the image
- Your scroll position is put back where it was when the grab is done
- Very long pages are capped at 12 screens tall
- Quick mode: grab only what is on screen instead of the full page
- If a full page grab fails for any reason, it falls back to a regular screenshot
- Right click any image to send just that image
- Image grabs try three ways in order: fetch it from inside the page (so images behind a sign-in work), fetch it directly if you granted all sites access, or crop it out of a screenshot
- Grab every tab in the current window at once, one after another, with the badge counting along (1/5, 2/5, and so on)
- Batch mode skips Chrome pages and your SparkReceipt and Expensify tabs

#### Ways To Start A Grab

- Toolbar popup: **Grab This Page** or **Grab All Tabs in This Window**
- Right click a page: **Send Page to SparkReceipt** (or Expensify)
- Right click an image: **Send This Image to SparkReceipt** (or Expensify)
- The right click menu wording updates to match whichever service you picked
- Keyboard shortcut: **Alt+Shift+S**

#### Two Receipt Services

- SparkReceipt and Expensify, switchable per grab right in the popup or in Settings
- SparkReceipt grabs can be filed as Expense or receipt, Income or invoice, Bank or credit card statement, or Other document
- The type picker only shows up in the popup when SparkReceipt is selected
- The popup spells out exactly what will happen before you click (for example, "Saves this page as a full page image then drops it into SparkReceipt for you.")

#### Automatic Drop

- Clicks through each service's real upload screens, the same way you would
- Reuses an already open SparkReceipt or Expensify tab instead of piling up new ones
- Signed out? It waits up to 3 minutes for you to sign in, then carries on
- Gives up cleanly if a step never appears (about a minute for SparkReceipt, a bit longer for Expensify) and tells you to drag the file from Downloads/Receipts
- If the file attaches but the last button cannot be found, the note tells you to finish that one click yourself
- Grabs waiting in line are handled one after another through the same tab
- Anything left waiting more than 10 minutes is dropped from the line so stale grabs do not show up later
- A colored note in the corner of the service page narrates each step, and can be closed with the x

#### After The Upload

- Silent mode: the drop runs in a background tab so you never leave the page you are on
- Close the service tab automatically, but only after the upload has had time to finish
- Delete the backup file automatically, but only after a fully successful drop
- Toolbar badge: ... while working, OK in green when done, ! in red when something needs a look

#### Other Ways To Send

- Open the service so you can drop the file in yourself
- Open a Gmail draft already addressed to the right place, with a subject line and a reminder to attach the file
- Open a draft in your regular mail app instead of Gmail
- Just save the file and do nothing else
- Email drafts go to your SparkReceipt forwarding address, or receipts@expensify.com for Expensify
- Optional: pop open the Downloads folder after saving, handy for dragging by hand

#### Files And History

- Every grab saves a backup copy to Downloads/Receipts
- Each file gets a random unique name, so nothing ever overwrites anything
- Page grabs save as JPG (PNG when the page fits on one screen). Image grabs keep their original type where possible (JPG, PNG, WebP, GIF, HEIC)
- The popup lists your last 10 grabs with the site name, the service, and a mark for worked, failed, still working, or saved only

#### Settings And Setup

- The Settings page opens by itself the first time you install
- The automatic drop needs no setup at all. The forwarding email is only needed for the email options
- Settings sync to your other computers through Chrome if you are signed in
- Settings from older versions carry over automatically

#### Privacy And Permissions

- Only two sites get access: app.sparkreceipt.com and new.expensify.com
- All sites access is optional and only asked for when you first use Grab All Tabs. Say no and everything else still works
- No debugger permission, no remote code, no analytics, no servers
- Zero dependencies and no build step. The files in this repo are exactly what runs

## How It Works

1. You click Grab (or right click, or press Alt+Shift+S)
2. The extension captures the page or image and saves a backup to Downloads/Receipts
3. The capture is put in a short line inside the extension, waiting for pickup
4. Your receipt service opens (or an open tab is reused), in the background if silent mode is on
5. A small script on the service page picks up the waiting receipt and clicks through the upload steps
6. The page reports back: the badge flashes OK or !, and the grab is marked in your recent list
7. If you turned them on, the tab closes and the backup file is deleted, only after a clean upload

## Install

1. Download this repo (green Code button, Download ZIP) and unzip it somewhere permanent.
2. Open chrome://extensions in Chrome.
3. Turn on Developer mode (top right).
4. Click Load unpacked and pick the folder.
5. Pin the icon: click the puzzle piece in the toolbar, then the pin.

The settings page opens when you install. Add your SparkReceipt forwarding email there only if you want the email draft choices. The automatic drop needs no setup at all.

## Use It

- Click the toolbar icon, then **Grab This Page**.
- Or right-click a page and choose **Send Page to SparkReceipt** (or Expensify, the menu follows your setting).
- Or right-click an image and choose **Send This Image to SparkReceipt**.
- Or press **Alt+Shift+S**.

Watch the toolbar badge: OK means the upload landed, ! means take a look at the tab (the Activity Log on the settings page says what happened). After Grab All Tabs, OK means every tab was grabbed, and ! means at least one wasn't.

## Settings

Click **Settings** in the popup, or right-click the toolbar icon and choose Options.

- **Send Receipts To:** SparkReceipt or Expensify. You can also switch this right in the popup.
- **After Grabbing the Page:** automatic drop (the default), open the service so you can drop the file in yourself, a Gmail draft, a draft in your mail app, or just save the file.
- **Save the Page As:** a stitched full-page image (the default) or a quick screenshot of what's on screen.
- **Extras:** open the folder after saving, close the service tab when the upload finishes, delete the backup file when the upload finishes, and Silent Mode. All off by default.

## Activity Log

The settings page keeps a running record of what the extension did: grab started, file saved, page cut short, service opened, upload confirmed or missed (with the reason), tab closed, backup deleted, and settings changed.

- It lives in the extension's storage on your computer. Nothing is sent anywhere.
- It records site names only. Never page contents, file contents, page titles, or full web addresses.
- It keeps the newest 500 steps and drops the oldest.
- **Export CSV** and **Export JSON** save it as a file. **Clear Log** empties it.

## How the Auto Drop Works

Neither service has a public upload API, so the extension works each web app the way a person would.

- **SparkReceipt:** a script on app.sparkreceipt.com opens Add documents, picks the document type, hands the file to their upload field, and clicks Confirm.
- **Expensify:** a script on new.expensify.com clicks Scan receipt, drops your file onto their upload zone, and clicks Create expense.

Both flows were last verified against the live apps in August 2026. Version 4.1.1 kept the same buttons, clicks and timings but changed a few details around them (listed in the changelog), and it wasn't checked against the live apps again. If either service redesigns its upload screens, the drop may miss until the extension is updated. The backup file in Downloads/Receipts always works in the meantime.

## Permissions, in Plain English

No debugger permission and no blanket site access.

- **activeTab and scripting:** capture the page you asked to grab, stitch long pages, and fetch an image you right-clicked.
- **Site access, two sites only:** app.sparkreceipt.com and new.expensify.com, where the extension drops your files in.
- **Optional access to all sites:** asked for once, only if you use Grab All Tabs (Chrome won't capture background tabs without it). Say no and everything else still works.
- **downloads:** save the backup copy to Downloads/Receipts, and delete it if you turn that extra on.
- **storage and unlimitedStorage:** remember your settings, Recent Grabs, and the Activity Log, and hold a large image while it waits to upload.
- **contextMenus:** the two right-click menu items.

## Privacy

Nothing is collected. The only thing that leaves your computer is the upload to your own SparkReceipt or Expensify account. The full policy is in [PRIVACY.md](PRIVACY.md), and the same text ships with the extension as privacy.html.

## Security

- Zero dependencies. No npm packages in the extension, no build step, no supply chain. What you read in this repo is exactly what runs.
- No remote code, no analytics, no telemetry, no servers.
- Minimal permissions by design. The one broad permission is optional and off until you use Grab All Tabs.
- Grabs can only be started from the extension's own popup, menus, and shortcut. A script on a web page can't start one.
- The Activity Log strips web addresses down to the site name before anything is written.

## Tests

The tests use Node's built-in test runner. There's nothing to install.

```
node --test test/
```

They cover the manifest and its permissions, the service worker's queue, settings, and Recent Grabs logic, the Activity Log, the order of clicks in both upload scripts (against stand-in pages), the pages' labels and local-only files, color contrast in light and dark mode, and the wording rules for this repo. They run on GitHub for every pull request that changes code.

The tests can't sign in to SparkReceipt or Expensify, so they don't prove the live sites still match. That part is checked by hand.

Three optional helpers in `tools/` need Python Playwright with Chromium:

- `python3 tools/screenshots.py` retakes every screenshot in docs/screenshots.
- `python3 tools/ui_check.py` clicks through the popup and settings page with a stand-in for Chrome's extension features.
- `python3 tools/mock_flow_check.py` loads the real extension in Chromium and runs both upload flows against local stand-in pages.

## What's New

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version. The latest is 4.1.1: bug fixes for Recent Grabs, the upload queue, timeouts, and a few smaller things.

## Notes

- SparkReceipt grabs land as the document type you picked in the popup (Expense or Receipt by default). Expensify grabs land as scanned expenses.
- Expensify rejects files under 240 bytes, which never matters for real receipts.
- Gmail and mail app drafts address themselves to the right place for each service: your SparkReceipt forwarding address, or receipts@expensify.com (send from your Expensify sign-in email).
- Very long pages are captured up to 12 screens tall. When a page is cut short, the Activity Log says so, the note on the SparkReceipt or Expensify page mentions it, and with the other After Grabbing the Page choices the toolbar badge shows CUT instead of OK.
- Chrome's own pages and the Chrome Web Store can't be captured.
- Because it's loaded unpacked, Chrome may occasionally remind you about developer mode extensions. You can dismiss that.

## License

Source available for transparency and personal use. No republishing to extension stores, no redistribution. Full terms are in [LICENSE](LICENSE).

Built by Harrison Ward Technology.
