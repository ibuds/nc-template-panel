// Template suggestions: scores templates against the customer's latest messages.
// Runs only in the panel; nothing is sent anywhere.
var NCMatch = (function () {
  'use strict';

  // Filler words that say nothing about what the customer wants (Indonesian chat + English).
  var STOP = new Set((
    'kak ka kk kakak min mimin admin gan sis bro mas mba mbak bang ' +
    'ya iya yaa yah dong deh sih kok nih tuh lah aja saja yang dan di ke dari untuk buat utk dengan dgn ' +
    'ini itu ada apa apakah mau ingin pengen bisa boleh tolong mohon saya aku aq kami kita kalau kalo klo ' +
    'juga atau tapi sudah udah belum blm nya oh ok okay ' +
    'the a an to for of and or is are be i you me my we it this that can could please do does'
  ).split(' '));

  // Chat shorthand -> full word.
  var SLANG = {
    brp: 'berapa', brapa: 'berapa', hrg: 'harga', hrga: 'harga', tgl: 'tanggal', tggl: 'tanggal',
    gk: 'tidak', ga: 'tidak', gak: 'tidak', nggak: 'tidak', ngga: 'tidak', enggak: 'tidak', tdk: 'tidak',
    dmn: 'dimana', gmn: 'bagaimana', gmna: 'bagaimana', gimana: 'bagaimana', bs: 'bisa', bsk: 'besok',
    tf: 'transfer', trf: 'transfer', pl: 'pricelist', pricelst: 'pricelist',
    mksh: 'makasih', makasi: 'makasih', thx: 'makasih', thanks: 'makasih', thank: 'makasih', tq: 'makasih',
    bkg: 'booking', book: 'booking', avail: 'available', ready: 'ready', rdy: 'ready'
  };

  function stem(w) {
    if (w.length > 5) w = w.replace(/(nya|lah|kah|pun)$/, '');
    if (w.length > 5) w = w.replace(/(ku|mu)$/, '');
    return w;
  }

  function tokenize(text) {
    return String(text || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .map(function (w) { return stem(SLANG[w] || w); })
      .filter(function (w) { return w.length >= 2 && !/^\d+$/.test(w) && !STOP.has(w); });
  }

  function lev1(a, b) {
    // True when a and b differ by at most one insert, delete or substitution.
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  // Swapped letters ("hagra") count as one typo too.
  function swap1(a, b) {
    if (a.length !== b.length) return false;
    var d = [];
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i);
    return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]];
  }

  function similar(a, b) {
    if (a === b) return true;
    var n = Math.min(a.length, b.length);
    if (n >= 4 && (lev1(a, b) || swap1(a, b))) return true;
    return n >= 5 && (a.indexOf(b) === 0 || b.indexOf(a) === 0);
  }

  var HALF_LIFE = 30 * 864e5; // learned links lose half their weight every 30 days

  function decayed(e, now) {
    return e ? e.w * Math.pow(0.5, (now - e.t) / HALF_LIFE) : 0;
  }

  // One keyword (3) always passes; so does one word shared with the text of at most a third of the templates.
  var MIN_SCORE = 1.5;

  // messages: oldest first. Returns up to `limit` {template, score, matched[]} scoring at least
  // `minScore` (default MIN_SCORE; the Chat log passes a lower one to show near misses).
  function suggest(templates, messages, learned, now, limit, minScore) {
    if (minScore == null) minScore = MIN_SCORE;
    var docs = templates.map(function (t) {
      return { t: t, kw: tokenize(t.keywords), words: new Set(tokenize(t.body + ' ' + t.category)) };
    });
    var df = {};
    docs.forEach(function (d) { d.words.forEach(function (w) { df[w] = (df[w] || 0) + 1; }); });
    // A word shared with the template text: enough on its own (1.5) when at most a third of the
    // templates use it, weaker when it is common across them.
    var idf = function (w) {
      var share = (df[w] || 1) / docs.length;
      return share <= 0.34 ? 1.5 : share <= 0.6 ? 1 : 0.5;
    };

    // Newest message counts most.
    var msgs = messages.slice(-3).reverse().map(function (m, i) {
      return { w: [1, 0.6, 0.36][i], tokens: Array.from(new Set(tokenize(m))) };
    });

    var out = docs.map(function (d) {
      var score = 0;
      var matched = new Set();
      var mine = learned[d.t.id] || {};
      msgs.forEach(function (m) {
        m.tokens.forEach(function (tk) {
          var s = 0;
          if (d.kw.some(function (k) { return similar(k, tk); })) {
            s = 3;
          } else if (d.words.has(tk)) {
            s = idf(tk);
          } else {
            for (var w of d.words) { if (similar(w, tk)) { s = 0.7 * idf(w); break; } }
          }
          // Picked twice for this word = enough on its own to be suggested.
          s += 1.2 * Math.min(3, decayed(mine[tk], now));
          if (s > 0) { score += s * m.w; matched.add(tk); }
        });
      });
      return { template: d.t, score: score, matched: Array.from(matched) };
    });

    return out
      .filter(function (s) { return s.score >= minScore; })
      .sort(function (a, b) { return b.score - a.score || (b.template.useCount || 0) - (a.template.useCount || 0); })
      .slice(0, limit);
  }

  // Link the words of the customer's newest message to the template staff picked for it.
  function learn(learned, templateId, messages, now) {
    var last = messages[messages.length - 1];
    if (!last) return learned;
    var mine = learned[templateId] || (learned[templateId] = {});
    new Set(tokenize(last)).forEach(function (tk) {
      mine[tk] = { w: decayed(mine[tk], now) + 1, t: now };
    });
    var keys = Object.keys(mine);
    if (keys.length > 150) {
      keys.sort(function (a, b) { return decayed(mine[a], now) - decayed(mine[b], now); })
        .slice(0, keys.length - 150)
        .forEach(function (k) { delete mine[k]; });
    }
    return learned;
  }

  return { tokenize: tokenize, suggest: suggest, learn: learn, MIN_SCORE: MIN_SCORE };
})();
