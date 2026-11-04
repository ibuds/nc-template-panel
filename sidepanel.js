// NC Template Panel: UI and storage. insertIntoFocusedField() comes from inject.js.
(function () {
  'use strict';

  var STORAGE_KEY = 'templates';

  // Lucide icons (lucide-static 0.468.0, ISC licence), inner markup only.
  var ICONS = {
    'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'pencil': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    'archive': '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    'archive-restore': '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    'scroll-text': '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'
  };

  // Sites where templates go straight into the chat box (optional host permissions, granted by staff).
  var SITES_KEY = 'sites';
  // Bare domains; each covers the domain itself and every subdomain (www., web. ...).
  var DEFAULT_SITES = ['whatsapp.com', 'instagram.com', 'threads.com', 'threads.net', 'tiktok.com', 'x.com'];

  var SEED = [
    ['General', 'Hi, thank you for contacting Next Concert. Which date and concert would you like to rent for?', 'halo, hai, hi, hello, info, tanya, permisi'],
    ['Orders', 'The unit is still available for that date. Could you send your full name and WhatsApp number so we can note it down?', 'ready, tersedia, available, kosong, booking, pesan, sewa'],
    ['Pricing', 'The rental price is Rp [PRICE] per day, including [INCLUDED]. Rentals of 2 days or more get a discount.', 'harga, pricelist, berapa, biaya, price, tarif, rate'],
    ['Payment', 'You can pay via QRIS or bank transfer. A down payment of Rp [DP] locks in your date, and the rest is paid at pickup.', 'bayar, pembayaran, transfer, qris, dp, rekening, payment'],
    ['Pickup', 'Pickup is at [LOCATION] at [TIME]. Please bring your original ID card.', 'ambil, pickup, alamat, lokasi, dimana, jam'],
    ['Orders', 'Your order under the name [NAME] for [DATE] has been noted. Please pay the Rp [DP] down payment by [DEADLINE] to lock in the unit.', 'konfirmasi, jadi, fix, order, nama'],
    ['Returns', 'Please return the unit by [TIME] on [DATE]. Late returns are charged per extra day.', 'kembali, balikin, pengembalian, return, telat'],
    ['General', 'Thank you. Let us know if you have any other questions.', 'makasih, terima, kasih, oke, siap']
  ];

  var LEARN_KEY = 'learned';
  // Sites whose DMs the panel reads to suggest templates (only when that site is allowed in Sites).
  var SUGGEST_HOSTS = /(^|\.)(instagram\.com|threads\.com|threads\.net)$/;

  var $ = function (id) { return document.getElementById(id); };
  var state = { templates: [], tab: 'active', query: '', editingId: null, sites: [], allowed: {}, convo: null, learned: {} };
  var toastTimer = null;
  var lastFocus = null;

  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'lucide');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name]; // static, trusted constants above
    return svg;
  }

  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
  }

  /* ---------- storage ---------- */

  function save() {
    return chrome.storage.local.set({ [STORAGE_KEY]: state.templates });
  }

  function load() {
    return chrome.storage.local.get([STORAGE_KEY, LEARN_KEY]).then(function (res) {
      state.learned = res[LEARN_KEY] && typeof res[LEARN_KEY] === 'object' ? res[LEARN_KEY] : {};
      if (Array.isArray(res[STORAGE_KEY])) {
        state.templates = res[STORAGE_KEY];
        // Templates from before keywords existed: give the untouched samples their keywords.
        var changed = false;
        state.templates.forEach(function (t) {
          if (typeof t.keywords === 'string') return;
          var seed = SEED.filter(function (s) { return s[1] === t.body; })[0];
          t.keywords = seed ? seed[2] : '';
          changed = true;
        });
        if (changed) return save();
      } else {
        var now = Date.now();
        state.templates = SEED.map(function (s, i) {
          return { id: uid(), body: s[1], category: s[0], keywords: s[2], archived: false, createdAt: now - i, updatedAt: now - i, useCount: 0 };
        });
        return save();
      }
    });
  }

  /* ---------- toast ---------- */

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- rendering ---------- */

  function render() {
    var active = state.templates.filter(function (t) { return !t.archived; });
    var archived = state.templates.filter(function (t) { return t.archived; });
    $('count-active').textContent = active.length;
    $('count-archived').textContent = archived.length;

    var showArchived = state.tab === 'archived';
    $('tab-active').classList.toggle('is-selected', !showArchived);
    $('tab-archived').classList.toggle('is-selected', showArchived);
    $('tab-active').setAttribute('aria-selected', String(!showArchived));
    $('tab-archived').setAttribute('aria-selected', String(showArchived));

    var q = state.query.trim().toLowerCase();
    var shown = (showArchived ? archived : active).filter(function (t) {
      return !q || (t.body + ' ' + t.category + ' ' + (t.keywords || '')).toLowerCase().indexOf(q) !== -1;
    });

    var grid = $('grid');
    grid.textContent = '';
    shown.forEach(function (t) { grid.appendChild(card(t, showArchived)); });
    var empty = $('empty');
    empty.hidden = shown.length > 0;
    empty.textContent = q ? 'No templates match.' : (showArchived ? 'No archived templates.' : 'No templates yet.');
    renderSuggest();
  }

  // Up to 3 templates that fit the customer's latest messages; hidden while searching or on Archived.
  function renderSuggest() {
    var box = $('suggest');
    var list = [];
    if (state.convo && state.tab === 'active' && !state.query.trim()) {
      var active = state.templates.filter(function (t) { return !t.archived; });
      list = NCMatch.suggest(active, state.convo.messages, state.learned, Date.now(), 3);
    }
    box.hidden = list.length === 0;
    var wrap = $('suggest-list');
    wrap.textContent = '';
    if (!list.length) return;
    var last = state.convo.messages[state.convo.messages.length - 1];
    $('suggest-from').textContent = '"' + last + '"';
    $('suggest-from').title = state.convo.messages.join('\n');
    list.forEach(function (s) {
      var el = card(s.template, false);
      el.classList.add('is-suggested');
      var match = document.createElement('span');
      match.className = 'match';
      match.textContent = 'Matched: ' + s.matched.join(', ');
      el.querySelector('.card-body').appendChild(match);
      wrap.appendChild(el);
    });
  }

  function iconButton(name, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.appendChild(icon(name));
    b.addEventListener('click', onClick);
    return b;
  }

  function card(t, isArchived) {
    var el = document.createElement('div');
    el.className = 'card';

    var body = document.createElement(isArchived ? 'div' : 'button');
    body.className = 'card-body';
    if (!isArchived) {
      body.type = 'button';
      body.addEventListener('click', function () { insertTemplate(t); });
    }
    var text = document.createElement('span');
    text.className = 'card-text';
    text.textContent = t.body;
    body.appendChild(text);

    var foot = document.createElement('div');
    foot.className = 'card-foot';
    var cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = t.category;
    var actions = document.createElement('div');
    actions.className = 'card-actions';
    if (isArchived) {
      actions.appendChild(iconButton('archive-restore', 'Restore template', function () { setArchived(t.id, false); }));
    } else {
      actions.appendChild(iconButton('pencil', 'Edit template', function () { openSheet(t.id); }));
      actions.appendChild(iconButton('archive', 'Archive template', function () { setArchived(t.id, true); }));
    }
    foot.appendChild(cat);
    foot.appendChild(actions);

    el.appendChild(body);
    el.appendChild(foot);
    return el;
  }

  /* ---------- actions ---------- */

  function find(id) {
    return state.templates.filter(function (t) { return t.id === id; })[0];
  }

  function setArchived(id, value) {
    var t = find(id);
    if (!t) return;
    t.archived = value;
    t.updatedAt = Date.now();
    save().then(function () {
      render();
      toast(value ? 'Template archived' : 'Template restored');
    });
  }

  function copyText(text) {
    var done = function () { return true; };
    var legacy = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
  }

  function insertTemplate(t) {
    function bumpUse() {
      var cur = find(t.id) || t;
      cur.useCount = (cur.useCount || 0) + 1;
      save();
      // Remember which words led to this template, so suggestions improve with use.
      if (state.convo) {
        NCMatch.learn(state.learned, t.id, state.convo.messages, Date.now());
        chrome.storage.local.set({ [LEARN_KEY]: state.learned });
      }
    }
    function fallback() {
      copyText(t.body).then(function (ok) {
        if (ok) bumpUse();
        toast(ok ? 'Copied, paste manually' : 'Could not insert or copy');
      });
    }

    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(function (tabs) {
      var tab = tabs[0];
      if (!tab || tab.id == null) return fallback();
      return chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: insertIntoFocusedField,
        args: [t.body]
      }).then(function (results) {
        var ok = (results || []).some(function (r) { return r.result && r.result.ok; });
        if (ok) {
          bumpUse();
          toast('Inserted into chat box');
        } else {
          console.warn('[insert] failed', (results || []).map(function (r) { return r.result; }));
          fallback();
        }
      }, function (err) {
        // e.g. chrome:// pages, or activeTab not granted for this tab
        console.warn('[insert] executeScript refused', err && err.message);
        fallback();
      });
    }, fallback);
  }

  /* ---------- sheet ---------- */

  function openSheet(id) {
    lastFocus = document.activeElement;
    state.editingId = id || null;
    var t = id ? find(id) : null;
    $('sheet-title').textContent = t ? 'Edit template' : 'New template';
    $('f-body').value = t ? t.body : '';
    $('f-cat').value = t ? t.category : '';
    $('f-kw').value = t ? (t.keywords || '') : '';
    $('f-body').classList.remove('invalid');
    $('scrim').hidden = false;
    $('sheet').hidden = false;
    $('f-body').focus();
  }

  function closeSheet() {
    $('scrim').hidden = true;
    $('sheet').hidden = true;
    state.editingId = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function saveSheet() {
    var body = $('f-body').value.trim();
    var category = $('f-cat').value.trim() || 'General';
    var keywords = $('f-kw').value.split(',').map(function (k) { return k.trim(); }).filter(Boolean).join(', ');
    if (!body) {
      $('f-body').classList.add('invalid');
      $('f-body').focus();
      return;
    }
    var now = Date.now();
    var t = state.editingId ? find(state.editingId) : null;
    if (t) {
      t.body = body;
      t.category = category;
      t.keywords = keywords;
      t.updatedAt = now;
    } else {
      state.templates.unshift({ id: uid(), body: body, category: category, keywords: keywords, archived: false, createdAt: now, updatedAt: now, useCount: 0 });
    }
    var wasEdit = !!t;
    save().then(function () {
      closeSheet();
      state.tab = 'active';
      render();
      toast(wasEdit ? 'Template updated' : 'Template saved');
    });
  }

  /* ---------- conversation (suggestions) ---------- */

  // Reads the open Instagram / Threads DM on the active tab. Chrome only gives the panel the tab's
  // URL and lets it run the reader when that site is allowed in Sites, so other tabs are never read.
  var convoBusy = false;
  function refreshConvo() {
    if (convoBusy || document.visibilityState !== 'visible') return;
    convoBusy = true;
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(function (tabs) {
      var tab = tabs[0];
      if (!tab) return { status: 'No active tab' };
      // Chrome hides the URL of tabs on sites the extension has no access to.
      if (!tab.url) return { status: 'Cannot see this tab: its site is not allowed in Sites' };
      var host = '';
      try { host = new URL(tab.url).hostname; } catch (e) { host = ''; }
      if (!SUGGEST_HOSTS.test(host)) return { host: host, status: 'Not an Instagram or Threads tab' };
      return chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readConversation }).then(function (res) {
        var r = res && res[0] && res[0].result;
        return { host: host, reader: r, status: !r ? 'Reader returned nothing' : r.ok ? 'OK' : 'Reader: ' + r.reason };
      }, function (err) {
        return { host: host, status: 'Could not run reader: ' + (err && err.message) };
      });
    }).catch(function (err) {
      return { status: 'Error: ' + (err && err.message) };
    }).then(function (rec) {
      convoBusy = false;
      var r = rec.reader;
      var convo = r && r.ok ? { site: r.site, messages: r.messages } : null;
      if (JSON.stringify(convo) !== JSON.stringify(state.convo)) {
        state.convo = convo;
        renderSuggest();
      }
      logRead({ at: Date.now(), host: rec.host || '', status: rec.status, messages: convo && convo.messages, debug: r && r.debug });
    });
  }

  /* ---------- chat log ---------- */

  // In memory only, newest first. Repeated identical reads update the newest entry instead of adding one.
  var convoLog = [];
  function logRead(rec) {
    rec.sig = JSON.stringify([rec.host, rec.status, rec.messages]);
    if (convoLog[0] && convoLog[0].sig === rec.sig) {
      convoLog[0].at = rec.at;
      convoLog[0].debug = rec.debug;
    } else {
      convoLog.unshift(rec);
      if (convoLog.length > 30) convoLog.length = 30;
    }
    if (!$('log-sheet').hidden) renderLog();
  }

  function logText() {
    var active = state.templates.filter(function (t) { return !t.archived; });
    var lines = [];
    convoLog.forEach(function (rec, i) {
      lines.push(new Date(rec.at).toLocaleTimeString() + '  ' + (rec.host || '-') + '  ' + rec.status);
      if (rec.messages) {
        rec.messages.forEach(function (m) { lines.push('  customer: "' + m + '"'); });
        var scores = NCMatch.suggest(active, rec.messages, state.learned, Date.now(), 5, 0.01);
        lines.push('  scores (shown at ' + NCMatch.MIN_SCORE + '+): ' + (scores.length ? scores.map(function (s) {
          return s.template.category + ' "' + s.template.body.replace(/\s+/g, ' ').slice(0, 24) + '..." ' + s.score.toFixed(1) + ' [' + s.matched.join(', ') + ']';
        }).join(' | ') : 'no template shares a word with these messages'));
      }
      if (i === 0 && rec.debug) {
        Object.keys(rec.debug).forEach(function (k) {
          var v = rec.debug[k];
          if (Array.isArray(v)) {
            lines.push('  ' + k + ':');
            v.forEach(function (x) { lines.push('    ' + x); });
          } else {
            lines.push('  ' + k + ': ' + v);
          }
        });
      }
      lines.push('');
    });
    return lines.join('\n') || 'Nothing read yet. Open an Instagram or Threads DM.';
  }

  function renderLog() {
    $('log-text').textContent = logText();
  }

  function openLog() {
    lastFocus = document.activeElement;
    renderLog();
    $('scrim').hidden = false;
    $('log-sheet').hidden = false;
    $('log-close').focus();
  }

  function closeLog() {
    $('scrim').hidden = true;
    $('log-sheet').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- sites ---------- */

  // "*.instagram.com" matches instagram.com itself as well as www.instagram.com.
  function sitePattern(host) {
    return 'https://*.' + host + '/*';
  }

  // Accepts "x.com", "www.instagram.com", "https://www.facebook.com/messages" or "*.example.com";
  // returns the bare domain ("facebook.com") or null.
  function normaliseHost(input) {
    var s = String(input || '').trim().toLowerCase();
    if (!s) return null;
    if (s.indexOf('://') !== -1) {
      try { s = new URL(s.replace('://*.', '://')).hostname; } catch (e) { return null; }
    } else {
      s = s.split('/')[0].split(':')[0];
    }
    s = s.replace(/^\*\./, '').replace(/^www\./, '');
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : null;
  }

  function saveSites() {
    return chrome.storage.local.set({ [SITES_KEY]: state.sites });
  }

  function loadSites() {
    return chrome.storage.local.get(SITES_KEY).then(function (res) {
      if (!Array.isArray(res[SITES_KEY])) {
        state.sites = DEFAULT_SITES.slice();
        return;
      }
      // Older versions stored exact hosts ("www.instagram.com", "web.whatsapp.com") that missed the
      // bare domain. Convert them and drop the old exact grants; staff click Allow once more.
      var old = res[SITES_KEY];
      var legacy = { 'web.whatsapp.com': 'whatsapp.com' };
      state.sites = [];
      old.forEach(function (h) {
        var bare = legacy[h] || normaliseHost(h);
        if (bare && state.sites.indexOf(bare) === -1) state.sites.push(bare);
      });
      if (JSON.stringify(old) === JSON.stringify(state.sites)) return;
      var stale = old.filter(function (h) { return h.indexOf('*.') !== 0; }).map(function (h) { return 'https://' + h + '/*'; });
      return chrome.permissions.remove({ origins: stale }).catch(function () {}).then(saveSites);
    });
  }

  function refreshAllowed() {
    return Promise.all(state.sites.map(function (host) {
      return chrome.permissions.contains({ origins: [sitePattern(host)] }).catch(function () { return false; });
    })).then(function (flags) {
      state.allowed = {};
      state.sites.forEach(function (host, i) { state.allowed[host] = flags[i]; });
      renderSites();
    });
  }

  function missingSites() {
    return state.sites.filter(function (host) { return !state.allowed[host]; });
  }

  function renderSites() {
    var missing = missingSites();
    $('banner').hidden = missing.length === 0;
    $('banner-text').textContent = 'Direct insert is off on ' + missing.length + (missing.length === 1 ? ' site.' : ' sites.');
    $('sites-allow').disabled = missing.length === 0;

    var list = $('sites-list');
    list.textContent = '';
    state.sites.forEach(function (host) {
      var li = document.createElement('li');
      li.className = 'site';
      var name = document.createElement('span');
      name.className = 'site-host';
      name.textContent = host;
      var chip = document.createElement('span');
      chip.className = 'chip' + (state.allowed[host] ? ' is-on' : '');
      chip.textContent = state.allowed[host] ? 'Allowed' : 'Not allowed';
      li.appendChild(name);
      li.appendChild(chip);
      li.appendChild(iconButton('x', 'Remove ' + host, function () { removeSite(host); }));
      list.appendChild(li);
    });
    if (!state.sites.length) {
      var empty = document.createElement('li');
      empty.className = 'site hint';
      empty.textContent = 'No sites. Add one below.';
      list.appendChild(empty);
    }
  }

  // Must run straight from a click: Chrome only shows the permission prompt during a user gesture.
  function allowSites(hosts) {
    if (!hosts.length) return Promise.resolve(true);
    return chrome.permissions.request({ origins: hosts.map(sitePattern) }).then(function (granted) {
      if (!granted) toast('Not allowed. Templates will be copied on those sites');
      return refreshAllowed().then(function () { return granted; });
    }, function () {
      toast('Could not ask for site access');
    });
  }

  function addSite() {
    var host = normaliseHost($('f-site').value);
    if (!host) {
      $('f-site').classList.add('invalid');
      $('f-site').focus();
      return;
    }
    $('f-site').value = '';
    var isNew = state.sites.indexOf(host) === -1;
    if (isNew) state.sites.push(host);
    allowSites([host]); // called before any await so the prompt can open
    if (isNew) saveSites().then(renderSites);
  }

  function removeSite(host) {
    state.sites = state.sites.filter(function (h) { return h !== host; });
    // Drop the access too, so the list and Chrome's granted sites stay the same.
    chrome.permissions.remove({ origins: [sitePattern(host)] }).catch(function () {}).then(function () {
      return saveSites();
    }).then(refreshAllowed).then(function () { toast('Removed ' + host); });
  }

  function resetSites() {
    var extra = state.sites.filter(function (h) { return DEFAULT_SITES.indexOf(h) === -1; });
    state.sites = DEFAULT_SITES.slice();
    var drop = extra.length ? chrome.permissions.remove({ origins: extra.map(sitePattern) }).catch(function () {}) : Promise.resolve();
    drop.then(saveSites).then(refreshAllowed).then(function () { toast('Sites reset to defaults'); });
  }

  function openSites() {
    lastFocus = document.activeElement;
    $('f-site').value = '';
    $('f-site').classList.remove('invalid');
    $('scrim').hidden = false;
    $('sites-sheet').hidden = false;
    refreshAllowed();
    $('sites-close').focus();
  }

  function closeSites() {
    $('scrim').hidden = true;
    $('sites-sheet').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- import / export ---------- */

  function exportJson() {
    var blob = new Blob([JSON.stringify(state.templates, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nc-templates-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Exported ' + state.templates.length + ' templates');
  }

  function normalise(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.body !== 'string' || !raw.body.trim()) return null;
    var now = Date.now();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      body: raw.body,
      category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General',
      keywords: typeof raw.keywords === 'string' ? raw.keywords : '',
      archived: raw.archived === true,
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || now,
      useCount: Number(raw.useCount) || 0
    };
  }

  function importJson(file) {
    file.text().then(function (txt) {
      var data = JSON.parse(txt);
      var list = Array.isArray(data) ? data : (data && Array.isArray(data.templates) ? data.templates : null);
      if (!list) throw new Error('bad shape');
      var added = 0;
      var updated = 0;
      list.forEach(function (raw) {
        var n = normalise(raw);
        if (!n) return;
        var cur = find(n.id);
        if (!cur) {
          state.templates.push(n);
          added++;
        } else if (n.updatedAt > cur.updatedAt) {
          Object.assign(cur, n);
          updated++;
        }
      });
      return save().then(function () {
        render();
        toast(added + updated ? 'Imported ' + added + ' new, ' + updated + ' updated' : 'Nothing new to import');
      });
    }).catch(function () {
      toast('Import failed: not a valid template file');
    });
  }

  /* ---------- wiring ---------- */

  function init() {
    document.querySelectorAll('[data-icon]').forEach(function (n) { n.appendChild(icon(n.getAttribute('data-icon'))); });
    document.querySelectorAll('.search-icon, .btn span[data-icon]').forEach(function (n) { n.style.display = 'flex'; });

    $('new-btn').addEventListener('click', function () { openSheet(null); });
    $('sheet-close').addEventListener('click', closeSheet);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('scrim').addEventListener('click', function () {
      if (!$('sheet').hidden) closeSheet();
      if (!$('sites-sheet').hidden) closeSites();
      if (!$('log-sheet').hidden) closeLog();
    });
    $('sheet-save').addEventListener('click', saveSheet);
    $('f-body').addEventListener('input', function () { $('f-body').classList.remove('invalid'); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('sheet').hidden) closeSheet();
      if (!$('sites-sheet').hidden) closeSites();
      if (!$('log-sheet').hidden) closeLog();
    });

    $('log-btn').addEventListener('click', openLog);
    $('log-close').addEventListener('click', closeLog);
    $('log-clear').addEventListener('click', function () { convoLog = []; renderLog(); });
    $('log-copy').addEventListener('click', function () {
      copyText(logText()).then(function (ok) { toast(ok ? 'Log copied' : 'Could not copy'); });
    });
    $('sites-btn').addEventListener('click', openSites);
    $('sites-close').addEventListener('click', closeSites);
    $('banner-allow').addEventListener('click', function () { allowSites(missingSites()); });
    $('sites-allow').addEventListener('click', function () { allowSites(missingSites()); });
    $('sites-reset').addEventListener('click', resetSites);
    $('site-add').addEventListener('click', addSite);
    $('f-site').addEventListener('keydown', function (e) { if (e.key === 'Enter') addSite(); });
    $('f-site').addEventListener('input', function () { $('f-site').classList.remove('invalid'); });
    chrome.permissions.onAdded.addListener(refreshAllowed);
    chrome.permissions.onRemoved.addListener(refreshAllowed);

    $('q').addEventListener('input', function (e) { state.query = e.target.value; render(); });
    $('tab-active').addEventListener('click', function () { state.tab = 'active'; render(); });
    $('tab-archived').addEventListener('click', function () { state.tab = 'archived'; render(); });

    $('export-btn').addEventListener('click', exportJson);
    $('import-btn').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (f) importJson(f);
    });

    // Keep several open panels (other windows) in sync.
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes[STORAGE_KEY] && Array.isArray(changes[STORAGE_KEY].newValue)) {
        state.templates = changes[STORAGE_KEY].newValue;
        render();
      }
      if (area === 'local' && changes[SITES_KEY] && Array.isArray(changes[SITES_KEY].newValue)) {
        state.sites = changes[SITES_KEY].newValue;
        refreshAllowed();
      }
    });

    load().then(render).then(refreshConvo);
    loadSites().then(refreshAllowed);

    // Follow the open chat: on tab switch, page navigation, and every few seconds while the panel is visible.
    chrome.tabs.onActivated.addListener(refreshConvo);
    chrome.tabs.onUpdated.addListener(function (id, info) { if (info.url || info.status === 'complete') refreshConvo(); });
    document.addEventListener('visibilitychange', refreshConvo);
    setInterval(refreshConvo, 2500);
  }

  init();
})();
