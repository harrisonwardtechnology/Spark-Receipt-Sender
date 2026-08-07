# Receipt Sender

![Version](https://img.shields.io/badge/version-3.0.0-0d9488) ![Platform](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4) ![Status](https://img.shields.io/badge/status-working-188038)

A Chrome extension that turns any web page or image into a receipt inside [SparkReceipt](https://sparkreceipt.com) or [Expensify](https://expensify.com) with one click. No dragging, no forwarding, no babysitting. Pick the service in the popup, hit the button, done.

Built because SparkReceipt has no browser extension and Expensify killed theirs. This fills both gaps.

## What it does

One click on a receipt page and the extension grabs the whole page as a PDF, opens your receipt service, walks its own upload flow, and the scan starts. SparkReceipt: Add documents, Expense or receipt, attach, Confirm. Expensify: Scan receipt, drop on the upload zone, Create expense. A small note in the corner narrates each step. A backup copy of every grab lands in Downloads/Receipts.

## Features

| Feature | How |
|---|---|
| Grab a whole page as PDF | Toolbar button, right click, or Alt+Shift+S |
| Grab just an image | Right click any image, Send this image to SparkReceipt |
| Two services | SparkReceipt and Expensify, switchable per grab in the popup |
| Auto drop | Walks each service's real upload flow and confirms for you |
| Silent mode | Runs in a background tab so you never leave your page |
| Auto close the tab | Optional, waits for the upload to finish first |
| Auto delete the backup file | Optional, only after a fully successful drop |
| GUID file names | Every grab saves as a unique id, no name collisions |
| Fallback safety net | Any miss leaves the tab open and the file in Downloads/Receipts |

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
- **Format**: full page PDF (default) or a screenshot of the visible part
- **Extras**: pop open the folder after saving, close the SparkReceipt tab when the upload finishes, delete the backup file when the upload finishes, silent background mode. All off by default.

## How the auto drop works

Neither service has a public upload API, so the extension drives each web app the way a human would. SparkReceipt: a content script opens Add documents, picks Expense or receipt, hands the file to their hidden input, clicks Confirm. Expensify: a content script hits the Scan receipt button on new.expensify.com, simulates a drag and drop of your file onto their upload zone, then clicks Create expense. Both flows were verified against the live apps in August 2026. If SparkReceipt redesigns, the drop may miss until the selectors are updated, and the backup file always works in the meantime.

## Permissions, in plain English

- **debugger**: how Chrome prints a full page to PDF. Attached for about a second per grab, then released
- **site access**: lets the content scripts drop files into app.sparkreceipt.com and new.expensify.com, and lets the extension download the image you right click from any site
- **downloads, storage, contextMenus, activeTab**: the boring plumbing

## Notes

- SparkReceipt grabs land as Expense or receipt documents, Expensify grabs land as scanned expenses. Change types inside the apps if needed
- Expensify rejects files under 240 bytes, which never matters for real receipts
- Gmail and mail app drafts address themselves to the right place per service: your SparkReceipt forwarding address, or receipts@expensify.com (send from your Expensify login email)
- Chrome pages and the Chrome Web Store cannot be captured
- Loaded unpacked, so Chrome may occasionally nudge about developer mode extensions. Dismiss it
