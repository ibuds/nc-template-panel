// Passed to chrome.scripting.executeScript({ func: insertIntoFocusedField, args: [text], target: { allFrames: true } }).
// It is serialised and run inside the page, so it must be fully self-contained (no outer variables).
// Every frame runs it; only the frame that really has focus and an editable element inserts.
// Async: executeScript waits for the returned promise.
async function insertIntoFocusedField(text) {
  // 1. Find the real focused element, descending through shadow roots. Iframes are handled by
  //    running in every frame (allFrames), which also covers cross-origin frames.
  const doc = document;
  let el = doc.activeElement;
  for (let i = 0; i < 20 && el; i++) {
    if (el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    } else if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
      // Focus is inside a child frame: that frame runs this same function (allFrames), so do nothing here.
      return { ok: false, reason: 'in-child-frame' };
    } else {
      break;
    }
  }
  if (!el || el === doc.body || el === doc.documentElement) return { ok: false, reason: 'no-field' };
  // No document.hasFocus() check: clicking a card focuses the side panel, so the page never has
  // focus at this point. activeElement still points at the chat box the staff member last clicked.
  // Re-focus it (inside the page only, the window stays where it is) so editors accept the insert.
  try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }

  const view = doc.defaultView || window;
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');

  // 2. input / textarea: native setter + input event (works with React-style controlled inputs).
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') {
    const okTypes = ['text', 'search', 'url', 'tel', 'email', 'password', ''];
    if (tag === 'INPUT' && okTypes.indexOf((el.getAttribute('type') || '').toLowerCase()) === -1) {
      return { ok: false, reason: 'unsupported-input-type' };
    }
    if (el.disabled || el.readOnly) return { ok: false, reason: 'read-only' };
    const value = tag === 'INPUT' ? lines.join(' ') : lines.join('\n');
    const proto = tag === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    const start = el.selectionStart == null ? el.value.length : el.selectionStart;
    const end = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    setter.call(el, el.value.slice(0, start) + value + el.value.slice(end));
    try { el.setSelectionRange(start + value.length, start + value.length); } catch (e) { /* some input types */ }
    el.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    return { ok: true, method: 'native-setter' };
  }

  // 3. contenteditable (WhatsApp, Instagram, Threads, X, TikTok use rich editors).
  if (!el.isContentEditable) return { ok: false, reason: 'not-editable' };
  // Use the editing host (the outermost editable ancestor) so the cursor check below is right.
  let host = el;
  while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;

  const sel = view.getSelection();
  if (!sel.rangeCount || !host.contains(sel.anchorNode)) {
    const r = doc.createRange();
    r.selectNodeContents(host);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  const textLen = () => (host.textContent || '').length;
  const before = textLen();
  // Rich editors (Lexical on WhatsApp/Instagram, Draft.js on X) apply edits a moment later, not
  // synchronously, so the DOM is only checked after a short wait.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

  // First choice: a synthetic paste event carrying the whole text. Rich editors handle it themselves
  // (they call preventDefault) and turn newlines into proper line breaks. A plain contenteditable has no
  // default action for a synthetic paste, so nothing happens there and we fall through.
  let pasteHandled = false;
  try {
    const dt = new view.DataTransfer();
    dt.setData('text/plain', String(text));
    const ev = new view.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    host.dispatchEvent(ev);
    pasteHandled = ev.defaultPrevented;
  } catch (e) { /* DataTransfer/ClipboardEvent not constructible: use execCommand */ }
  if (pasteHandled) {
    // Never also run execCommand here: if the editor took the paste, a second path would insert the text twice.
    await settle();
    return textLen() > before ? { ok: true, method: 'paste-event' } : { ok: false, reason: 'paste-ignored' };
  }

  const keyEvent = (type) => host.dispatchEvent(new view.KeyboardEvent(type, {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true
  }));

  // Line by line: insertText for the text, a soft line break (never a bare Enter, which would send) between lines.
  let failed = false;
  for (let i = 0; i < lines.length && !failed; i++) {
    if (i > 0) {
      let broke = false;
      try { broke = doc.execCommand('insertLineBreak'); } catch (e) { broke = false; }
      if (!broke) {
        // Shift+Enter fallback for editors that only react to the key event.
        keyEvent('keydown'); keyEvent('keypress'); keyEvent('keyup');
      }
    }
    if (lines[i]) {
      let done = false;
      try { done = doc.execCommand('insertText', false, lines[i]); } catch (e) { done = false; }
      if (!done) failed = true;
    }
  }
  await settle();
  return textLen() > before ? { ok: true, method: 'execCommand' } : { ok: false, reason: 'insert-failed' };
}
