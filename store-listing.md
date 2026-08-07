# Chrome Web Store listing kit

Everything you need to paste into the developer dashboard at chrome.google.com/webstore/devconsole.

## Name

Receipt Sender for SparkReceipt and Expensify

## Summary (132 characters max)

One click sends any page or image to SparkReceipt or Expensify as a receipt. Captured, uploaded, and filed for you automatically.

## Description

Stop downloading receipts and dragging them into your expense app. Receipt Sender does the whole trip in one click.

WHAT IT DOES

Click the button on any order confirmation, invoice, or receipt page. The extension captures the full page as an image, opens SparkReceipt or Expensify, walks the app's own upload flow, and confirms the upload. Your receipt is scanning before you can switch tabs. A backup copy of every capture is saved to Downloads/Receipts on your computer.

FEATURES

- Works with SparkReceipt and Expensify, switch per grab in the popup
- Full page capture, stitched top to bottom, or a quick visible screenshot
- Right click any image to send just that image, great for receipts inside emails
- Grab all tabs in a window at once after a day of shopping
- Silent mode does everything in a background tab so you never leave your page
- Optional cleanup: close the tab and delete the backup file after a confirmed upload
- Recent grabs list with pass or fail marks
- Document type picker for SparkReceipt (expense, invoice, statement, other)

PRIVACY

No servers, no accounts, no tracking. Captures go straight from your browser to your own SparkReceipt or Expensify session. See the privacy policy for the full plain English version.

NOT AFFILIATED with SparkReceipt or Expensify. This is an independent tool that automates their web apps the same way you would by hand. If either app redesigns, the automatic drop may pause until the extension updates, and your backup file in Downloads/Receipts always works.

## Category

Workflow & Planning (or Productivity > Tools)

## Language

English

## Single purpose description (for the review form)

This extension has one purpose: capturing the current page or a chosen image as a receipt file and uploading it into the user's expense service (SparkReceipt or Expensify). All features (capture, save, upload, cleanup) serve that single receipt-filing purpose.

## Permission justifications (for the review form)

- activeTab: capture the page the user explicitly asked to grab, via toolbar click, context menu, or shortcut
- scripting: read page dimensions and scroll position on the active tab to stitch a full page capture, and to fetch the image a user right clicked
- downloads: save a backup copy of each capture to the user's Downloads/Receipts folder
- storage / unlimitedStorage: user settings, a 10 item history list, and the temporary upload queue (captures can be several MB)
- contextMenus: the two right click menu items (send page, send image)
- Host access app.sparkreceipt.com and new.expensify.com: the content scripts that place the captured file into each service's own upload flow
- Optional host access (all sites): requested at runtime only if the user clicks "Grab all tabs", because capturing background tabs requires site access beyond activeTab. Declining leaves every other feature working.

## Privacy practices tab

- Single purpose: yes
- Remote code: none
- Data collection: none of the listed categories are collected. The extension has no servers and sends nothing to the developer.
- Privacy policy URL: host privacy.html somewhere public (see note below)

## Assets you still need

- Screenshots: 1280x800 or 640x400, at least one. Suggest: the popup over a receipt page, the SparkReceipt drop with the banner showing, the settings page. Take these after installing the store build.
- Small promo tile 440x280 (optional but helps)
- Privacy policy URL: the repo's privacy.html works once the repo is public (raw.githack or GitHub Pages), or paste it into any free page host. The URL just has to be publicly reachable.

## Publishing steps

1. Register at chrome.google.com/webstore/devconsole and pay the one time fee
2. Upload receipt-sender-store.zip (manifest at the zip root, this is the one I built for you)
3. Fill the listing with the text above, add screenshots
4. Set visibility: Public, or Unlisted if you only want link-holders to install
5. Submit for review. Expect a few days. The optional all-sites permission may add review time, the justifications above are written to answer exactly what reviewers ask
