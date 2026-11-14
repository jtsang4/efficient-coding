/* site-palette core (v2): curated Radix scales, semantic tokens, contrast checks, candidate
   pool + taste learning, and exporters. Plain script, no dependencies.
   Browser: load radix-colors.js first, then this file → window.PaletteCore.
   Node: require() this file → globalThis.PaletteCore (it loads radix-colors.js itself). */
(function (root) {
  'use strict';
  if (!root.RADIX_COLORS && typeof require === 'function') root.RADIX_COLORS = require('./radix-colors.js');
  const RX = root.RADIX_COLORS;

  /* ---------- colour math ---------- */
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toGam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function linToOklab(r, g, b) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function oklabToLin(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  }
  const oklab = c => linToOklab(toLin(c[0]), toLin(c[1]), toLin(c[2]));
  const oklch = c => { const [L, a, b] = oklab(c); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };
  const inGamut = v => v.every(x => x >= -1e-5 && x <= 1 + 1e-5);
  function fromOklch(L, C, h) {
    L = clamp01(L); C = Math.max(0, C);
    const hr = h * Math.PI / 180, ca = Math.cos(hr), sa = Math.sin(hr);
    let lin = oklabToLin(L, C * ca, C * sa);
    if (!inGamut(lin)) {
      let lo = 0, hi = C;
      for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklabToLin(L, mid * ca, mid * sa))) lo = mid; else hi = mid; }
      lin = oklabToLin(L, lo * ca, lo * sa);
    }
    return lin.map(v => toGam(clamp01(v)));
  }
  const hex = c => '#' + c.map(v => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');
  function fromHex(h) {
    h = String(h || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const lum = c => 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2]);
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const deltaE = (a, b) => { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100; };
  const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const CVD = {
    protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  };
  function simulate(c, mode) {
    const M = CVD[mode]; if (!M) return c;
    const r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
    return [M[0] * r + M[1] * g + M[2] * b, M[3] * r + M[4] * g + M[5] * b, M[6] * r + M[7] * g + M[8] * b].map(v => toGam(clamp01(v)));
  }

  /* ---------- curated families ---------- */
  const GRAYS = ['gray', 'mauve', 'slate', 'sage', 'olive', 'sand'];
  const FAMILIES = Object.keys(RX.light).filter(f => !GRAYS.includes(f));
  // Radix's documented "natural pairing" of each hue with a grey.
  const PAIR = { tomato: 'mauve', red: 'mauve', ruby: 'mauve', crimson: 'mauve', pink: 'mauve', plum: 'mauve', purple: 'mauve', violet: 'mauve',
    iris: 'slate', indigo: 'slate', blue: 'slate', sky: 'slate', cyan: 'slate', mint: 'sage', teal: 'sage', jade: 'sage', green: 'sage',
    grass: 'olive', lime: 'olive', yellow: 'sand', amber: 'sand', orange: 'sand', brown: 'sand', gold: 'sand', bronze: 'sand' };
  // Bright scales whose step 9 takes dark text (Radix guidance).
  const BRIGHT = ['sky', 'mint', 'lime', 'yellow', 'amber'];
  // Families that make good deep, coloured dark-mode backgrounds.
  const DEEP = ['indigo', 'iris', 'violet', 'purple', 'plum', 'blue', 'cyan', 'teal', 'jade', 'crimson', 'ruby', 'brown', 'bronze', 'tomato'];
  const STATUS_CHOICES = { success: ['grass', 'green', 'jade', 'teal'], warning: ['amber', 'orange', 'yellow'], danger: ['red', 'tomato', 'ruby', 'crimson'], info: ['blue', 'sky', 'indigo', 'cyan'] };
  const STATUS = Object.keys(STATUS_CHOICES);
  const WHITE = [1, 1, 1];

  const famInfo = {};
  for (const f of Object.keys(RX.light)) {
    const [L, C, h] = oklch(fromHex(RX.light[f][8]));
    const [dL, dC, dh] = oklch(fromHex(RX.dark[f][0]));
    famInfo[f] = { L, C, h, bgL: dL, bgC: dC, bgH: dh };
  }
  function nearestFamily(rgb, pool) {
    const p = oklab(rgb); let best = null, bd = Infinity;
    for (const f of pool || FAMILIES) { const q = oklab(fromHex(RX.light[f][8])); const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  /* Pick a status family whose hue stays clear of the brand and that doesn't look like the accent
     (perceptual ΔE ≥ 10 on step 9). Falls back step by step when no choice satisfies both. */
  function autoStatus(kind, brandHue, accentRgb) {
    const ch = STATUS_CHOICES[kind];
    const farFromBrand = f => hueDist(famInfo[f].h, brandHue) >= 25;
    const unlikeAccent = f => !accentRgb || deltaE(fromHex(RX.light[f][8]), accentRgb) >= 10;
    return ch.find(f => farFromBrand(f) && unlikeAccent(f)) || ch.find(farFromBrand) || ch[0];
  }

  /* ---------- state ---------- */
  function defaultState() {
    return {
      version: 2,
      project: 'My site',
      preview: 'saas',
      brand: { family: 'indigo', custom: null },
      accent: { family: 'amber' },
      neutral: 'auto',
      background: { mode: 'neutral', family: null },
      status: { success: 'auto', warning: 'auto', danger: 'auto', info: 'auto' },
      rules: { target: 'AA', buttonText: 'bold', enforce: true },
      overrides: { light: {}, dark: {} },
      export: { format: 'hex', prefix: 'color-', darkSelector: '[data-theme="dark"]', media: true },
      taste: { liked: [], disliked: [] },
    };
  }
  function mergeState(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? mergeState(base[k], v) : v;
    }
    return out;
  }

  /* Scales used by a state. Each is { name, family, light: [12 hex], dark: [12 hex] }. */
  function resolveScales(s) {
    const fam = (name, f) => ({ name, family: f, light: RX.light[f].slice(), dark: RX.dark[f].slice() });
    const bf = RX.light[s.brand.family] ? s.brand.family : 'indigo';
    const brand = fam('brand', bf);
    const custom = s.brand.custom && fromHex(s.brand.custom);
    if (custom) { brand.light[8] = hex(custom); brand.dark[8] = hex(custom); brand.custom = hex(custom); }
    const brandHue = custom ? oklch(custom)[2] : famInfo[bf].h;
    const af = s.accent && s.accent.family && RX.light[s.accent.family] ? s.accent.family : null;
    const accent = af ? fam('accent', af) : Object.assign(fam('accent', bf), { alias: 'brand' });
    const nf = s.neutral && s.neutral !== 'auto' && RX.light[s.neutral] ? s.neutral : (PAIR[bf] || 'gray');
    const neutral = fam('neutral', nf);
    // Background ("canvas") scale. A deep colour is a dark-theme character: in light theme the page
    // stays on the neutral greys. A brand tint colours only the light page backgrounds (steps 1–3);
    // borders keep the neutral greys so controls don't turn into brand-coloured outlines.
    let canvas;
    const mode = s.background && s.background.mode;
    if (mode === 'tinted') {
      canvas = fam('canvas', bf);
      canvas.light = RX.light[bf].slice(0, 3).concat(RX.light[nf].slice(3));
    } else if (mode === 'deep' && s.background.family && RX.light[s.background.family]) {
      canvas = fam('canvas', s.background.family);
      canvas.light = RX.light[nf].slice();
    } else if (mode === 'neutral' && s.background.family && GRAYS.includes(s.background.family)) canvas = fam('canvas', s.background.family);
    else canvas = Object.assign(fam('canvas', nf), { alias: 'neutral' });
    const out = { brand, accent, neutral, canvas };
    const accentRgb = af ? fromHex(accent.light[8]) : null;
    for (const k of STATUS) {
      const pick = s.status && s.status[k] && s.status[k] !== 'auto' && RX.light[s.status[k]] ? s.status[k] : autoStatus(k, brandHue, accentRgb);
      out[k] = fam(k, pick);
    }
    out.brandHue = brandHue;
    return out;
  }

  /* ---------- semantic tokens ----------
     step: 1–12 (Radix scale step) or 'white'. fallbacks are tried in order when a check fails
     and auto-fix is on. 'on' tokens pick white or near-black text for the token they sit on. */
  function tokenSpecs() {
    const T = [];
    const t = (name, group, scale, step, opt) => T.push(Object.assign({ name, group, scale, step }, opt || {}));
    t('bg', 'Surfaces', 'canvas', 1, { use: 'Page background' });
    t('bg-subtle', 'Surfaces', 'canvas', 2, { use: 'Alternating sections, sidebars' });
    t('surface', 'Surfaces', 'canvas', { light: 'white', dark: 2 }, { use: 'Cards, inputs, nav bar' });
    t('surface-hover', 'Surfaces', 'canvas', { light: 3, dark: 3 }, { use: 'Hovered rows and cards' });
    t('border', 'Surfaces', 'canvas', 6, { use: 'Dividers, card borders' });
    t('border-strong', 'Surfaces', 'canvas', 7, { fallbacks: [8, 9, 'neutral:9', 'neutral:10', 11], check: { vs: 'bg', min: 'ui' }, use: 'Input and control borders' });
    t('text', 'Text', 'neutral', 12, { check: { vs: 'bg', min: 'text' }, use: 'Body text, headings' });
    t('text-muted', 'Text', 'neutral', 11, { fallbacks: [12], check: { vs: 'bg', min: 'text' }, use: 'Secondary text, captions' });
    t('primary', 'Brand', 'brand', 9, { fallbacks: [10, 11], check: { on: 'on-primary' }, use: 'Primary buttons, key actions' });
    t('primary-hover', 'Brand', 'brand', 10, { use: 'Hover state of primary' });
    t('on-primary', 'Brand', 'auto', null, { base: 'primary', use: 'Text and icons on primary' });
    t('primary-subtle', 'Brand', 'brand', 3, { use: 'Tinted badges, selected rows' });
    t('primary-text', 'Brand', 'brand', 11, { fallbacks: [12], check: { vs: 'bg', min: 'text' }, use: 'Links, brand-coloured text' });
    t('ring', 'Brand', 'brand', 8, { fallbacks: [9, 10, 11], check: { vs: 'bg', min: 'ui' }, use: 'Focus outline' });
    t('accent', 'Accent', 'accent', 9, { fallbacks: [10, 11], check: { on: 'on-accent' }, use: 'Highlights, badges, promos' });
    t('on-accent', 'Accent', 'auto', null, { base: 'accent', use: 'Text on accent' });
    t('accent-subtle', 'Accent', 'accent', 3, { use: 'Accent-tinted backgrounds' });
    t('accent-text', 'Accent', 'accent', 11, { fallbacks: [12], check: { vs: 'bg', min: 'text' }, use: 'Accent-coloured text' });
    for (const k of STATUS) {
      t(k, 'Status', k, 9, { fallbacks: [10, 11], check: { vs: 'bg', min: 'ui' }, use: `${k} icons and solid marks` });
      t(k + '-subtle', 'Status', k, 3, { use: `${k} message background` });
      t(k + '-text', 'Status', k, 11, { fallbacks: [12], check: { vs: k + '-subtle', min: 'text' }, use: `${k} message text` });
      t(k + '-border', 'Status', k, 6, { use: `${k} message border` });
    }
    return T;
  }
  const stepLabel = step => (step === 'white' ? 'white' : String(step));

  function resolveTokens(s, SC) {
    const target = s.rules.target === 'AAA' ? 7 : 4.5;
    const minOf = m => (m === 'text' ? target : 3);
    const out = { light: {}, dark: {} };
    for (const theme of ['light', 'dark']) {
      const res = out[theme];
      const ink = fromHex(RX.dark[SC.neutral.family][0]);
      const colorAt = (scale, step) => (step === 'white' ? WHITE : fromHex(SC[scale][theme][step - 1]));
      const split = (scale, st) => (typeof st === 'string' && st.includes(':') ? [st.split(':')[0], +st.split(':')[1]] : [scale, st]);
      for (const spec of tokenSpecs()) {
        if (spec.scale === 'auto') {
          const b = res[spec.base];
          res[spec.name] = { name: spec.name, group: spec.group, use: spec.use, scale: 'neutral', step: b.onWhite ? 'white' : 'ink', rgb: b.onWhite ? WHITE : ink, derived: true, check: null };
          continue;
        }
        const pref = typeof spec.step === 'object' && spec.step !== null ? spec.step[theme] : spec.step;
        const scaleName = SC[spec.scale].alias || spec.scale;
        // Text colour for solid fills: "bold" follows Radix (white unless a bright scale, needs 3:1),
        // "strict" picks whichever of white / near-black reaches WCAG body-text contrast.
        const onFor = c => {
          const cw = contrast(c, WHITE), ci = contrast(c, ink);
          if (s.rules.buttonText === 'strict') return { white: cw >= target || cw >= ci, ratio: cw >= target || cw >= ci ? cw : ci, min: target };
          const bright = BRIGHT.includes(SC[spec.scale].family) && !SC[spec.scale].custom || (SC[spec.scale].custom && oklch(c)[0] > 0.75);
          const white = !bright && cw >= 3 ? true : !bright && cw >= ci;
          return { white, ratio: white ? cw : ci, min: 3 };
        };
        const ratioAt = st => {
          if (!spec.check) return null;
          const [sc, step] = split(spec.scale, st);
          const c = colorAt(sc, step);
          if (spec.check.on) return onFor(c).ratio;
          return contrast(c, res[spec.check.vs].rgb);
        };
        const minFor = st => (spec.check ? (spec.check.on ? onFor(colorAt(...split(spec.scale, st))).min : minOf(spec.check.min)) : null);
        const ov = s.overrides && s.overrides[theme] ? s.overrides[theme][spec.name] : undefined;
        const hasOv = ov !== undefined && ov !== null && ov !== '';
        let step = hasOv ? ov : pref, auto = false;
        if (!hasOv && spec.check && s.rules.enforce && ratioAt(pref) < minFor(pref) - 1e-9) {
          const hit = (spec.fallbacks || []).find(st => ratioAt(st) >= minFor(st) - 1e-9);
          if (hit !== undefined) { step = hit; auto = true; }
        }
        const [usedScale, usedStep] = split(spec.scale, step);
        const rgb = colorAt(usedScale, usedStep);
        const tok = { name: spec.name, group: spec.group, use: spec.use, scale: SC[usedScale].alias || usedScale, family: SC[usedScale].family, step: usedStep, pref, rgb, auto, override: hasOv, check: null };
        if (spec.check) {
          const ratio = ratioAt(step), min = minFor(step);
          tok.check = { vs: spec.check.on || spec.check.vs, kind: spec.check.on ? (min === 3 ? 'bold-label' : 'text') : spec.check.min, min, ratio, pass: ratio >= min - 1e-9 };
          if (spec.check.on) tok.onWhite = onFor(rgb).white;
        }
        res[spec.name] = tok;
      }
    }
    return out;
  }

  function report(s, SC, tok) {
    const checks = [];
    for (const theme of ['light', 'dark']) for (const t of Object.values(tok[theme])) {
      if (t.check) checks.push({ theme, token: t.name, against: t.check.vs, ratio: +t.check.ratio.toFixed(2), min: t.check.min, kind: t.check.kind, pass: t.check.pass, autoAdjusted: !!t.auto, step: `${t.scale}-${stepLabel(t.step)}`, preferredStep: `${t.scale}-${stepLabel(t.pref)}` });
    }
    const warnings = [], notes = [];
    for (const k of ['success', 'warning', 'danger']) {
      const d = hueDist(SC.brandHue, famInfo[SC[k].family].h);
      if (famInfo[SC.brand.family].C > 0.08 && d < 22) warnings.push({ kind: 'hue-collision', message: `The brand hue is close to the ${k} colour (${SC[k].family}), so primary actions may read as "${k}". Rely on icons and labels for ${k} messages, or pick another ${k} family.` });
    }
    // An accent close to a status hue makes accent badges read as status messages.
    if (!SC.accent.alias && famInfo[SC.accent.family].C > 0.08) {
      for (const k of ['success', 'warning', 'danger']) {
        const d = deltaE(fromHex(SC.accent.light[8]), fromHex(SC[k].light[8]));
        if (d < 10) warnings.push({ kind: 'accent-status', message: `The accent (${SC.accent.family}) is close to the ${k} colour (${SC[k].family}), so accent badges may read as "${k}". Pick another accent or ${k} family, or always pair ${k} messages with icons and words.` });
      }
    }
    const dS = fromHex(SC.success.light[8]), dD = fromHex(SC.danger.light[8]);
    const cvdD = Math.min(deltaE(simulate(dS, 'deutan'), simulate(dD, 'deutan')), deltaE(simulate(dS, 'protan'), simulate(dD, 'protan')));
    if (cvdD < 10) notes.push({ kind: 'cvd', message: `Success (${SC.success.family}) and danger (${SC.danger.family}) are hard to tell apart with red-green colour blindness (ΔE ${cvdD.toFixed(1)}). Pair them with icons or words, or use teal for success.` });
    if (s.rules.buttonText === 'bold') {
      const weak = checks.filter(c => c.kind === 'bold-label' && c.ratio < (s.rules.target === 'AAA' ? 7 : 4.5));
      if (weak.length) notes.push({ kind: 'bold-labels', message: `Button labels follow the Radix convention (white on step 9, at least 3:1), which meets WCAG only for bold or large text: ${weak.map(c => `${c.theme} ${c.token} ${c.ratio}:1`).join(', ')}. Choose "strict" button text for 4.5:1 everywhere.` });
    }
    const adjusted = checks.filter(c => c.autoAdjusted).map(c => `${c.theme} ${c.token}: ${c.preferredStep} → ${c.step}`);
    return { target: s.rules.target, passed: checks.filter(c => c.pass).length, total: checks.length, failures: checks.filter(c => !c.pass), adjusted, warnings, notes, checks };
  }

  /* ---------- exporters ---------- */
  const r3 = x => (+x.toFixed(3)).toString();
  function cssColor(h, fmt) {
    if (fmt !== 'oklch') return h;
    const [L, C, hh] = oklch(fromHex(h));
    return C < 0.0008 ? `oklch(${r3(L)} 0 0)` : `oklch(${r3(L)} ${r3(C)} ${(+hh.toFixed(1)).toString()})`;
  }
  const SCALE_ORDER = ['brand', 'accent', 'neutral', 'canvas', 'success', 'warning', 'danger', 'info'];
  const emitted = SC => SCALE_ORDER.filter(k => !SC[k].alias);
  const tokenValue = (t, p) => (t.step === 'white' ? '#ffffff' : t.step === 'ink' ? `var(--${p}neutral-ink)` : `var(--${p}${t.scale}-${t.step})`);

  function toCSS(s, SC, tok) {
    const p = s.export.prefix || '', fmt = s.export.format, date = new Date().toISOString().slice(0, 10);
    const ramps = (theme, ind) => {
      const L = [];
      for (const k of emitted(SC)) {
        const composed = k === 'canvas' && theme === 'light' && s.background.mode !== 'neutral' ? (s.background.mode === 'deep' ? ` (light theme uses the ${SC.neutral.family} greys)` : ` (steps 1-3 ${SC.brand.family}, 4-12 ${SC.neutral.family})`) : '';
        L.push(`${ind}/* ${k}: Radix ${SC[k].family}${composed}${SC[k].custom ? ` with your colour ${SC[k].custom} at step 9` : ''} */`);
        SC[k][theme].forEach((h, i) => L.push(`${ind}--${p}${k}-${i + 1}: ${cssColor(h, fmt)};`));
      }
      L.push(`${ind}--${p}neutral-ink: ${cssColor(RX.dark[SC.neutral.family][0], fmt)}; /* dark text on bright fills */`);
      return L;
    };
    const sem = (theme, ind) => {
      const L = []; let g = '';
      for (const t of Object.values(tok[theme])) {
        if (t.group !== g) { g = t.group; L.push(`${ind}/* ${g} */`); }
        L.push(`${ind}--${p}${t.name}: ${tokenValue(t, p)};`);
      }
      L.push(`${ind}--gradient-brand: linear-gradient(135deg, var(--${p}primary), var(--${p}accent));`);
      L.push(`${ind}color-scheme: ${theme};`);
      return L;
    };
    const out = [
      `/* Colour tokens for ${s.project}, generated by the site-palette skill on ${date}.`,
      `   Scales are Radix Colors (MIT); light and dark ramps are tuned separately, so dark mode redefines them.`,
      `   Change the palette by re-running the skill with palette.state.json rather than editing by hand. */`,
      ':root {', '  /* Scales: light theme */', ...ramps('light', '  '), '', '  /* Semantic tokens: light theme (default) */', ...sem('light', '  '), '}', '',
      `${s.export.darkSelector || '[data-theme="dark"]'} {`, '  /* Scales: dark theme */', ...ramps('dark', '  '), '', '  /* Semantic tokens: dark theme */', ...sem('dark', '  '), '}',
    ];
    if (s.export.media) out.push('', '/* Follow the OS setting unless the page opts into a theme explicitly */', '@media (prefers-color-scheme: dark) {', '  :root:not([data-theme="light"]):not(.light) {', ...ramps('dark', '    '), ...sem('dark', '    '), '  }', '}');
    return out.join('\n') + '\n';
  }

  function toTokensJSON(s, SC, tok) {
    const color = { light: {}, dark: {} };
    for (const th of ['light', 'dark']) {
      for (const k of emitted(SC)) { color[th][k] = {}; SC[k][th].forEach((h, i) => { color[th][k][i + 1] = { $type: 'color', $value: h }; }); }
      color[th].neutral.ink = { $type: 'color', $value: RX.dark[SC.neutral.family][0] };
    }
    const theme = {};
    for (const th of ['light', 'dark']) {
      theme[th] = {};
      for (const t of Object.values(tok[th])) {
        const v = t.step === 'white' ? '#ffffff' : t.step === 'ink' ? `{color.${th}.neutral.ink}` : `{color.${th}.${t.scale}.${t.step}}`;
        theme[th][t.name] = { $type: 'color', $value: v, $description: t.use };
      }
    }
    return { $description: `Colour tokens for ${s.project} (W3C Design Tokens format), generated by site-palette from Radix Colors (MIT)`, color, theme };
  }

  function toStateFile(s, SC, tok, rep) {
    const flat = th => Object.fromEntries(Object.values(tok[th]).map(t => [t.name, { step: t.step === 'white' ? 'white' : t.step === 'ink' ? 'neutral-ink' : `${t.scale}-${t.step}`, hex: hex(t.rgb) }]));
    return {
      state: s,
      summary: {
        project: s.project,
        families: Object.fromEntries(SCALE_ORDER.map(k => [k, SC[k].family + (SC[k].alias ? ` (same as ${SC[k].alias})` : '')])),
        brandCustom: SC.brand.custom || null,
        background: s.background,
        light: flat('light'), dark: flat('dark'),
      },
      report: { target: rep.target, passed: rep.passed, total: rep.total, failures: rep.failures, adjusted: rep.adjusted, warnings: rep.warnings, notes: rep.notes },
      generatedAt: new Date().toISOString(),
    };
  }

  function build(state) {
    const s = mergeState(defaultState(), state || {});
    if (s.version !== 2) s.version = 2;
    const SC = resolveScales(s), tok = resolveTokens(s, SC), rep = report(s, SC, tok);
    return {
      state: s, scales: SC, tokens: tok, report: rep,
      files: () => ({
        'palette.css': toCSS(s, SC, tok),
        'palette.tokens.json': JSON.stringify(toTokensJSON(s, SC, tok), null, 2) + '\n',
        'palette.state.json': JSON.stringify(toStateFile(s, SC, tok, rep), null, 2) + '\n',
      }),
    };
  }

  /* ---------- candidates & taste learning ----------
     A candidate is { brand, accent, bg } where bg is "neutral:<grey>", "tinted" or "deep:<family>".
     Every colour comes from a curated scale; the pool covers several thousand combinations. */
  const keyOf = c => `${c.brand}${c.custom ? '=' + c.custom : ''}|${c.accent || '-'}|${c.bg}`;
  function parseKey(k) {
    const [b, accent, bg] = k.split('|');
    const [brand, custom] = b.split('=');
    return { brand, custom: custom || null, accent: accent === '-' ? null : accent, bg };
  }
  function candidateState(c) {
    const [mode, fam] = c.bg.split(':');
    return {
      brand: { family: c.brand, custom: c.custom || null },
      accent: { family: c.accent || null },
      neutral: 'auto',
      background: { mode, family: fam || null },
    };
  }
  function accentRelation(c) {
    if (!c.accent) return 'none';
    const d = hueDist(famInfo[c.brand].h, famInfo[c.accent].h);
    return d < 75 ? 'analogous' : 'contrast';
  }
  function features(c) {
    const b = famInfo[c.brand], v = [];
    const bc = Math.min(1, b.C / 0.2), bh = b.h * Math.PI / 180;
    v.push(1.6 * Math.cos(bh) * (0.35 + 0.65 * bc), 1.6 * Math.sin(bh) * (0.35 + 0.65 * bc), 1.2 * (b.L - 0.65));
    if (c.accent) {
      const a = famInfo[c.accent], ah = a.h * Math.PI / 180;
      v.push(0.9 * Math.cos(ah), 0.9 * Math.sin(ah), 0.7 * hueDist(b.h, a.h) / 180, 0);
    } else v.push(0, 0, 0, 0.9);
    const [mode, fam] = c.bg.split(':');
    const bgFam = mode === 'tinted' ? c.brand : fam;
    const g = famInfo[bgFam] || famInfo.gray;
    const gc = Math.min(1, g.bgC / 0.04), gh = g.bgH * Math.PI / 180;
    v.push(1.1 * gc * Math.cos(gh), 1.1 * gc * Math.sin(gh), mode === 'deep' ? 0.6 : mode === 'tinted' ? 0.3 : 0);
    return v;
  }
  const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

  function buildPool(brief) {
    brief = brief || {};
    const pri = brief.priors || {};
    const avoid = new Set(brief.avoid || []);
    const fixed = brief.fixedBrand && fromHex(brief.fixedBrand);
    const brands = fixed ? [{ fam: nearestFamily(fixed, FAMILIES.filter(f => !avoid.has(f))), custom: hex(fixed) }] : FAMILIES.filter(f => !avoid.has(f)).map(f => ({ fam: f, custom: null }));
    const W = (obj, k, d) => (obj && obj[k] != null ? obj[k] : d);
    const pool = [];
    for (const b of brands) {
      const bh = famInfo[b.fam].h;
      const accents = [null, ...FAMILIES.filter(f => f !== b.fam && !avoid.has(f) && hueDist(bh, famInfo[f].h) >= 35)];
      const bgs = [...new Set([`neutral:${PAIR[b.fam] || 'gray'}`, 'neutral:gray', 'neutral:slate', 'neutral:sand', 'neutral:mauve'])];
      bgs.push('tinted');
      for (const d of DEEP) if (d !== b.fam && !avoid.has(d)) bgs.push('deep:' + d);
      for (const a of accents) for (const bg of bgs) {
        const c = { brand: b.fam, custom: b.custom, accent: a, bg };
        const mode = bg.split(':')[0];
        const prior = W(pri.brand, b.fam, fixed ? 1 : 0.25) * W(pri.bg, mode, 0.6) * W(pri.accent, accentRelation(c), 0.6) * (a && pri.accentFamily ? W(pri.accentFamily, a, 0.5) : 1) * (mode === 'deep' && pri.deepFamily ? W(pri.deepFamily, bg.split(':')[1], 0.5) : 1);
        if (prior <= 0) continue;
        pool.push({ key: keyOf(c), c, f: features(c), prior });
      }
    }
    const maxP = Math.max(...pool.map(p => p.prior));
    pool.forEach(p => { p.prior /= maxP; });
    return pool;
  }

  /* Pick the next round. Round 1 is a prior-weighted spread over the pool; later rounds mix
     candidates near the user's likes (exploit) with fresh ones far from everything shown (explore),
     always steering away from dislikes. */
  function pickRound(pool, taste, shown, n, rng) {
    n = n || 8; rng = rng || Math.random;
    const byKey = new Map(pool.map(p => [p.key, p]));
    const liked = (taste.liked || []).map(k => byKey.get(k) || (parseKey(k).brand && famInfo[parseKey(k).brand] ? { f: features(parseKey(k)) } : null)).filter(Boolean);
    const disliked = (taste.disliked || []).map(k => byKey.get(k)).filter(Boolean);
    const seen = new Set(shown || []);
    const avail = pool.filter(p => !seen.has(p.key));
    const sig = 0.75, k = (a, b) => Math.exp(-(dist(a, b) ** 2) / (2 * sig * sig));
    const penalty = p => disliked.reduce((s, d) => s + k(p.f, d.f), 0);
    const pickSpread = (cands, count, chosen, weight) => {
      const out = [];
      const ref = chosen.map(c => c.f).concat((shown || []).map(key => byKey.get(key)).filter(Boolean).map(p => p.f));
      for (let i = 0; i < count && cands.length; i++) {
        let best = null, bs = -Infinity;
        for (const p of cands) {
          if (out.includes(p)) continue;
          const all = ref.concat(out.map(o => o.f));
          const md = all.length ? Math.min(...all.map(f => dist(f, p.f))) : 3;
          const sc = Math.min(md, 3) * weight(p) * (0.97 + 0.06 * rng());
          if (sc > bs) { bs = sc; best = p; }
        }
        if (best) out.push(best);
      }
      return out;
    };
    if (!liked.length) {
      // Slots cycle through background modes so a round never collapses onto one kind of page.
      const modes = ['neutral', 'deep', 'tinted', 'neutral', 'deep', 'neutral', 'deep', 'tinted'];
      const out = [];
      for (let i = 0; i < n; i++) {
        const mode = modes[i % modes.length];
        const group = avail.filter(p => p.c.bg.split(':')[0] === mode && !out.includes(p));
        const got = pickSpread(group.length ? group : avail.filter(p => !out.includes(p)), 1, out, p => (0.35 + p.prior) / (1 + 1.5 * penalty(p)));
        if (got[0]) out.push(got[0]);
      }
      return out;
    }
    const score = p => liked.reduce((s, l) => s + k(p.f, l.f), 0) - 0.8 * penalty(p) + 0.25 * p.prior;
    const ranked = avail.map(p => ({ p, s: score(p) })).sort((a, b) => b.s - a.s).slice(0, 400).map(x => x.p);
    const nExploit = Math.max(1, Math.round(n * 0.7));
    const exploit = [];
    for (const p of ranked) {
      if (exploit.length >= nExploit) break;
      if (exploit.every(e => dist(e.f, p.f) > 0.45)) exploit.push(p);
    }
    const explore = pickSpread(avail.filter(p => !exploit.includes(p)), n - exploit.length, exploit.concat(liked), p => (0.35 + p.prior) / (1 + 2 * penalty(p)));
    return exploit.concat(explore);
  }

  /* Map an extracted image palette (OKLab clusters with shares) to a candidate. */
  function candidateFromClusters(clusters) {
    const cl = clusters.map(c => { const rgb = c.rgb; const [L, C, h] = oklch(rgb); return { rgb, L, C, h, share: c.share }; });
    const vivid = cl.filter(c => c.C > 0.06).sort((a, b) => b.C * Math.sqrt(b.share) - a.C * Math.sqrt(a.share));
    if (!vivid.length) return null;
    const brand = nearestFamily(vivid[0].rgb);
    const acc = vivid.slice(1).find(c => hueDist(c.h, vivid[0].h) >= 35);
    const accent = acc ? nearestFamily(acc.rgb, FAMILIES.filter(f => f !== brand)) : null;
    const darks = cl.filter(c => c.L < 0.35).sort((a, b) => b.share - a.share);
    let bg = `neutral:${PAIR[brand] || 'gray'}`;
    if (darks.length) {
      const d = darks[0];
      if (d.C > 0.025) {
        const p = oklab(d.rgb); let best = null, bd = Infinity;
        for (const f of DEEP.concat([brand])) { const q = oklab(fromHex(RX.dark[f][1])); const dd = Math.hypot(p[1] - q[1], p[2] - q[2]); if (dd < bd) { bd = dd; best = f; } }
        bg = best === brand ? 'tinted' : 'deep:' + best;
      }
    }
    const c = { brand, custom: null, accent, bg };
    return { key: keyOf(c), c, f: features(c), prior: 1 };
  }

  root.PaletteCore = {
    RX, FAMILIES, GRAYS, PAIR, BRIGHT, DEEP, STATUS, STATUS_CHOICES, famInfo,
    clamp01, oklab, oklch, fromOklch, hex, fromHex, lum, contrast, deltaE, hueDist, simulate, CVD, nearestFamily,
    defaultState, mergeState, resolveScales, resolveTokens, report, build, stepLabel, cssColor,
    keyOf, parseKey, candidateState, buildPool, pickRound, candidateFromClusters, accentRelation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
