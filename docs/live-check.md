# Live Check

The automatic drop works by finding buttons on the SparkReceipt and Expensify web apps. If either site redesigns its upload screens, the drop can start missing. The live check tells you before that happens.

Run it once a month, and any time a drop misses for no clear reason.

## What It Does

`tools/live_check.py` opens Chromium with Receipt Sender loaded and walks only the safe first steps of each upload flow:

- **SparkReceipt:** opens Add documents, looks for the four document types, picks Expense or receipt, looks for the upload field and the Confirm button, then closes the window.
- **Expensify:** clicks Scan receipt, looks for the drag and drop zone, then closes the panel.

It takes a screenshot at every step and writes a plain English report.

## What It Never Does

- It never uploads anything. No file is handed to either site and nothing is dropped.
- It never clicks Confirm, Create expense, or any other button that finishes an upload.
- It never signs in for you and never sees your sign-in details. You sign in yourself, by hand, the first time.

## Set It Up on Windows

You only do this once.

1. **Install Python.** Get Python 3.12 or newer from [python.org/downloads](https://www.python.org/downloads/). On the first screen of the installer, check **Add python.exe to PATH**, then click Install Now.
2. **Open PowerShell.** Press the Windows key, type PowerShell, and press Enter.
3. **Install Playwright and its Chromium:**

   ```powershell
   py -m pip install playwright
   py -m playwright install chromium
   ```

4. **Go to your copy of this repo,** for example:

   ```powershell
   cd "$env:USERPROFILE\Documents\Spark-Receipt-Sender"
   ```

5. **Do the first run with the window showing,** so you can sign in:

   ```powershell
   py tools\live_check.py --profile "$env:USERPROFILE\ReceiptSenderCheck" --headed
   ```

   A Chromium window opens on SparkReceipt. Sign in the way you normally do. The check waits up to 5 minutes, then carries on by itself. It does the same for Expensify.

   If Google refuses to sign in ("This browser or app may not be secure"), sign in with your email address and the code the site sends you instead.

The `--profile` folder is this check's own browser profile. It keeps you signed in to both sites between runs, so treat it like a signed-in browser: keep it on your own PC, don't share it, and don't point it at your everyday Chrome profile.

## Run It Each Month

```powershell
cd "$env:USERPROFILE\Documents\Spark-Receipt-Sender"
py tools\live_check.py --profile "$env:USERPROFILE\ReceiptSenderCheck"
```

This runs without a window. If it says you aren't signed in, or a site seems to block it, run it again with `--headed`.

To check one site, add `--only sparkreceipt` or `--only expensify`.

A calendar reminder on the first of each month works well.

## Read the Report

Each run saves a folder under `live-check-results` (named for the date and time) with:

- `report.html`, the report with every screenshot. Double-click it to open it in your browser.
- `report.txt`, the same report as plain text.
- One screenshot for each step.

Each step is marked:

| Mark | Meaning |
|---|---|
| PASS | Found, exactly where the extension looks. |
| LOOK | Found, but only by the extension's backup way of looking. It still works, and it's an early sign the site is changing. |
| NOTE | For your information. Nothing to do. |
| FAIL | The extension won't find this. Drops on that site will miss until the extension is updated. |

## If Something Fails

1. Open the screenshot for the failed step and compare it with what you see when you add a receipt by hand.
2. Until it's fixed, grabs still save a backup copy to Downloads/Receipts. Drag that file into the site yourself.
3. Update the matching selector or button text in `sparkdrop.js` or `expensifydrop.js`, and the same entry in `tools/live_selectors.json` (a test makes sure the two match).
4. Run the check again, then try a real grab.

## Try It Without Signing In

`--dry-run` runs the same steps against the local stand-in pages that `tools/mock_flow_check.py` uses, so no account or internet is needed. It's a test of the check itself:

```powershell
py tools\live_check.py --dry-run
```

The dry run needs the `openssl` command to make a throwaway local certificate. Git for Windows includes one in `C:\Program Files\Git\usr\bin`. Add that folder to your PATH if `openssl version` doesn't work in PowerShell.
