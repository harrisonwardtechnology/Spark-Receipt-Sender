# Publishing to the Chrome Web Store

How to put Receipt Sender on the Chrome Web Store as your own private listing. The license allows this listing (yours, as the copyright holder) and no one else's.

Why bother when Load unpacked works? A store install updates itself, Chrome stops showing the developer mode reminder, and you don't have to keep the folder around.

## Private or Unlisted

The store has three visibility settings. Public is the normal, searchable kind. For this extension, choose between the other two.

| | Private | Unlisted |
|---|---|---|
| Who can install it | Only the people you name: your trusted testers list, or everyone in your Google Workspace domain | Anyone who has the link |
| Shows up in store search | No | No |
| Goes through Google's review | Yes | Yes |
| Good for | Just you, or a few people you pick | Sharing a link with clients or friends without managing a list |

**Recommendation: Private.** The extension works your own SparkReceipt and Expensify accounts and is licensed for personal use, so there's no reason for strangers to find it. Add the Google accounts you use Chrome with as trusted testers (or choose your Workspace domain if you publish from a Workspace account). Switching to Unlisted later is one setting and doesn't need a new listing.

## What You Need First

- A Google account to publish from. It's simplest to use the same account you sign in to Chrome with, or a Google Workspace account for Harrison Ward Technology if you want Private to mean "everyone in my domain".
- 2-Step Verification turned on for that account. The dashboard requires it.
- A public web address for the privacy policy. See the Privacy Policy URL section of [store/listing.md](../store/listing.md). This is the one choice only you can make.

## Step by Step

1. **Register as a developer (once).** Go to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole), sign in, accept the agreement, and pay the one-time $5 registration fee. Fill in the publisher name (for example Harrison Ward Technology) and verify the contact email. The dashboard also asks whether you're a trader under EU rules. As a business, the honest answer is probably yes, and your business contact details are then shown to EU visitors. Since this listing is private, choose whatever fits how you run Harrison Ward Technology.
2. **Build the zip.** In the repo folder:

   ```powershell
   py tools\package.py
   ```

   It writes `dist\receipt-sender-4.2.0.zip` with only the files the extension runs (manifest, scripts, pages, stylesheet, icons) and stops with a clear message if anything is missing or out of place.
3. **Upload it.** In the dashboard, click **New item** and choose the zip.
4. **Fill in the Store Listing tab** from [store/listing.md](../store/listing.md): description, category, language, the 128x128 icon, the four 1280x800 screenshots, and the small promo tile, all in the `store` folder.
5. **Fill in the Privacy Practices tab** from the same file: the single purpose, a justification for every permission and for site access, remote code (No), data usage, the three certifications, and your privacy policy URL.
6. **Choose visibility on the Distribution tab.** Pick Private and add your trusted testers (or your domain), or pick Unlisted.
7. **Click Submit for Review.**

## About the Review

- Reviews usually take a few days and can take longer.
- This extension may draw extra questions, because it has site access to two other companies' web apps, scripts that click through those apps for you, and an optional request for access to all sites. That's why the single purpose statement and the permission justifications in store/listing.md are spelled out. Paste them as written.
- If Google asks something, the answers are already in store/listing.md and in [PRIVACY.md](../PRIVACY.md): nothing is collected, nothing is sent to the developer, there's no remote code, and all-sites access is optional and only for Grab All Tabs.
- If the item is rejected, the email says which policy. Fix that one thing, rebuild the zip, upload it, and submit again.

## After It's Approved

1. Install it from your listing's link (for a Private listing, signed in to a trusted tester account).
2. **Remove the unpacked copy** at chrome://extensions. Chrome treats the two as different extensions, so with both installed you'd get two toolbar buttons, two sets of right-click items, and two claims on Alt+Shift+S.
3. Set up the store copy again. Settings, Recent Grabs and the Activity Log belong to each copy separately, so re-enter your SparkReceipt forwarding email if you use one. If you want to keep the old Activity Log, export it from the unpacked copy's settings page before you remove it.

## Shipping an Update

1. Change the code and raise the version in manifest.json, package.json, the README badge, and a new CHANGELOG entry. The tests check that they all match.
2. Run `py tools\package.py`.
3. In the dashboard, open the item, go to **Package**, upload the new zip, and submit for review.

Once it's approved, Chrome updates everyone's copy on its own, usually within a few hours. Nobody needs to reinstall.
