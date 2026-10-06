# Receipt Sender

![Version](https://img.shields.io/badge/version-4.0.0-0d9488) ![Platform](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4) ![Status](https://img.shields.io/badge/status-working-188038)

A Chrome extension that turns any web page or image into a receipt inside [SparkReceipt](https://sparkreceipt.com) or [Expensify](https://expensify.com) with one click. No dragging, no forwarding, no babysitting. Pick the service in the popup, hit the button, done.

Built because SparkReceipt has no browser extension and Expensify killed theirs. This fills both gaps.

## What It Does

Receipt Sender is for anyone who keeps their receipts in SparkReceipt or Expensify and is tired of the download, drag, and drop routine. Online orders, invoices, and payment confirmations mostly live on web pages, not in your inbox, so getting them into your receipt app usually means saving a file, finding it, and uploading it by hand.

This extension does all of that with one click. It takes a picture of the page you are on (the whole thing, top to bottom, not just what fits on screen), saves a backup copy to Downloads/Receipts, opens your receipt service, and clicks through the service's own upload screens for you. SparkReceipt: Add documents, pick the document type, attach, Confirm. Expensify: Scan receipt, drop the file on the upload zone, Create expense. A small note in the corner of the page tells you what it is doing at each step.

If anything goes sideways (you are logged out, the site changed, a button never shows up), nothing is lost. The backup file stays in Downloads/Receipts and the tab stays open so you can finish by hand. The toolbar badge shows OK when it worked and ! when you should take a look.

## Features

### Grabbing Receipts

- Grab the whole page as one tall image, stitched together from screenshots as it scrolls down
- Sticky headers and floating bars are hidden after the first screen so they do not repeat down the image
- Your scroll position is put back where it was when the grab is done
- Very long pages are capped at 12 screens tall
- Quick mode: grab only what is on screen instead of the full page
- If a full page grab fails for any reason, it falls back to a regular screenshot
- Right click any image to send just that image
- Image grabs try three ways in order: fetch it from inside the page (so logged in images work), fetch it directly if you granted all sites access, or crop it out of a screenshot
- Grab every tab in the current window at once, one after another, with the badge counting along (1/5, 2/5, and so on)
- Batch mode skips Chrome pages and your SparkReceipt and Expensify tabs

### Ways To Start A Grab

- Toolbar popup: **Grab this page** or **Grab all tabs in this window**
- Right click a page: **Send page to SparkReceipt** (or Expensify)
- Right click an image: **Send this image to SparkReceipt** (or Expensify)
- The right click menu wording updates to match whichever service you picked
- Keyboard shortcut: **Alt+Shift+S**

### Two Receipt Services

- SparkReceipt and Expensify, switchable per grab right in the popup or in Settings
- SparkReceipt grabs can be filed as Expense or receipt, Income or invoice, Bank or credit card statement, or Other document
- The type picker only shows up in the popup when SparkReceipt is selected
- The popup spells out exactly what will happen before you click (for example, "Saves this page as a full page image then drops it into SparkReceipt for you.")

### Automatic Drop

- Clicks through each service's real upload screens, the same way you would
- Reuses an already open SparkReceipt or Expensify tab instead of piling up new ones
- Logged out? It waits up to 3 minutes for you to log in, then carries on
- Gives up cleanly if a step never appears (about a minute for SparkReceipt, a bit longer for Expensify) and tells you to drag the file from Downloads/Receipts
- If the file attaches but the last button cannot be found, the note tells you to finish that one click yourself
- Grabs waiting in line are handled one after another through the same tab
- Anything left waiting more than 10 minutes is dropped from the line so stale grabs do not show up later
- A colored note in the corner of the service page narrates each step, and can be closed with the x

### After The Upload

- Silent mode: the drop runs in a background tab so you never leave the page you are on
- Close the service tab automatically, but only after the upload has had time to finish
- Delete the backup file automatically, but only after a fully successful drop
- Toolbar badge: ... while working, OK in green when done, ! in red when something needs a look

### Other Ways To Send

- Open the service so you can drop the file in yourself
- Open a Gmail draft already addressed to the right place, with a subject line and a reminder to attach the file
- Open a draft in your regular mail app instead of Gmail
- Just save the file and do nothing else
- Email drafts go to your SparkReceipt forwarding address, or receipts@expensify.com for Expensify
- Optional: pop open the Downloads folder after saving, handy for dragging by hand

### Files And History

- Every grab saves a backup copy to Downloads/Receipts
- Each file gets a random unique name, so nothing ever overwrites anything
- Page grabs save as JPG (PNG when the page fits on one screen). Image grabs keep their original type where possible (JPG, PNG, WebP, GIF, HEIC)
- The popup lists your last 10 grabs with the site name, the service, and a mark for worked, failed, still working, or saved only

### Settings And Setup

- The Settings page opens by itself the first time you install
- The automatic drop needs no setup at all. The forwarding email is only needed for the email options
- Settings sync to your other computers through Chrome if you are signed in
- Settings from older versions carry over automatically

### Privacy And Permissions

- Only two sites get access: app.sparkreceipt.com and new.expensify.com
- All sites access is optional and only asked for when you first use Grab all tabs. Say no and everything else still works
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

1. Download this repo (green Code button, Download ZIP) and unzip it somewhere permanent
2. Open chrome://extensions in Chrome
3. Turn on Developer mode (top right)
4. Click Load unpacked and pick the folder
5. Pin the icon: puzzle piece in the toolbar, then the pin

The settings page opens on install. Add your SparkReceipt forwarding email there only if you want the email options. The automatic drop needs no setup at all.

## Use it

- Click the toolbar icon, then **Grab this page**
- Or right click a page and pick **Send page to SparkReceipt** (or Expensify, the menu follows your setting)
- Or right click an image and send just that image
- Or press **Alt+Shift+S**

Watch the toolbar badge: OK means the upload landed, ! means look at the tab.

## Settings

Right click the toolbar icon, choose Options.

- **Send receipts to**: SparkReceipt or Expensify, also switchable right in the popup
- **After grabbing**: automatic drop (default), open the service for a manual drop, Gmail draft, your mail app, or just save the file
- **Format**: stitched full page image (default) or a quick visible screenshot
- **Extras**: pop open the folder after saving, close the SparkReceipt tab when the upload finishes, delete the backup file when the upload finishes, silent background mode. All off by default.

## How the auto drop works

Neither service has a public upload API, so the extension drives each web app the way a human would. SparkReceipt: a content script opens Add documents, picks Expense or receipt, hands the file to their hidden input, clicks Confirm. Expensify: a content script hits the Scan receipt button on new.expensify.com, simulates a drag and drop of your file onto their upload zone, then clicks Create expense. Both flows were verified against the live apps in August 2026. If SparkReceipt redesigns, the drop may miss until the selectors are updated, and the backup file always works in the meantime.

## Permissions, in plain English

Store friendly since v4: no debugger permission, no blanket site access.

- **activeTab + scripting**: capture the page you asked to grab, stitch long pages, fetch a right clicked image
- **site access, two domains only**: app.sparkreceipt.com and new.expensify.com, where the content scripts drop your files in
- **optional all sites access**: asked once, only if you use Grab all tabs (background tabs cannot be captured without it). Decline and everything else still works
- **downloads, storage, contextMenus**: the boring plumbing

Privacy: nothing is collected, nothing leaves your machine except the upload to your own SparkReceipt or Expensify session. Full policy in privacy.html.

## Security

- Zero dependencies. No npm packages, no build step, no supply chain. What you read in this repo is exactly what runs
- No remote code, no analytics, no telemetry, no servers. See [PRIVACY.md](PRIVACY.md)
- Minimal permissions by design, and the one broad permission is optional and off until you use batch mode

## Notes

- SparkReceipt grabs land as Expense or receipt documents, Expensify grabs land as scanned expenses. Change types inside the apps if needed
- Expensify rejects files under 240 bytes, which never matters for real receipts
- Gmail and mail app drafts address themselves to the right place per service: your SparkReceipt forwarding address, or receipts@expensify.com (send from your Expensify login email)
- Chrome pages and the Chrome Web Store cannot be captured
- Loaded unpacked, so Chrome may occasionally nudge about developer mode extensions. Dismiss it

## License

Source available for transparency and personal use. No republishing to extension stores, no redistribution. Full terms in [LICENSE](LICENSE).
