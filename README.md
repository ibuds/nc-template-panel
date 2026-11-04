# NC Template Panel

A Chrome side panel with reply templates for NC staff. Click a template and its text goes straight into the chat box on WhatsApp Web, Instagram, Threads, TikTok or X. Nothing is sent for you: you still press Send yourself.

Works in Google Chrome and other Chromium browsers (Edge, Brave), version 116 or newer.

## Install

1. **Get the files.** On this GitHub page, click **Code** > **Download ZIP**, then unzip it somewhere you will keep it (for example `Documents\nc-template-panel`). Do not delete or move that folder afterwards: Chrome loads the extension from it.
   Or, with git: `git clone https://github.com/ibuds/nc-template-panel.git`
2. **Open the extensions page.** Type `chrome://extensions` in the address bar and press Enter.
3. **Turn on Developer mode** (switch in the top right corner).
4. Click **Load unpacked** and choose the unzipped folder (the one that contains `manifest.json`).
5. **Pin it.** Click the puzzle-piece icon in the toolbar and pin **NC Template Panel**.
6. Click the pinned icon to open the panel.
7. **First time only:** the panel shows "Direct insert is off on 6 sites". Click **Allow**, then **Allow** again in Chrome's prompt.

## Use

1. Open the chat and click inside the message box.
2. Click a template in the panel. The text appears in the message box ("Inserted into chat box").
3. Check it, fill in any `[PLACEHOLDERS]`, and press Send.

If no message box is selected, the text is copied instead ("Copied, paste manually"): press Ctrl+V in the message box.

- **Suggested** (Instagram and Threads DMs): when a chat is open, the panel reads the customer's latest messages and shows up to 3 fitting templates at the top, with the words that matched. Give each template **Keywords** (the words customers use, e.g. `harga, pricelist, berapa`) to make suggestions better; they also improve as staff pick templates. Nothing is sent anywhere: the matching runs in your browser.
- **New template**: button at the top. The pencil edits, the box icon archives (restore it from the **Archived** tab).
- **Sites** (globe icon): the sites where text is inserted directly. Add another site there, or remove one.
- **Export / Import**: save your templates to a file, or load a file from a colleague.

## Update to a new version

Download the new ZIP and replace the files in the same folder (or `git pull`), then open `chrome://extensions` and click the reload icon on **NC Template Panel**. Your templates are kept.

Uninstalling the extension deletes its templates, so **Export** first.

---

Technical notes (permissions, how inserting works, per-site notes): [NOTES.md](NOTES.md).
