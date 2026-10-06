# Chrome Web Store Listing

Everything to paste into the Chrome Web Store developer dashboard for Receipt Sender 4.2.0. Step by step publishing is in [docs/web-store.md](../docs/web-store.md).

The text in the boxes below is ready to copy as is.

## Store Listing Tab

### Name

Comes from manifest.json:

```
Receipt Sender
```

### Summary

Comes from the `description` in manifest.json (108 characters, the limit is 132):

```
One click sends any page or image to SparkReceipt or Expensify as a receipt, uploaded for you automatically.
```

### Description

```
Turn any web page or image into a receipt in SparkReceipt or Expensify with one click. No dragging, no forwarding, no babysitting.

SparkReceipt has no browser extension and Expensify retired theirs. Receipt Sender fills both gaps.

HOW IT WORKS
Click the toolbar button on an order confirmation or invoice and Receipt Sender:
1. Captures the whole page as one image (or just the image you right-clicked).
2. Saves a backup copy to Downloads/Receipts, named for the site and the time.
3. Opens SparkReceipt or Expensify, where you're already signed in, and walks its own upload screens for you.

WAYS TO GRAB
- Click Grab This Page in the toolbar popup
- Right-click a page or an image
- Press Alt+Shift+S
- Grab every tab in the window at once

FEATURES
- Two services, switchable for each grab
- SparkReceipt document types: expense, income, statement, or other
- Silent Mode does the upload in a background tab
- Optional extras: close the service tab and delete the backup file when the upload finishes
- Recent Grabs shows your last 10 grabs, marked uploaded, saved, or missed
- Activity Log keeps a record of every step on your computer, with CSV and JSON export
- Gmail and mail app draft options if you prefer email
- Light and dark mode

PRIVATE BY DESIGN
- Nothing is collected. No analytics, no tracking, no servers.
- Receipts go only to the SparkReceipt or Expensify account you're signed in to.
- Site access is limited to app.sparkreceipt.com and new.expensify.com. Access to all sites is optional, asked for only if you use Grab All Tabs.
- No remote code. The source is published so you can check every line.

Receipt Sender isn't affiliated with SparkReceipt or Expensify.

Built by Harrison Ward Technology.
```

### Category

Productivity. If the dashboard asks for a more specific category under Productivity, pick **Workflow & Planning** (or **Tools**).

### Language

English (United States).

### Graphic Assets

| Asset | File |
|---|---|
| Store icon, 128x128 | `store/icon-128.png` |
| Screenshot 1, 1280x800 | `store/screenshots/1-popup-over-settings.png` |
| Screenshot 2, 1280x800 | `store/screenshots/2-popup.png` |
| Screenshot 3, 1280x800 | `store/screenshots/3-settings-and-activity-log.png` |
| Screenshot 4, 1280x800 | `store/screenshots/4-privacy.png` |
| Small promo tile, 440x280 | `store/promo-small-440x280.png` |

Leave the marquee promo tile empty. It's only used if Google features the extension.

All of these are made by `python3 tools/screenshots.py --store` from sample data. No real receipts or accounts appear in them.

### Additional Fields

- **Official URL:** leave as None unless you've verified a domain in Search Console.
- **Homepage URL:** `https://github.com/HarrisonWard/Spark-Receipt-Sender` (if the repository is public), or a page on your own site.
- **Support URL:** the repository's Issues page, or an email page on your site.

## Privacy Practices Tab

### Single Purpose

```
Receipt Sender does one thing: it sends a web page or image the user chooses to the user's own receipt service (SparkReceipt or Expensify) as a receipt. It captures the page or image, saves a backup copy to the Downloads folder, and places the file into the receipt service's own upload screen in the user's signed-in account.
```

### Permission Justifications

Paste each one into the box with the same name.

**activeTab**

```
When the user clicks the toolbar button, a right-click menu item, or the keyboard shortcut, activeTab lets the extension capture that one tab as an image. The extension never reads or captures a tab the user didn't ask for.
```

**scripting**

```
Used only on the tab the user asked to grab: to measure the page and scroll it so a long page can be captured as one stitched image (fixed headers are hidden during capture and put back after), and to fetch the image the user right-clicked from inside that page.
```

**downloads**

```
Every grab saves a backup copy to Downloads/Receipts so the receipt is never lost, even if an upload misses. If the user turns on the "Delete the Backup File When Done" option, the extension deletes that one file after a successful upload.
```

**storage**

```
Remembers the user's settings (which service, capture format, extras, and an optional forwarding email), the Recent Grabs list of the last 10 grabs, and the Activity Log. The Recent Grabs list and the Activity Log stay on the device.
```

**unlimitedStorage**

```
A full-page capture of a long receipt can be several megabytes. The image is held in local extension storage for the moment between capturing it and the receipt service's page picking it up, then deleted. Without this, large receipts could fail to queue.
```

**contextMenus**

```
Adds two right-click items: "Send Page to SparkReceipt (or Expensify)" on pages and "Send This Image to SparkReceipt (or Expensify)" on images.
```

**Host permissions** (app.sparkreceipt.com and new.expensify.com, and the content scripts that run there)

```
The extension uploads receipts by working the receipt service's own web app in the user's signed-in account, because neither service offers a public upload API. Content scripts run only on app.sparkreceipt.com and new.expensify.com. They pick up the receipt the user just grabbed, open the service's own add receipt screen, place the file into its upload field, and confirm. They do nothing when no receipt is waiting. No other sites are accessed by default.
```

**Optional host permission** (`<all_urls>`, if the dashboard asks)

```
Requested at runtime only if the user clicks Grab All Tabs, which captures every tab in the window. Chrome requires all-sites access to capture tabs other than the active one. If the user declines, every other feature still works. It is never requested on install.
```

### Remote Code

**No, I am not using remote code.** All JavaScript is included in the package. Nothing is loaded from the internet or evaluated at runtime.

### Data Usage

**What user data do you plan to collect from users now or in the future?** Leave every box unchecked.

Why: the extension has no servers and sends nothing to its developer. The page image goes from the user's browser into the receipt service's own upload screen, in the account the user signed in to, because the user asked for it. Settings, Recent Grabs and the Activity Log stay in Chrome's storage on the device.

A cautious option, if you'd rather leave no room for a reviewer's question: check **Website content** (the page image is handed to SparkReceipt or Expensify at the user's request). Either way, the three statements below stay true.

Then check all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy Policy URL

The policy is `privacy.html` (the same text as PRIVACY.md). It has to be on a public web page. Pick one:

| Option | URL | What it takes |
|---|---|---|
| Your own site (recommended) | for example `https://harrisonward.com/receipt-sender/privacy` | Upload privacy.html to your site. Works whether or not the repository is public, and stays put if the repository moves. |
| GitHub Pages | `https://harrisonward.github.io/Spark-Receipt-Sender/privacy.html` | Turn on Pages for the repository (Settings, Pages, deploy from the main branch, root folder). Needs the repository to be public on a free GitHub plan. |
| The file on GitHub | `https://github.com/HarrisonWard/Spark-Receipt-Sender/blob/main/PRIVACY.md` | No setup, but only works while the repository is public. |

The exact URL is your choice. Open it in a private window to make sure it loads without signing in before you paste it in.

## Distribution Tab

- **Payments:** free.
- **Visibility:** Private is recommended. See [docs/web-store.md](../docs/web-store.md) for Private compared with Unlisted.
- **Regions:** all regions, or just the United States.
