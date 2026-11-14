/* site-palette picker UI (v2). Colour logic lives in palette-core.js; scales in radix-colors.js. */
(() => {
  'use strict';
  const P = window.PaletteCore;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const textOn = rgb => (P.contrast(rgb, [1, 1, 1]) >= P.contrast(rgb, [0.07, 0.07, 0.08]) ? '#fff' : '#111');
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach(k => { x = x[k]; }); x[ks[ks.length - 1]] = v; }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600); }
  function copy(text, label) {
    const done = () => toast('Copied ' + (label || text));
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() { const ta = el('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
  }

  /* ---------- brief & state ---------- */
  let brief = {};
  try { brief = JSON.parse($('#brief').textContent) || {}; } catch { brief = {}; }
  const served = !!brief.served;
  let S = P.mergeState(P.defaultState(), { project: brief.project || 'My site', preview: brief.preview || 'gaming' });
  if (brief.defaults) S = P.mergeState(S, brief.defaults);
  const prev = brief.state && (brief.state.state || brief.state);
  if (prev && prev.version === 2) S = P.mergeState(S, prev);
  if (brief.project) S.project = brief.project;
  S.taste = { liked: (S.taste && S.taste.liked) || [], disliked: (S.taste && S.taste.disliked) || [] };

  const pool = P.buildPool(brief);
  const poolByKey = new Map(pool.map(p => [p.key, p]));
  const shown = [];
  let round = 0, current = [], refCands = [];
  let mode = prev && prev.version === 2 ? 'tune' : 'explore';
  let thTheme = brief.theme === 'light' ? 'light' : 'dark', pvMode = 'both', exMode = 'css', cvdMode = 'none';
  let B, chosenKey = null;

  const candFor = key => poolByKey.get(key) || refCands.find(r => r.key === key) || { key, c: P.parseKey(key) };
  function stateForCandidate(c) {
    const st = P.mergeState(S, P.candidateState(c));
    st.overrides = { light: {}, dark: {} };
    st.status = { success: 'auto', warning: 'auto', danger: 'auto', info: 'auto' };
    return st;
  }
  function describe(c) {
    const bg = c.bg === 'tinted' ? `${c.brand}-tinted background` : c.bg.startsWith('deep:') ? `deep ${c.bg.slice(5)} background` : `${c.bg.slice(8)} greys`;
    return { title: `${cap(c.brand)}${c.custom ? ' (your colour)' : ''}${c.accent ? ' + ' + cap(c.accent) : ''}`, sub: `${c.accent ? cap(c.accent) + ' accent' : 'no accent'} · ${bg}` };
  }

  /* ---------- rendering a preview site ---------- */
  function makeSite(tpl) { return document.getElementById('tpl-' + tpl).content.firstElementChild.cloneNode(true); }
  function paintSite(node, build, theme) {
    const tk = build.tokens[theme];
    for (const t of Object.values(tk)) node.style.setProperty('--' + t.name, P.hex(t.rgb));
    node.style.setProperty('--gradient-brand', `linear-gradient(135deg, ${P.hex(tk.primary.rgb)}, ${P.hex(tk.accent.rgb)})`);
    node.querySelectorAll('.pname').forEach(n => { n.textContent = S.project; });
  }

  /* ---------- explore ---------- */
  function vote(key, kind) {
    const L = S.taste.liked, D = S.taste.disliked;
    const inL = L.indexOf(key), inD = D.indexOf(key);
    if (inL >= 0) L.splice(inL, 1);
    if (inD >= 0) D.splice(inD, 1);
    if (kind === 'like' && inL < 0) L.push(key);
    if (kind === 'nope' && inD < 0) D.push(key);
    renderGrid(); renderLikedBar();
  }
  function renderLikedBar() {
    const bar = $('#likedBar'); bar.innerHTML = '';
    if (!S.taste.liked.length) return;
    bar.append(el('span', '', `♥ Liked (${S.taste.liked.length}):`));
    for (const key of S.taste.liked) {
      const p = candFor(key); if (!p.c || !P.famInfo[p.c.brand]) continue;
      const b = P.build(stateForCandidate(p.c)), tk = b.tokens[thTheme];
      const m = el('span', 'mini'); m.title = describe(p.c).title + ' · ' + describe(p.c).sub + ' · click to fine-tune';
      m.innerHTML = [tk.bg, tk.surface, tk.primary, tk.accent, tk.text].map(t => `<i style="background:${P.hex(t.rgb)}"></i>`).join('');
      m.addEventListener('click', () => fineTune(p));
      bar.append(m);
    }
  }
  function renderGrid() {
    const grid = $('#grid'); grid.innerHTML = '';
    for (const p of current) {
      const b = P.build(stateForCandidate(p.c)), tk = b.tokens[thTheme], d = describe(p.c);
      const liked = S.taste.liked.includes(p.key), nope = S.taste.disliked.includes(p.key);
      const card = el('div', 'cand' + (liked ? ' liked' : '') + (nope ? ' disliked' : ''));
      const thumb = el('div', 'thumb'); const site = makeSite(S.preview); paintSite(site, b, thTheme); thumb.append(site);
      thumb.title = 'Fine-tune this candidate';
      thumb.addEventListener('click', () => fineTune(p));
      const strip = el('div', 'strip', [tk.bg, tk['bg-subtle'], tk.surface, tk.border, tk['text-muted'], tk.text, tk.primary, tk['primary-text'], tk.accent].map(t => `<i style="background:${P.hex(t.rgb)}"></i>`).join(''));
      const meta = el('div', 'meta');
      meta.append(el('div', 'nm', `<b>${esc(d.title)} ${p.ref ? `<span class="tag">from ${esc(p.ref)}</span>` : ''}</b><span>${esc(d.sub)}</span>`));
      const like = el('button', 'vote like' + (liked ? ' on' : ''), '♥'); like.title = 'I like this';
      const nopeB = el('button', 'vote nope' + (nope ? ' on' : ''), '✕'); nopeB.title = 'Not for me';
      like.addEventListener('click', () => vote(p.key, 'like'));
      nopeB.addEventListener('click', () => vote(p.key, 'nope'));
      const go = el('button', 'btn sm', 'Fine-tune →'); go.addEventListener('click', () => fineTune(p));
      meta.append(like, nopeB, go);
      card.append(thumb, strip, meta); grid.append(card);
    }
  }
  function nextRound() {
    round++;
    // Round 1 is always a broad spread (references sit beside it rather than steering it);
    // from round 2 on, likes (including references) pull the selection toward them.
    refCands.forEach(r => { if (!shown.includes(r.key)) shown.push(r.key); });
    const taste = round === 1 ? { liked: [], disliked: S.taste.disliked } : S.taste;
    const picks = P.pickRound(pool, taste, shown, 8);
    shown.push(...picks.map(p => p.key));
    current = (round === 1 ? refCands : []).concat(picks);
    $('#roundTitle').textContent = `Round ${round}`;
    if (round > 1) $('#exSub').innerHTML = `Based on ${S.taste.liked.length} ♥ and ${S.taste.disliked.length} ✕ so far: most of this round is close to what you liked, and a few are fresh directions to check you're not missing something. Keep voting, or press <b>Fine-tune →</b> on the closest one.`;
    renderGrid(); renderLikedBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function fineTune(p) {
    S = stateForCandidate(p.c);
    chosenKey = p.key;
    if (!S.taste.liked.includes(p.key)) S.taste.liked.push(p.key);
    const d = describe(p.c);
    $('#fromCand').innerHTML = `Starting from <b>${esc(d.title)}</b> · ${esc(d.sub)}. Change anything below; <a href="#" id="backEx">back to exploring</a> keeps your votes.`;
    $('#backEx').addEventListener('click', e => { e.preventDefault(); setMode('explore'); });
    setMode('tune');
  }

  /* ---------- reference images → candidates ---------- */
  function clustersFromImage(img) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const sc = Math.min(1, 140 / Math.max(w0, h0)), cv = el('canvas');
    cv.width = Math.max(1, Math.round(w0 * sc)); cv.height = Math.max(1, Math.round(h0 * sc));
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data, pts = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) pts.push(P.oklab([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]));
    if (!pts.length) return [];
    const k = Math.min(7, pts.length);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const cent = [pts[Math.floor(rnd() * pts.length)].slice()];
    const D = pts.map(() => Infinity);
    while (cent.length < k) {
      let sum = 0; pts.forEach((p, i) => { D[i] = Math.min(D[i], d2(p, cent[cent.length - 1])); sum += D[i]; });
      let r = rnd() * sum, pick = pts.length - 1;
      for (let i = 0; i < pts.length; i++) { r -= D[i]; if (r <= 0) { pick = i; break; } }
      cent.push(pts[pick].slice());
    }
    let counts = [];
    for (let it = 0; it < 15; it++) {
      const sums = cent.map(() => [0, 0, 0]); counts = cent.map(() => 0);
      for (const p of pts) { let bi = 0, bd = Infinity; cent.forEach((c, j) => { const dd = d2(p, c); if (dd < bd) { bd = dd; bi = j; } }); counts[bi]++; sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; }
      cent.forEach((c, j) => { if (counts[j]) { c[0] = sums[j][0] / counts[j]; c[1] = sums[j][1] / counts[j]; c[2] = sums[j][2] / counts[j]; } });
    }
    return cent.map((c, j) => ({ rgb: P.fromOklch(c[0], Math.hypot(c[1], c[2]), (Math.atan2(c[2], c[1]) * 180 / Math.PI + 360) % 360), share: counts[j] / pts.length })).filter(c => c.share > 0);
  }
  function addReference(img, name) {
    const cand = P.candidateFromClusters(clustersFromImage(img));
    if (!cand) { toast(`No clear colours found in ${name}`); return; }
    cand.ref = name;
    refCands.push(cand);
    if (!S.taste.liked.includes(cand.key)) S.taste.liked.push(cand.key);
    if (round >= 1) { current = [cand].concat(current.filter(p => p.key !== cand.key)); renderGrid(); renderLikedBar(); }
    toast(`Added a candidate from ${name}; the next round will lean toward it`);
  }
  function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { addReference(im, file.name.length > 24 ? file.name.slice(0, 22) + '…' : file.name); URL.revokeObjectURL(u); };
    im.src = u;
  }
  function loadBriefReferences() {
    const refs = served && Array.isArray(brief.references) ? brief.references : [];
    return Promise.all(refs.map((r, i) => new Promise(res => {
      const im = new Image();
      im.onload = () => { const cand = P.candidateFromClusters(clustersFromImage(im)); if (cand) { cand.ref = (r.label || String(r.path || r).split('/').pop()).slice(0, 24); refCands.push(cand); if (!S.taste.liked.includes(cand.key)) S.taste.liked.push(cand.key); } res(); };
      im.onerror = () => res();
      im.src = `/ref/${i}`;
    })));
  }

  /* ---------- fine-tune ---------- */
  function fillSelect(sel, items, current) {
    sel.innerHTML = '';
    for (const [v, label] of items) sel.append(new Option(label, v));
    sel.value = current;
  }
  const famOpts = list => list.map(f => [f, cap(f)]);
  function syncControls() {
    fillSelect($('#bFam'), famOpts(P.FAMILIES), S.brand.family);
    $('#bHex').value = S.brand.custom || '';
    $('#bCol').value = S.brand.custom || P.RX.light[S.brand.family][8];
    fillSelect($('#aFam'), [['none', 'None (use brand)']].concat(famOpts(P.FAMILIES.filter(f => f !== S.brand.family))), S.accent.family || 'none');
    $('#bgMode').value = S.background.mode || 'neutral';
    const m = $('#bgMode').value;
    $('#bgFamRow').hidden = m === 'tinted';
    if (m === 'neutral') fillSelect($('#bgFam'), [['', `Paired (${cap(P.PAIR[S.brand.family] || 'gray')})`]].concat(famOpts(P.GRAYS)), S.background.family || '');
    if (m === 'deep') fillSelect($('#bgFam'), famOpts(P.DEEP.concat(P.FAMILIES.filter(f => !P.DEEP.includes(f)))), S.background.family || P.DEEP.find(f => f !== S.brand.family));
    fillSelect($('#nFam'), [['auto', `Auto (${cap(P.PAIR[S.brand.family] || 'gray')})`]].concat(famOpts(P.GRAYS)), S.neutral || 'auto');
    $$('[data-status]').forEach(sel => { const k = sel.dataset.status; fillSelect(sel, [['auto', 'Auto']].concat(famOpts(P.STATUS_CHOICES[k])), S.status[k] || 'auto'); });
    $$('[data-path]').forEach(inp => { const v = getPath(S, inp.dataset.path); if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = String(v); });
    $('#tplSel').value = S.preview;
  }
  function bindControls() {
    const on = (id, ev, fn) => $(id).addEventListener(ev, e => { fn(e.target.value, e); update(); });
    on('#bFam', 'input', v => { S.brand.family = v; S.brand.custom = null; if (S.accent.family === v) S.accent.family = null; });
    const setCustom = v => { const rgb = P.fromHex(v); if (!rgb) return; S.brand.custom = P.hex(rgb); S.brand.family = P.nearestFamily(rgb); };
    on('#bHex', 'change', v => { if (!v.trim()) S.brand.custom = null; else setCustom(v); });
    on('#bCol', 'input', setCustom);
    $('#bClear').addEventListener('click', () => { S.brand.custom = null; update(); });
    on('#aFam', 'input', v => { S.accent.family = v === 'none' ? null : v; });
    on('#bgMode', 'input', v => { S.background.mode = v; S.background.family = v === 'deep' ? P.DEEP.find(f => f !== S.brand.family) : null; });
    on('#bgFam', 'input', v => { S.background.family = v || null; });
    on('#nFam', 'input', v => { S.neutral = v; });
    $$('[data-status]').forEach(sel => sel.addEventListener('input', () => { S.status[sel.dataset.status] = sel.value; update(); }));
    $$('[data-path]').forEach(inp => inp.addEventListener(inp.type === 'text' ? 'change' : 'input', () => {
      setPath(S, inp.dataset.path, inp.type === 'checkbox' ? inp.checked : inp.value); update();
    }));
    $('#resetOv').addEventListener('click', () => { S.overrides = { light: {}, dark: {} }; update(); });
    $$('#pvTabs button').forEach(b => b.addEventListener('click', () => { pvMode = b.dataset.v; $$('#pvTabs button').forEach(x => x.classList.toggle('on', x === b)); renderPreviews(); }));
    $$('#exTabs button').forEach(b => b.addEventListener('click', () => { exMode = b.dataset.v; $$('#exTabs button').forEach(x => x.classList.toggle('on', x === b)); renderExport(); }));
    $('#copyEx').addEventListener('click', () => copy($('#ex').textContent, exMode === 'css' ? 'CSS' : 'JSON'));
    $('#sum').addEventListener('click', () => $('#checksPanel').scrollIntoView({ behavior: 'smooth' }));
  }
  function renderPreviews() {
    const box = $('#previews'); box.innerHTML = '';
    box.className = 'previews' + (pvMode === 'both' ? ' both' : '');
    for (const th of ['light', 'dark']) {
      if (pvMode !== 'both' && pvMode !== th) continue;
      const s = makeSite(S.preview); paintSite(s, B, th); box.append(s);
    }
  }
  function renderChecks() {
    const r = B.report, ok = !r.failures.length, sum = $('#sum');
    sum.className = 'chip ' + (ok ? 'ok' : 'bad');
    sum.textContent = ok ? `✓ ${r.passed}/${r.total} contrast checks pass (${r.target})` : `✗ ${r.failures.length} contrast failure${r.failures.length > 1 ? 's' : ''}`;
    let h = ok ? `<p class="ok">✓ All ${r.total} text and control pairings pass in light and dark themes.</p>`
      : `<p class="bad"><b>${r.failures.length} pairing(s) fail:</b></p><ul>${r.failures.map(f => `<li class="bad">${f.theme} · <b>${f.token}</b> on ${f.against}: ${f.ratio}:1 (needs ${f.min}:1) at ${f.step}. Turn on auto-fix or choose another step.</li>`).join('')}</ul>`;
    if (r.adjusted.length) h += `<p><b>Auto-fixed</b>: moved from their usual step so they pass.</p><ul>${r.adjusted.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
    if (r.warnings.length) h += `<p><b>Warnings</b></p><ul>${r.warnings.map(w => `<li class="warn">⚠ ${esc(w.message)}</li>`).join('')}</ul>`;
    if (r.notes.length) h += `<p><b>Notes</b></p><ul>${r.notes.map(w => `<li>${esc(w.message)}</li>`).join('')}</ul>`;
    $('#checks').innerHTML = h;
  }
  function renderScales() {
    const box = $('#scales'); box.innerHTML = '';
    for (const k of ['brand', 'accent', 'neutral', 'canvas', 'success', 'warning', 'danger', 'info']) {
      const sc = B.scales[k]; if (sc.alias) continue;
      for (const th of ['light', 'dark']) {
        const row = el('div', 'scale');
        row.append(el('div', 'nm', `<b>${k}</b> · ${sc.family}${sc.custom ? ' (your colour at 9)' : ''} <span class="hint">${th}</span>`));
        const sw = el('div', 'sw');
        sc[th].forEach((h, i) => { const c = P.fromHex(h); const d = el('div', '', String(i + 1)); d.style.background = h; d.style.color = textOn(c); d.title = `${k}-${i + 1} ${h}`; d.addEventListener('click', () => copy(h)); sw.append(d); });
        row.append(sw); box.append(row);
      }
    }
  }
  function tokenCell(theme, t) {
    const td = el('td'), cell = el('div', 'cell');
    const chip = el('span', 'chipc'); chip.style.background = P.hex(t.rgb); chip.title = P.hex(t.rgb); cell.append(chip);
    if (t.derived) cell.append(el('span', 'tg', t.step === 'white' ? 'white' : 'near-black'), el('span', 'tg', 'auto'));
    else {
      const sel = el('select'), cur = S.overrides[theme][t.name];
      const autoLabel = t.override ? `${t.scale}-${P.stepLabel(t.pref)}` : `${t.scale}-${P.stepLabel(t.step)}`;
      sel.append(new Option(`Auto (${autoLabel})`, ''));
      sel.append(new Option('white', 'white'));
      for (let i = 1; i <= 12; i++) sel.append(new Option(`step ${i}`, String(i)));
      sel.value = cur === undefined || cur === null ? '' : String(cur);
      sel.addEventListener('input', () => { if (sel.value === '') delete S.overrides[theme][t.name]; else S.overrides[theme][t.name] = sel.value === 'white' ? 'white' : +sel.value; update(); });
      cell.append(sel);
      if (t.auto) cell.append(el('span', 'tg auto', 'auto-fixed'));
      if (t.override) cell.append(el('span', 'tg ov', 'manual'));
    }
    if (t.check) cell.append(el('span', 'ratio ' + (t.check.pass ? 'ok' : 'bad'), `${t.check.ratio.toFixed(2)}:1 ${t.check.pass ? '✓' : '✗'} <span class="use">vs ${t.check.vs}${t.check.kind === 'bold-label' ? ' (bold label)' : ''}</span>`));
    td.append(cell); return td;
  }
  function renderTokens() {
    const body = $('#tok'); body.innerHTML = ''; let grp = '';
    for (const name of Object.keys(B.tokens.light)) {
      const L = B.tokens.light[name], D = B.tokens.dark[name];
      if (L.group !== grp) { grp = L.group; const r = el('tr', 'grp'); const td = el('td', '', grp); td.colSpan = 3; r.append(td); body.append(r); }
      const tr = el('tr');
      tr.append(el('td', '', `<div class="tn">--${esc(S.export.prefix || '')}${name}</div><div class="use">${esc(L.use)}</div>`), tokenCell('light', L), tokenCell('dark', D));
      body.append(tr);
    }
  }
  function renderExport() { const f = B.files(); $('#ex').textContent = exMode === 'css' ? f['palette.css'] : f['palette.tokens.json']; }
  function update() {
    B = P.build(S); S = B.state;
    $('#proj').textContent = S.project;
    if (mode !== 'tune') return;
    syncControls(); renderPreviews(); renderChecks(); renderScales(); renderTokens(); renderExport();
    [['#bSw', B.scales.brand.light[8]], ['#aSw', B.scales.accent.light[8]], ['#gSw', B.scales.canvas.dark[1]]].forEach(([id, h]) => { $(id).style.background = h; });
  }

  /* ---------- mode, export, send ---------- */
  function setMode(m) {
    mode = m;
    $$('#mode button').forEach(b => b.classList.toggle('on', b.dataset.v === m));
    $('#explore').hidden = m !== 'explore';
    $('#tune').hidden = m !== 'tune';
    $('#sum').hidden = m !== 'tune';
    if (m === 'tune') update(); else { renderGrid(); renderLikedBar(); }
    window.scrollTo({ top: 0 });
  }
  function download() {
    B = P.build(S);
    Object.entries(B.files()).forEach(([name, body], i) => setTimeout(() => {
      const a = el('a'); a.href = URL.createObjectURL(new Blob([body], { type: name.endsWith('.css') ? 'text/css' : 'application/json' }));
      a.download = name; document.body.append(a); a.click(); a.remove();
    }, i * 250));
    toast('Downloading 3 files');
  }
  async function send() {
    if (mode === 'explore' && !chosenKey && !(prev && prev.version === 2)) { toast('Pick a candidate with "Fine-tune →" first'); return; }
    B = P.build(S);
    const btn = $('#send'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: B.files() }) });
      if (!res.ok) throw new Error(await res.text());
      $('#overlay').classList.add('on'); btn.textContent = 'Sent ✓';
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Send to Claude';
      alert('Could not reach Claude\'s local server (' + e.message + '). Use "Download files" instead and tell Claude where they are.');
    }
  }

  /* ---------- wiring ---------- */
  $$('#mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.v)));
  $$('#thTabs button').forEach(b => { b.classList.toggle('on', b.dataset.v === thTheme); b.addEventListener('click', () => { thTheme = b.dataset.v; $$('#thTabs button').forEach(x => x.classList.toggle('on', x === b)); renderGrid(); renderLikedBar(); }); });
  $('#tplSel').addEventListener('input', e => { S.preview = e.target.value; if (mode === 'tune') update(); else renderGrid(); });
  $('#cvd').addEventListener('input', e => { cvdMode = e.target.value; const f = cvdMode === 'none' ? '' : `url(#f-${cvdMode})`; $('#grid').style.filter = f; $('#stage').style.filter = f; });
  $('#next').addEventListener('click', nextRound);
  $('#resetTaste').addEventListener('click', () => { S.taste = { liked: [], disliked: [] }; shown.length = 0; round = 0; refCands = []; nextRound(); });
  $('#file').addEventListener('change', e => loadImageFile(e.target.files[0]));
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
  document.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (mode === 'explore') loadImageFile(e.dataTransfer.files[0]); });
  $('#dl').addEventListener('click', download);
  if (served) { $('#send').hidden = false; $('#send').addEventListener('click', send); }
  bindControls();

  $('#tplSel').value = S.preview;
  loadBriefReferences().then(() => {
    nextRound();
    if (mode === 'tune') { $('#fromCand').textContent = 'Restored from your previous palette.'; setMode('tune'); }
    else setMode('explore');
  });
})();
