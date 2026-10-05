# What's New

The newest version is at the top.

## 4.2.0, October 2026

Readable file names, a live check of both sites, and what's needed for a private Chrome Web Store listing. The upload screens are walked exactly as in 4.1.1.

### New

- **Readable File Names.** Backup copies in Downloads/Receipts are now named for the site and the time you grabbed them, like `amazon.com-2026-10-04-1932-a7k2.jpg`, instead of a long random ID. Image grabs use the page the image was on. Pages that aren't web sites are named `receipt-...`. The short code at the end keeps two grabs in the same minute from colliding. The name SparkReceipt and Expensify see for the upload is the same one, and the privacy policy now says the file names include the site.
- **Live Check.** `tools/live_check.py` opens SparkReceipt and Expensify in a browser profile you've signed in to by hand and checks that every button and field the extension uses is still there, with a screenshot of each step and a plain English report. It never uploads anything, never clicks Confirm or Create expense, and never signs in for you. Run it monthly. Setup on Windows is in docs/live-check.md.
- **Chrome Web Store Prep.** `tools/package.py` builds a clean upload zip with only the files the extension runs. The `store` folder has the listing text, a justification for every permission, data use answers, 1280x800 screenshots, a small promo tile, and the store icon. docs/web-store.md walks through publishing a private listing.

### Changed

- **License.** It now says plainly that the copyright holder's own store listing is allowed and is the only official one. Republishing by anyone else is still not allowed.

### Under the Hood

- `tools/live_selectors.json` lists the selectors and button wording the live check looks for. A new test makes sure it matches `sparkdrop.js` and `expensifydrop.js` both ways, so the content scripts didn't change.
- New tests for the file name builder (international site names, IP addresses, file pages, very long names, no site at all) and for the store zip's file list.
- `tools/screenshots.py` also makes the store images.

## 4.1.1, October 2026

Bug fixes. The upload screens are walked with the same buttons, clicks and timings as before, with two exceptions noted below.

### Fixed

- **Recent Grabs no longer gets stuck on Working.** When a service page reported back right after taking a receipt, the result could be lost. The extension now handles those messages one at a time, in order, so the upload is recorded and the image is cleared from storage.
- **Expensify misses are reported as misses.** If Expensify took the file but never showed Create expense, the extension used to call it a success. Now the tab stays open, the backup file is kept, and the badge shows "!".
- **One service's receipt no longer blocks the other's.** Each service page now takes the oldest receipt meant for it, so a waiting Expensify receipt can't hold up SparkReceipt drops, or the other way around.
- **Pages are put back after a failed full-page grab.** Hidden headers and the scroll position are restored even if a capture fails partway.
- **Fast downloads aren't missed.** A backup file that finished (or failed) before the extension started listening is now noticed right away.
- **Waiting receipts don't linger.** Anything still waiting after 10 minutes is cleared, a receipt a page took is cleared within 3 minutes, and the same cleanup runs when the extension starts and on every grab. The privacy policy now says exactly that.
- **SparkReceipt only uses its own upload field.** If the usual drop zone isn't there, the extension uses a file field inside the add-document window or counts it as a miss. It never picks some other file field on the page.
- **The "..." badge can't hang forever.** If a service page says nothing for 5 minutes while receipts wait, they're marked as missed, the Activity Log says "No word back", and the badge shows "!".
- **Grab All Tabs tells the truth.** It shows OK only when every tab made it and "!" if any didn't, with the count in the Activity Log.
- **The corner note's close button works from the keyboard.** Tab to it and press Enter or Space. Screen readers hear "Close".
- **Email drafts name the site, not the full web address.** Order numbers and sign-in tokens in a page's address no longer end up in a draft. The privacy policy is updated to match.
- **Long pages say when they're cut short.** Pages taller than 12 screens are still capped, but now the Activity Log notes it, the note on the service page mentions it, and with the other After Grabbing the Page choices the badge shows "CUT".

### Changed in the Upload Flows

- SparkReceipt: the backup lookup for the upload field now only looks inside the add-document window. The main lookup is unchanged.
- Expensify: no Create expense button after 20 seconds now counts as a miss instead of a success.
- Both: the page reports the result only after the extension confirms it took the receipt, and names the receipt and service it's talking about.

## 4.1.0, October 2026

A standards refresh. The upload flows work exactly as they did in 4.0.0.

### New

- **Activity Log.** The settings page now keeps a timestamped record of every step: grab started, file saved, service opened, upload confirmed or missed (with the reason), tab closed, backup deleted, and settings changed. It stays on your computer, holds site names only, keeps the newest 500 steps, and you can export it as CSV or JSON or clear it.
- **Dark Mode.** The popup, settings page, and privacy page follow your device setting.
- **A Fresh Look.** Cleaner layout, the system font, larger click targets, and a strip of receipt paper for Recent Grabs in the popup.
- **Automated Tests.** More than 100 checks run with Node's built-in test runner, and on GitHub for every pull request that changes code. No packages to install.

### Better

- Everything works from the keyboard, with a clear focus outline. Screen readers hear status messages and what each Recent Grabs mark means.
- Text and colors meet WCAG AA contrast in light and dark mode. Motion is reduced when your device asks for that.
- The settings page explains each choice in a short line under its name, and tells you if an email draft choice still needs your forwarding address.
- The popup lets you know when Chrome won't allow a page to be captured.
- Recent Grabs shows the full service name.
- Wording follows one style: Title Case for names and buttons, "sign in" for accounts, and plain English throughout.
- The privacy policy now lists everything that's stored, including the Activity Log and the backup files.

### Safer

- A script running on a web page can no longer ask the extension to start a grab. Only the popup, the right-click menus, and the keyboard shortcut can.
- Activity Log notes are scrubbed before they're saved: web addresses become site names, and email addresses and file data are removed.
- Links that open in a new tab no longer pass along where you came from.

### Under the Hood

- New files: `activitylog.js` (the log), `theme.css` (shared colors and type), `test/` (tests), and `tools/` (screenshot and check helpers).
- A GitHub Actions workflow runs the tests, and Dependabot keeps the workflow's actions current.
- Still zero dependencies in the extension, no build step, and no remote code.

## 4.0.0, August 2026

- Full-page grabs became a stitched image instead of a PDF, so the debugger permission is gone.
- Site access narrowed to the two service sites. Access to all sites became optional, asked for only when you use Grab All Tabs.
- New: Grab All Tabs, which sends every tab in the window through the queue.
- New: Recent Grabs in the popup, showing your last 10 grabs.
- New: a type picker for SparkReceipt (expense, invoice, statement, or other).
- New: a privacy policy and a source-available license.

## 3.0.0, August 2026

- Renamed from Send to SparkReceipt to Receipt Sender.
- New: Expensify support, with a service switch in the popup.
- Email drafts address themselves to the right place for each service.
- Backup copies moved from Downloads/SparkReceipt to Downloads/Receipts.

## 2.4.0, August 2026

The first version in this repository, named Send to SparkReceipt.

- Grab a whole page as a PDF from the toolbar, a right-click, or Alt+Shift+S.
- Grab just an image with a right-click.
- Automatic drop into SparkReceipt.
- Silent mode, automatic tab closing, and automatic backup file cleanup.
- Unique file names, and a backup copy of every grab.

Versions before 2.4.0 aren't in this repository's history.
