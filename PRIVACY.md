# Privacy Policy

Receipt Sender, last updated August 2026.

This is the same policy as privacy.html, in a form GitHub renders nicely.

## The short version

Receipt Sender does not collect, store, transmit, or sell any of your data. Everything happens on your computer.

## What the extension does with data

When you grab a page or image, the extension captures it locally in your browser, saves a copy to your own Downloads folder, and uploads it directly from your browser to the receipt service you chose (SparkReceipt or Expensify) using your own logged in session. The capture travels straight from your browser to that service. It never passes through any server belonging to this extension, because this extension has no servers.

## What is stored, and where

Your settings (chosen service, capture format, toggles) are stored in Chrome's extension storage on your device and, if you are signed into Chrome, synced by Chrome to your other devices. A short list of your last 10 grabs (site name, service, pass or fail) is stored locally on your device only. Receipts waiting to upload are held briefly in local extension storage and cleared after upload.

## What is never collected

No analytics, no tracking, no telemetry, no cookies, no fingerprinting, no advertising identifiers, no browsing history collection. The developer receives nothing from your use of this extension.

## Permissions, explained

- **activeTab and scripting**: capture the page you are looking at when you ask for a grab
- **downloads**: save the backup copy to Downloads/Receipts
- **storage**: remember your settings
- **contextMenus**: the right click menu items
- **Site access to app.sparkreceipt.com and new.expensify.com**: place your receipt into the service's upload flow
- **Optional access to all sites**: only requested if you use Grab all tabs, because capturing background tabs requires it. You can decline and everything else still works

## Third parties

Uploads go to SparkReceipt or Expensify under your own account. Their handling of your receipts is governed by their privacy policies, not this one.

## Contact

Questions: open an issue on this repository.
