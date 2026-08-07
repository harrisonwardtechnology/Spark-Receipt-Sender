# Send to SparkReceipt

![Version](https://img.shields.io/badge/version-2.4.0-0d9488) ![Platform](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4) ![Status](https://img.shields.io/badge/status-working-188038)

A Chrome extension that turns any web page or image into a receipt inside [SparkReceipt](https://sparkreceipt.com) with one click. No dragging, no forwarding, no babysitting.

Built because SparkReceipt has no browser extension and the old Expensify one is dead. This fills the gap.

## What it does

One click on a receipt page and the extension grabs the whole page as a PDF, opens SparkReceipt, walks their own upload flow (Add documents, Expense or receipt, attach, Confirm), and the scan starts. A small note in the corner narrates each step. A backup copy of every grab lands in Downloads/SparkReceipt.

## Features

| Feature | How |
|---|---|
| Grab a whole page as PDF | Toolbar button, right click, or Alt+Shift+S |
| Grab just an image | Right click any image, Send this image to SparkReceipt |
| Auto drop into SparkReceipt | Walks the real Add documents flow and hits Confirm for you |
| Silent mode | Runs in a background tab so you never leave your page |
| Auto close the tab | Optional, waits for the upload to finish first |
| Auto delete the backup file | Optional, only after a fully successful drop |
| GUID file names | Every grab saves as a unique id, no name collisions |
| Fallback safety net | Any miss leaves the tab open and the file in Downloads/SparkReceipt |

## Install

1. Download this repo (green Code button, Download ZIP) and unzip it somewhere permanent
2. Open chrome://extensions in Chrome
3. Turn on Developer mode (top right)
4. Click Load unpacked and pick the folder
5. Pin the icon: puzzle piece in the toolbar, then the pin

The settings page opens on install. Add your SparkReceipt forwarding email there only if you want the email options. The automatic drop needs no setup at all.

## Use it

- Click the toolbar icon, then **Grab this page**
- Or right click a page and pick **Send page to SparkReceipt**
- Or right click an image and pick **Send this image to SparkReceipt**
- Or press **Alt+Shift+S**

Watch the toolbar badge: OK means the upload landed, ! means look at the tab.

## Settings

Right click the toolbar icon, choose Options.

- **After grabbing**: automatic drop (default), open SparkReceipt for a manual drop, Gmail draft, your mail app, or just save the file
- **Format**: full page PDF (default) or a screenshot of the visible part
- **Extras**: pop open the folder after saving, close the SparkReceipt tab when the upload finishes, delete the backup file when the upload finishes, silent background mode. All off by default.

## How the auto drop works

SparkReceipt has no public API and no global drop zone. The upload input only exists after two clicks inside their app. So the extension does those clicks: a content script on app.sparkreceipt.com opens Add documents, picks Expense or receipt, hands the file to the hidden input in their dropzone, then clicks Confirm. Selectors were verified against the live app in August 2026. If SparkReceipt redesigns, the drop may miss until the selectors are updated, and the backup file always works in the meantime.

## Permissions, in plain English

- **debugger**: how Chrome prints a full page to PDF. Attached for about a second per grab, then released
- **site access**: lets the content script drop files into app.sparkreceipt.com and lets the extension download the image you right click from any site
- **downloads, storage, contextMenus, activeTab**: the boring plumbing

## Notes

- Everything lands in SparkReceipt as an Expense or receipt document. Change the type inside SparkReceipt if something should be an invoice instead
- Chrome pages and the Chrome Web Store cannot be captured
- Loaded unpacked, so Chrome may occasionally nudge about developer mode extensions. Dismiss it
