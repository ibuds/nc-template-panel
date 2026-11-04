# NC Template Panel: technical notes

For install and daily use, see [README.md](README.md).

## Data and actions

**New template** / pencil (edit) open the bottom sheet; the archive icon is a soft delete (`archived: true`), restore it from the **Archived** tab; search matches text and category; **Import** / **Export** read and write a JSON file (backup or move between staff; import merges by `id`, the newer `updatedAt` wins).

Data lives in `chrome.storage.local` under the key `templates`: `{ id, body, category, archived, createdAt, updatedAt, useCount }`. It survives browser restarts. First run is seeded with the 8 sample templates from the mockup (placeholders such as `[PRICE]` stay literal).

## Permissions

`sidePanel`, `storage`, `activeTab`, `scripting`, plus `optional_host_permissions: ["https://*/*"]`. No required `host_permissions`, no content scripts. The panel never reads page content; the only code that touches the page is the insert function in `inject.js`, run when a card is clicked.

### Sites (direct insert)

The globe button in the header opens **Sites**: the list of sites where a card click goes straight into the chat box. Defaults: `web.whatsapp.com`, `www.instagram.com`, `www.threads.com`, `www.threads.net`, `www.tiktok.com`, `x.com`.

- The defaults are *listed* on install but not yet *allowed*. A banner "Direct insert is off on N sites" shows until staff click **Allow** (one Chrome prompt for all of them).
- **Add site** takes a host (`www.facebook.com`), a URL, or a wildcard (`*.example.com`) and asks Chrome for access to `https://<host>/*` right away.
- The **x** on a row removes the site and gives the access back. **Reset to defaults** restores the six defaults and drops access for any extra sites.
- The list is stored in `chrome.storage.local` under `sites`. What is actually granted is Chrome's own record, so the chips also follow changes made in `chrome://extensions` (Site access).

On a site that is not in the list (or not allowed), the insert still works on a tab where the toolbar icon was clicked (`activeTab`, lost when the tab navigates); otherwise it falls back to "Copied, paste manually". The panel opens for the whole window, so it stays open when staff switch tabs.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, permissions |
| `background.js` | Opens the side panel on toolbar click |
| `sidepanel.html/.css/.js` | UI and storage |
| `inject.js` | `insertIntoFocusedField(text)`, passed to `chrome.scripting.executeScript` |
| `fonts/` | Nunito 800/900, Mulish 400/600/700 (woff2, from `@fontsource`, latin subset, OFL) |
| `icons/` | Extension icons (PNG). UI icons are inline Lucide SVGs (ISC) |

## How insertion works (`inject.js`)

Runs in every frame of the active tab (`allFrames`); only the frame that actually has focus acts, so iframes (same or cross-origin) are covered without double insertion.

1. Finds `document.activeElement`, descending into open shadow roots.
2. `input` / `textarea`: sets the value with the native setter and dispatches an `input` event (works with React-style controlled fields). Single-line inputs get newlines turned into spaces.
3. `contenteditable`: puts the cursor at the end if it is not already inside, then dispatches a synthetic `paste` event with the whole text. Rich editors (Lexical on WhatsApp/Instagram, Draft.js on X) take it and keep the line breaks; when the editor accepted the paste, nothing else is tried, so the text is never inserted twice. Only when no editor handled the paste (a plain `contenteditable`) does it fall back to `execCommand('insertText')` per line with `execCommand('insertLineBreak')` between lines (Shift+Enter key events if that is refused; a bare Enter is never sent). Rich editors apply edits asynchronously, so success is checked after a short wait (80 ms).
4. Returns `{ok: true, method}` or `{ok: false, reason}`; any failure triggers the clipboard fallback.

## What was verified

Automated, in Google Chrome 145 with the extension loaded unpacked (test copy with `http://localhost/*` host access added only so `executeScript` works without a toolbar click; the shipped manifest has none):

- Insert into `input`, `textarea`, plain `contenteditable` (multi-line, with a "plain Enter = send" handler that never fired), `contenteditable` inside an iframe (inserted once), textarea inside a shadow root.
- No focused field: returns `no-field`; clipboard fallback toast "Copied, paste manually" shown when the tab cannot be scripted.
- Add, edit, archive, restore, search (match and no match), counts, stored shape, and that data is still there after reloading the panel.

Not automated: import/export file dialogs, and an actual browser restart (storage is `chrome.storage.local`, which persists).

## Per-site insert notes

The first build could not sign in to any of the five sites, so apart from WhatsApp the notes below are what to expect and what to check, not results.

| Site | Result | Editor type (expected) | What to watch |
|---|---|---|---|
| WhatsApp Web | used by staff; double-insert fix not yet re-checked there | `contenteditable` rich editor (Lexical) | Applies edits asynchronously. Earlier versions inserted the text twice (once run together, once pasted); fixed by trying the paste event first and stopping when the editor accepts it. |
| Instagram (DMs) | not tested (needs login) | `contenteditable` (Lexical-based) | Same as WhatsApp. Make sure the DM box is focused, not the search box. |
| Threads | not tested (needs login) | `contenteditable` | Reply/composer boxes; check line breaks. |
| TikTok (web DMs / comments) | not tested (needs login) | `contenteditable` or `textarea`, may live in an iframe | Handled by `allFrames`; if the editor is a Draft.js-style box, the paste-event fallback is the likely path. |
| X (DMs / replies) | not tested (needs login) | `contenteditable` (Draft.js) | Draft.js can ignore `execCommand` line breaks; paste-event fallback is the likely path. |

If a site turns out to need special handling, add it in `inject.js` (a branch keyed on `location.hostname`) and record it here.
