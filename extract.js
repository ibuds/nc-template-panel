// Passed to chrome.scripting.executeScript({ func: readConversation }) on Instagram and Threads DM tabs.
// Reads the customer's latest messages from the open chat. It is serialised and run inside the page,
// so it must be fully self-contained. Class names on these sites are generated and change often, so it
// relies on layout instead: the chat pane is the tall column around the message box, customer messages
// sit on the left of it and ours on the right, timestamps are centred.
// Every result carries `debug` (what was found at each step) for the panel's Chat log.
function readConversation() {
  const host = location.hostname.replace(/^www\./, '');
  const site = host === 'instagram.com' ? 'instagram' : (host === 'threads.com' || host === 'threads.net') ? 'threads' : null;
  const debug = { path: location.pathname, viewport: innerWidth + 'x' + innerHeight };
  if (!site) return { ok: false, reason: 'unsupported-site', debug: debug };

  const vh = window.innerHeight;
  const visible = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh;
  const describe = (el) => el.tagName.toLowerCase() +
    (el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '') +
    (el.getAttribute('aria-label') ? '[aria-label="' + el.getAttribute('aria-label').slice(0, 40) + '"]' : '');

  // 1. The message box: the focused editor, else the lowest visible one.
  const allEditors = Array.from(document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"]'));
  const editors = allEditors.filter((e) => visible(e.getBoundingClientRect()));
  debug.editors = editors.length + ' visible of ' + allEditors.length;
  if (!editors.length) return { ok: false, reason: 'no-composer', debug: debug };
  const act = document.activeElement;
  const editor = editors.find((e) => e === act || e.contains(act)) ||
    editors.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  const er = editor.getBoundingClientRect();
  debug.editor = describe(editor) + ' at y=' + Math.round(er.top);

  // 2. The chat pane: the first ancestor of the message box that is most of the window high.
  //    This keeps the inbox column (other conversations) out.
  let pane = editor.parentElement;
  while (pane && pane !== document.body && pane.getBoundingClientRect().height < vh * 0.6) pane = pane.parentElement;
  if (!pane) pane = document.body;
  const pr = pane.getBoundingClientRect();
  debug.pane = describe(pane) + ' x=' + Math.round(pr.left) + '..' + Math.round(pr.right) + ' y=' + Math.round(pr.top) + '..' + Math.round(pr.bottom);

  // 3. Text blocks above the message box, below the chat header, outside links, buttons and headings.
  const SKIP = 'header, nav, h1, h2, h3, h4, [role="heading"], [role="navigation"], a[href], button, time, [aria-hidden="true"]';
  const HEADER = 64;
  const blocks = new Map();
  let skipped = 0;
  const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const parent = n.parentElement;
    if (!parent || editor.contains(parent)) continue;
    if (parent.closest(SKIP)) { skipped++; continue; }
    const block = parent.closest('[dir="auto"]') || parent;
    if (!pane.contains(block)) continue;
    if (!blocks.has(block)) blocks.set(block, []);
    blocks.get(block).push(t);
  }

  const entries = [];
  const dropped = { offscreen: 0, header: 0, belowBox: 0, centred: 0 };
  blocks.forEach((parts, block) => {
    const r = block.getBoundingClientRect();
    if (!visible(r)) { dropped.offscreen++; return; }
    if (r.top < pr.top + HEADER) { dropped.header++; return; }
    if (r.bottom > er.top) { dropped.belowBox++; return; }
    const left = r.left - pr.left;
    const right = pr.right - r.right;
    const side = Math.abs(left - right) < pr.width * 0.1 ? 'center' : (left < right ? 'in' : 'out');
    if (side === 'center') { dropped.centred++; return; } // dates, "Today 10:32", system notes
    entries.push({ text: parts.join(' ').slice(0, 500), side: side, top: r.top });
  });
  entries.sort((a, b) => a.top - b.top);
  debug.blocks = blocks.size + ' text blocks, ' + skipped + ' texts in links/buttons/headings skipped, dropped ' + JSON.stringify(dropped);
  debug.entries = entries.slice(-12).map((e) => (e.side === 'in' ? 'IN  ' : 'OUT ') + e.text.slice(0, 80));
  if (!entries.length) return { ok: false, reason: 'no-messages', debug: debug };

  // 4. The customer's last run of messages (skipping anything we sent after it, e.g. "Seen").
  let i = entries.length - 1;
  const lastFromCustomer = entries[i].side === 'in';
  while (i >= 0 && entries[i].side === 'out') i--;
  const messages = [];
  while (i >= 0 && entries[i].side === 'in' && messages.length < 3) messages.unshift(entries[i--].text);
  if (!messages.length) return { ok: false, reason: 'no-customer-messages', debug: debug };

  return { ok: true, site: site, messages: messages, lastFromCustomer: lastFromCustomer, debug: debug };
}
