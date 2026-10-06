# Privacy Policy

Receipt Sender, last updated October 2026.

This is the same policy as privacy.html, in a form GitHub shows nicely.

## The Short Version

Receipt Sender doesn't collect, send, or sell any of your data. Everything happens on your computer, and the only place a receipt goes is the receipt service you chose.

## What the Extension Does With Your Data

When you grab a page or image, the extension captures it in your browser, saves a copy to your own Downloads folder, and uploads it straight from your browser to the receipt service you chose (SparkReceipt or Expensify), using the account you're already signed in to. It never passes through a server that belongs to this extension, because this extension has no servers.

## What Is Stored, and Where

- **Your settings** (the service, the capture format, the extras, and your SparkReceipt forwarding email if you add one) are kept in Chrome's extension storage. If you're signed in to Chrome with sync on, Chrome copies them to your other devices.
- **Recent Grabs**, a short list of your last 10 grabs (site name, service, and how it went), is kept on this device only.
- **The Activity Log**, a record of up to 500 steps the extension took (the time, the step, the site name, the service, and a short note such as why a grab didn't finish), is kept on this device only. It never holds page contents, file contents, or full web addresses. You can export it or clear it on the settings page whenever you like.
- **Receipts waiting to upload** are held briefly in extension storage on this device. The image is removed as soon as the service page takes it, and anything still waiting after 10 minutes is cleared.
- **A backup copy of each grab** is saved to Downloads/Receipts on your computer. Its name includes the site's name and the date and time of the grab, for example amazon.com-2026-10-04-1932-a7k2.jpg, so anyone who can see that folder can see which sites you saved receipts from. It stays there until you delete it, or until the extension deletes it for you if you turn that extra on.

## What We Never Collect

No analytics, no tracking, no telemetry, no cookies, no fingerprinting, no advertising identifiers, and no browsing history. The developer gets nothing from your use of this extension.

## Permissions, Explained

- **activeTab and scripting**: capture the page you're looking at when you ask for a grab.
- **downloads**: save the backup copy to Downloads/Receipts.
- **storage and unlimitedStorage**: remember your settings, Recent Grabs, and the Activity Log, and hold a large full-page image while it waits to upload.
- **contextMenus**: the two right-click menu items.
- **Site access to app.sparkreceipt.com and new.expensify.com**: place your receipt into the service's own upload screen.
- **Optional access to all sites**: only asked for if you use Grab All Tabs, because Chrome requires it to capture tabs in the background. You can say no and everything else still works.

## Other Companies

Uploads go to SparkReceipt or Expensify under your own account. What they do with your receipts is covered by their privacy policies, not this one. If you choose a Gmail or mail app draft, that draft opens in your own mail and includes the page title and the site name (not the full web address) so you know which receipt it is.

## Contact

Questions? Open an issue on this repository.
