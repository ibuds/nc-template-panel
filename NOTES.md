# NC Template Panel: technical notes

For install and daily use, see [README.md](README.md).

## Data and actions

**New template** / pencil (edit) open the bottom sheet; the archive icon is a soft delete (`archived: true`), restore it from the **Archived** tab; search matches text and category; **Import** / **Export** read and write a JSON file (backup or move between staff; import merges by `id`, the newer `updatedAt` wins).

Data lives in `chrome.storage.local` under the key `templates`: `{ id, body, category, archived, createdAt, updatedAt, useCount }`. It survives browser restarts. First run is seeded with the 8 sample templates from the mockup (placeholders such as `[PRICE]` stay literal).

## Suggestions (Instagram and Threads DMs)

Files: `extract.js` (`readConversation()`, run in the page) and `matcher.js` (`NCMatch`, runs in the panel).

**Reading the chat.** While the panel is visible, it runs `readConversation` on the active tab every 2.5 s, on tab switch and on navigation, but only when the tab is on `instagram.com`, `threads.com` or `threads.net` *and* that site is allowed in Sites (without the grant Chrome hides the tab URL and refuses the script). Both sites use generated class names, so the reader uses layout, not selectors:
1. The message box: the focused `contenteditable` / `textarea` / `role="textbox"`, else the lowest visible one.
2. The chat pane: the first ancestor of the message box that is at least 60% of the window high (keeps the inbox column out).
3. Text blocks in the pane (`[dir="auto"]`, else the text's parent), above the message box and below a 64 px header strip, outside links, buttons, headings, `time` and `aria-hidden`.
4. Side: closer to the left edge = customer, right = us, centred (within 10% of width) = timestamp/system, dropped.
5. Result: the customer's last run of messages (max 3), skipping our trailing messages such as "Seen".

Page text is only kept in the panel's memory; it is never stored or sent. Only the words of a message staff answered are stored, as learning data (below).

**Matching.** Text is lowercased, punctuation and emoji removed, chat shorthand expanded (`brp` > `berapa`, `hrg` > `harga`, `tgl` > `tanggal`, `tf` > `transfer` ...), `-nya/-lah/-kah/-pun/-ku/-mu` trimmed, filler words dropped (`kak, ya, dong, mau, bisa` ...). Each template scores per customer word:
- matches one of its **Keywords** (exact, one typo, or a shared 5+ letter start): 3
- else appears in its text or category: 1.5 if at most a third of the templates use the word, 1 if up to 60%, else 0.5; a typo match gets 70% of that
- plus learned weight: 1.2 x how often staff picked this template for that word (max 3), halving every 30 days

Newest message counts x1, the one before x0.6, then x0.36. Templates scoring 1.5 or more are shown, best first (ties: most used). Learning is stored in `chrome.storage.local` under `learned` (`{templateId: {word: {w, t}}}`, max 150 words per template); it is updated when a template is inserted or copied while a chat is open. It is not part of Export.

**Not yet verified on the real sites** (no signed-in session during development): tested on a mock DM page with an inbox column, header, centred timestamps, our replies and "Seen". 

**Chat log** (scroll icon in the header): every read, newest first, with the status (e.g. `Cannot see this tab: its site is not allowed in Sites`, `Reader: no-composer`, `OK`), the customer messages taken, every template's score (including ones below the threshold of 1.5) and, for the newest read, the reader's debug details: message box found, chat pane bounds, text blocks kept and dropped, and the last 12 lines it classified as IN (customer) or OUT (us). **Copy log** puts it on the clipboard. It lives in memory only and is cleared when the panel closes.

## Permissions

`sidePanel`, `storage`, `activeTab`, `scripting`, plus `optional_host_permissions: ["https://*/*"]`. No required `host_permissions`, no content scripts. Two functions touch the page: `insertIntoFocusedField` (`inject.js`), run when a card is clicked, and `readConversation` (`extract.js`), which reads DMs on Instagram and Threads only (see Suggestions). No other page content is read.

### Sites (direct insert)

The globe button in the header opens **Sites**: the list of sites where a card click goes straight into the chat box. Defaults: `whatsapp.com`, `instagram.com`, `threads.com`, `threads.net`, `tiktok.com`, `x.com`. Each entry is a bare domain and is granted as `https://*.<domain>/*`, which covers the domain itself and every subdomain (`www.`, `web.`). Lists saved by older versions (`www.instagram.com`, `web.whatsapp.com`) are converted on load and their old exact grants removed, so staff click **Allow** once more.

- The defaults are *listed* on install but not yet *allowed*. A banner "Direct insert is off on N sites" shows until staff click **Allow** (one Chrome prompt for all of them).
- **Add site** takes a domain (`facebook.com`), a host with `www.`, a URL, or a wildcard (`*.example.com`); all become the bare domain, and Chrome is asked for `https://*.<domain>/*` right away.
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
