# What's New

The newest version is at the top.

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
