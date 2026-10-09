// Canvas renderer for a diffusion map: ink-blot nodes, brush-stroke branches, ripples on change.
// Draws only while something is moving, so an idle map costs no CPU.
import { layout } from "./layout.js";
import { FONT_BODY, FONT_DISPLAY, TOKENS, currentTheme, hashString, pigmentOf, prefersReducedMotion, rgba } from "./palette.js";

const SPRITE = 128;
const CORE = 40;

function seeded(seed) {
  let s = seed || 1;
  return () => ((s = (s * 16807) % 2147483647), (s - 1) / 2147483646);
}

/** One pre-rendered ink blot per pigment, tone and theme; nodes stamp it rotated. */
function makeBlot(color, tone, theme) {
  const t = TOKENS[theme];
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE;
  const g = c.getContext("2d");
  const m = SPRITE / 2;
  const rand = seeded(hashString(color + tone));
  const wobble = (radius, amp) => {
    const phases = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
    g.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const rr = radius * (1 + amp * (Math.sin(3 * a + phases[0]) * 0.5 + Math.sin(5 * a + phases[1]) * 0.3 + Math.sin(9 * a + phases[2]) * 0.2));
      const x = m + Math.cos(a) * rr;
      const y = m + Math.sin(a) * rr;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
  };

  if (tone === "settled" || tone === "active") {
    // Bleed: pigment soaking outward into the paper.
    const bleed = g.createRadialGradient(m, m, CORE * 0.7, m, m, m);
    bleed.addColorStop(0, rgba(color, theme === "dark" ? 0.32 : 0.24));
    bleed.addColorStop(1, rgba(color, 0));
    g.fillStyle = bleed;
    g.fillRect(0, 0, SPRITE, SPRITE);
  }

  if (tone === "settled") {
    wobble(CORE, 0.045);
    g.fillStyle = color;
    g.fill();
    // Pigment granulation.
    g.save();
    g.clip();
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * CORE;
      g.fillStyle = rand() > 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)";
      g.beginPath();
      g.arc(m + Math.cos(a) * rr, m + Math.sin(a) * rr, 1 + rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  } else if (tone === "active") {
    wobble(CORE, 0.05);
    g.fillStyle = rgba(color, 0.3);
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = color;
    g.stroke();
    // Wet highlight: ink still settling.
    const wet = g.createRadialGradient(m - 10, m - 12, 2, m - 6, m - 8, CORE * 0.8);
    wet.addColorStop(0, rgba(t.paper, 0.55));
    wet.addColorStop(1, rgba(t.paper, 0));
    g.fillStyle = wet;
    g.fill();
  } else if (tone === "open") {
    wobble(CORE * 0.92, 0.03);
    g.fillStyle = t.paper;
    g.fill();
    g.lineWidth = 6;
    g.setLineDash([9, 7]);
    g.strokeStyle = color;
    g.stroke();
  } else {
    wobble(CORE * 0.85, 0.04);
    g.fillStyle = rgba(t.muted, 0.75);
    g.fill();
  }
  return c;
}

/** Feathered, irregular wash used when ink first lands: it spreads and fades into the paper. */
function makeBloom(color) {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE;
  const g = c.getContext("2d");
  const m = SPRITE / 2;
  const rand = seeded(hashString(color + "bloom"));
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * m * 0.42;
    const r = m * (0.28 + rand() * 0.3);
    const x = m + Math.cos(a) * d;
    const y = m + Math.sin(a) * d;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(color, 0.07));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
  }
  return c;
}

function makeGrain(theme) {
  const c = document.createElement("canvas");
  c.width = c.height = 220;
  const g = c.getContext("2d");
  const img = g.createImageData(220, 220);
  const rand = seeded(42);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = theme === "dark" ? 9 : 13;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = { interactive: true, labels: true, ...opts };
    this.ctx = canvas.getContext("2d");
    this.onSelect = () => {};
    this.onHover = () => {};
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.theme = currentTheme();
    this.sprites = new Map();
    this.grain = null;
    this.nodes = new Map();
    this.edges = [];
    this.lens = null;
    this.layoutResult = null;
    this.ripples = [];
    this.cam = { x: 0, y: 0, k: 1 };
    this.camTarget = null;
    this.raf = 0;
    this.last = 0;
    this.selected = null;
    this.hovered = null;
    this.highlight = null;
    this.labelBoxes = [];
    this.reserved = [];
    this.insets = null;
    this.labelsAnimating = false;
    this.fitted = false;
    this.userMoved = false;
    this.reduced = prefersReducedMotion();
    this.pointers = new Map();
    this.drag = null;
    this.focusOffsetX = 0;
    this.lastDrawMs = 0;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.resize();
    if (this.opts.interactive) this.bindInput();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
  }

  // ---------- data ----------

  /** Rings become ellipses that follow the screen's shape, so a round map fills it either way. */
  stretchFor() {
    if (!this.opts.labels || !this.w || !this.h) return { sx: 1, sy: 1 };
    if (this.h > this.w * 1.3) return { sx: 1, sy: Math.min(1.7, (this.h / this.w) * 0.78) };
    if (this.w > this.h * 1.25) return { sx: Math.min(1.4, (this.w / this.h) * 0.8), sy: 1 };
    return { sx: 1, sy: 1 };
  }

  setGraph({ nodes, edges, lens }, { ripple = true } = {}) {
    this.lastInput = { nodes, edges, lens };
    this.stretch = this.stretchFor();
    this.lens = lens;
    const toneOf = (status) => lens.statuses.find((s) => s.id === status)?.tone ?? "active";
    const prev = new Map([...this.nodes].filter(([, n]) => !n.dying).map(([id, n]) => [id, { x: n.tx, y: n.ty, parentId: n.parentId }]));
    const { sx, sy } = this.stretch;
    for (const p of prev.values()) {
      p.x /= sx;
      p.y /= sy;
    }
    const result = layout(nodes, prev);
    for (const p of result.nodes.values()) {
      p.x *= sx;
      p.y *= sy;
    }
    this.layoutResult = result;
    const now = performance.now();
    const seen = new Set();

    for (const n of nodes) {
      const p = result.nodes.get(n.id);
      seen.add(n.id);
      const tone = toneOf(n.status);
      const existing = this.nodes.get(n.id);
      if (existing) {
        const changed = existing.tone !== tone || existing.title !== n.title || existing.parentId !== n.parentId;
        Object.assign(existing, { title: n.title, parentId: n.parentId, depth: p.depth, pillarIndex: p.pillarIndex, tone, tx: p.x, ty: p.y, r: p.radius, angle: p.angle, dying: false, sessions: n.sessions.length });
        if (changed && ripple) this.addRipple(existing, now);
      } else {
        const parent = n.parentId ? this.nodes.get(n.parentId) : undefined;
        const born = {
          id: n.id,
          title: n.title,
          parentId: n.parentId,
          depth: p.depth,
          pillarIndex: p.pillarIndex,
          tone,
          x: parent && ripple ? parent.x : p.x,
          y: parent && ripple ? parent.y : p.y,
          tx: p.x,
          ty: p.y,
          r: p.radius,
          scale: ripple && !this.reduced ? 0 : 1,
          alpha: 1,
          dying: false,
          labelAlpha: 0,
          angle: p.angle,
          rot: (hashString(n.id) % 628) / 100,
          sessions: n.sessions.length,
        };
        this.nodes.set(n.id, born);
        if (ripple) this.addRipple(born, now + 200);
      }
    }
    for (const n of this.nodes.values()) if (!seen.has(n.id)) n.dying = true;
    this.edges = edges;
    if (this.reduced) this.snap();
    // First data fits the view; later updates keep the camera still unless something grew out of sight.
    if (!this.fitted) this.fit(false);
    else if (!this.userMoved && !this.allInView()) this.expandToFit();
    this.fitted = true;
    this.kick();
  }

  setTheme(theme) {
    this.theme = theme;
    this.sprites.clear();
    this.blooms = null;
    this.grain = null;
    this.kick();
  }

  setSelected(id) {
    this.selected = id;
    this.kick();
  }

  /** Space taken by page chrome on each side, so fitting centres the map in what is left. */
  setInsets(insets) {
    const key = JSON.stringify(insets);
    if (key === this.insetsKey) return;
    const first = !this.insetsKey;
    this.insetsKey = key;
    this.insets = insets;
    if (!this.fitted || this.userMoved) return;
    if (first) this.fit(false);
    else if (!this.allInView()) this.expandToFit();
  }

  /** Screen rectangles covered by page chrome; labels are never placed underneath them. */
  setReserved(rects) {
    const key = JSON.stringify(rects);
    if (key === this.reservedKey) return;
    this.reservedKey = key;
    this.reserved = rects;
    this.kick();
  }

  setHighlight(ids) {
    this.highlight = ids;
    this.kick();
  }

  addRipple(n, t0) {
    if (this.reduced || !this.opts.labels) return;
    this.ripples.push({ id: n.id, t0, color: this.colorOf(n), r0: n.r, rot: Math.random() * Math.PI * 2 });
  }

  snap() {
    for (const [id, n] of this.nodes) {
      if (n.dying) this.nodes.delete(id);
      n.x = n.tx;
      n.y = n.ty;
      n.scale = 1;
    }
  }

  // ---------- camera ----------

  bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes.values()) {
      if (n.dying) continue;
      const pad = n.r + (this.opts.labels ? (this.w < 600 ? 18 : n.depth === 0 ? 90 : 60) : 6);
      minX = Math.min(minX, n.tx - pad);
      maxX = Math.max(maxX, n.tx + pad);
      minY = Math.min(minY, n.ty - n.r - 24);
      maxY = Math.max(maxY, n.ty + n.r + 24);
    }
    if (!isFinite(minX)) return { minX: -200, minY: -200, maxX: 200, maxY: 200 };
    return { minX, minY, maxX, maxY };
  }

  fit(animate = true) {
    const b = this.bounds();
    // Small maps keep a ring of headroom so the next few nodes land in view without a zoom.
    const live = [...this.nodes.values()].filter((n) => !n.dying).length;
    const room = this.opts.labels && live < 30 ? 150 : 0;
    b.minX -= room;
    b.maxX += room;
    b.minY -= room;
    b.maxY += room;
    const ins = this.opts.labels ? (this.insets ?? { top: 150, bottom: 110, left: 64, right: 64 }) : { top: 10, bottom: 10, left: 10, right: 10 };
    const right = ins.right + this.focusOffsetX * 2;
    // Phones are tall: let a round map overflow the sides a little rather than float in empty space.
    const availW = Math.max(100, this.w - ins.left - right) * (this.opts.labels && this.w < 600 ? 1.25 : 1);
    const availH = Math.max(100, this.h - ins.top - ins.bottom);
    const k = Math.min(availW / (b.maxX - b.minX), availH / (b.maxY - b.minY), this.opts.labels ? 1.6 : 3);
    if (this.focusOffsetX === 0) this.fitK = k;
    this.userMoved = false;
    this.moveCamera({ x: (b.minX + b.maxX) / 2 - (ins.left - right) / 2 / k, y: (b.minY + b.maxY) / 2 - (ins.top - ins.bottom) / 2 / k, k }, animate);
  }

  /** Zoom out around the current centre so new growth comes into view without the map sliding. */
  expandToFit() {
    const b = this.bounds();
    const ins = this.insets ?? { top: 150, bottom: 110, left: 64, right: 64 };
    const right = ins.right + this.focusOffsetX * 2;
    const { x: cx, y: cy } = this.camTarget ?? this.cam;
    const halfW = Math.min(this.w / 2 - ins.left + (ins.left - right) / 2, this.w / 2 - right - (ins.left - right) / 2);
    const halfUp = this.h / 2 - ins.top;
    const halfDown = this.h / 2 - ins.bottom;
    const k = Math.min(halfW / Math.max(cx - b.minX, b.maxX - cx, 1), halfUp / Math.max(cy - b.minY, 1), halfDown / Math.max(b.maxY - cy, 1), this.cam.k);
    const fitK = Math.min((this.w - ins.left - right) / (b.maxX - b.minX), (this.h - ins.top - ins.bottom) / (b.maxY - b.minY));
    if (k < fitK * 0.7) return this.fit(true); // keeping the centre would waste too much space
    this.moveCamera({ x: cx, y: cy, k }, true);
  }

  allInView() {
    const b = this.bounds();
    const [x0, y0] = this.toScreen(b.minX, b.minY);
    const [x1, y1] = this.toScreen(b.maxX, b.maxY);
    return x0 >= -8 && y0 >= -8 && x1 <= this.w - this.focusOffsetX * 2 + 8 && y1 <= this.h + 8;
  }

  /** Never let panning or zooming lose the map: its centre stays within reach of the viewport. */
  clampCamera() {
    const b = this.bounds();
    const hw = this.w / 2 / this.cam.k;
    const hh = this.h / 2 / this.cam.k;
    this.cam.x = Math.min(Math.max(this.cam.x, b.minX - hw * 0.5), b.maxX + hw * 0.5);
    this.cam.y = Math.min(Math.max(this.cam.y, b.minY - hh * 0.5), b.maxY + hh * 0.5);
  }

  /** Bring a node to the centre of the part of the screen not covered by panels and chrome. */
  focus(id) {
    const n = this.nodes.get(id);
    if (!n) return;
    // Frame the node with its branch, children and cross-linked neighbours inside the free area.
    const area = this.focusArea ?? { x0: 0, y0: 0, x1: this.w, y1: this.h };
    const ids = this.lineage(id);
    for (const e of this.edges) {
      if (e.from === id) ids.add(e.to);
      if (e.to === id) ids.add(e.from);
    }
    let minX = n.tx, maxX = n.tx, minY = n.ty, maxY = n.ty;
    for (const m of ids) {
      const o = this.nodes.get(m);
      if (!o || o.dying) continue;
      minX = Math.min(minX, o.tx - 110);
      maxX = Math.max(maxX, o.tx + 110);
      minY = Math.min(minY, o.ty - 60);
      maxY = Math.max(maxY, o.ty + 60);
    }
    const aw = Math.max(80, area.x1 - area.x0 - 140);
    const ah = Math.max(80, area.y1 - area.y0 - 80);
    // Never zoom far past the overview: the selection should read in context, not as a close-up.
    const cap = Math.min(1.4, (this.fitK ?? 1) * 1.4);
    const k = Math.max(0.3, Math.min(cap, aw / (maxX - minX), ah / (maxY - minY)));
    const fx = (area.x0 + area.x1) / 2;
    const fy = (area.y0 + area.y1) / 2;
    let x = (minX + maxX) / 2 - (fx - this.w / 2) / k;
    let y = (minY + maxY) / 2 - (fy - this.h / 2) / k;
    // Keep the selected node itself well inside the free area (at least 20% from its edges).
    const sx = (n.tx - x) * k + this.w / 2;
    const sy = (n.ty - y) * k + this.h / 2;
    const mx = (area.x1 - area.x0) * 0.18;
    const my = (area.y1 - area.y0) * 0.18;
    x -= (Math.max(0, area.x0 + mx - sx) - Math.max(0, sx - (area.x1 - mx))) / k;
    y -= (Math.max(0, area.y0 + my - sy) - Math.max(0, sy - (area.y1 - my))) / k;
    this.moveCamera({ x, y, k }, true);
    this.userMoved = true;
  }

  zoomBy(factor, sx = this.w / 2, sy = this.h / 2) {
    const k = Math.min(4, Math.max(0.15, this.cam.k * factor));
    const [wx, wy] = this.toWorld(sx, sy);
    this.camTarget = null;
    this.cam = { k, x: wx - (sx - this.w / 2) / k, y: wy - (sy - this.h / 2) / k };
    this.clampCamera();
    this.userMoved = true;
    this.kick();
  }

  moveCamera(target, animate) {
    if (!animate || this.reduced) {
      this.cam = target;
      this.camTarget = null;
    } else this.camTarget = target;
    this.kick();
  }

  toScreen(x, y) {
    return [(x - this.cam.x) * this.cam.k + this.w / 2, (y - this.cam.y) * this.cam.k + this.h / 2];
  }

  toWorld(sx, sy) {
    return [(sx - this.w / 2) / this.cam.k + this.cam.x, (sy - this.h / 2) / this.cam.k + this.cam.y];
  }

  // ---------- input ----------

  bindInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag = { x: e.offsetX, y: e.offsetY, moved: true, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
      } else this.drag = { x: e.offsetX, y: e.offsetY, moved: false };
    });
    c.addEventListener("pointermove", (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p && this.drag) {
        if (this.drag.pinch && this.pointers.size === 2) {
          this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
          const [a, b] = [...this.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          this.zoomBy(d / this.drag.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
          this.drag.pinch = d;
          return;
        }
        const dx = e.offsetX - p.x;
        const dy = e.offsetY - p.y;
        this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        if (Math.hypot(e.offsetX - this.drag.x, e.offsetY - this.drag.y) > 4) this.drag.moved = true;
        if (this.drag.moved) {
          this.camTarget = null;
          this.cam.x -= dx / this.cam.k;
          this.cam.y -= dy / this.cam.k;
          this.clampCamera();
          this.userMoved = true;
          c.style.cursor = "grabbing";
          this.kick();
        }
        return;
      }
      const hit = this.hitTest(e.offsetX, e.offsetY);
      if (hit !== this.hovered) {
        this.hovered = hit;
        c.style.cursor = hit ? "pointer" : "grab";
        this.kick();
      }
      this.onHover(hit, e.offsetX, e.offsetY);
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.drag && !this.drag.moved && this.pointers.size === 0) this.onSelect(this.hitTest(e.offsetX, e.offsetY));
      if (this.pointers.size === 0) this.drag = null;
      c.style.cursor = this.hovered ? "pointer" : "grab";
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => {
      if (this.hovered) {
        this.hovered = null;
        this.kick();
      }
      this.onHover(null, 0, 0);
    });
    c.addEventListener("dblclick", (e) => {
      if (!this.hitTest(e.offsetX, e.offsetY)) this.fit();
    });
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // Pinch gestures arrive as ctrl+wheel; a notched mouse wheel zooms; trackpad scrolling pans.
        const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
        if (e.ctrlKey || mouseWheel) this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), e.offsetX, e.offsetY);
        else {
          this.camTarget = null;
          this.cam.x += e.deltaX / this.cam.k;
          this.cam.y += e.deltaY / this.cam.k;
          this.clampCamera();
          this.userMoved = true;
          this.kick();
        }
      },
      { passive: false },
    );
  }

  hitTest(sx, sy) {
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      if (n.dying) continue;
      const [x, y] = this.toScreen(n.x, n.y);
      const d = Math.hypot(sx - x, sy - y);
      if (d < Math.max(n.r * this.cam.k, 7) + 5 && d < bestD) {
        best = n.id;
        bestD = d;
      }
    }
    if (best) return best;
    for (const b of this.labelBoxes) if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return b.id;
    return null;
  }

  screenPosition(id) {
    const n = this.nodes.get(id);
    return n ? this.toScreen(n.x, n.y) : null;
  }

  debugLabels() {
    const pillars = [...this.nodes.values()].filter((n) => n.depth === 0 && !n.dying);
    const shown = new Set(this.labelBoxes.map((b) => b.id));
    const boxes = this.labelBoxes;
    const pairs = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) pairs.push([a.id, b.id]);
      }
    return { shown: boxes.length, total: this.nodes.size, pillarsHidden: pillars.filter((p) => !shown.has(p.id)).map((p) => p.title), overlaps: pairs.length, pairs };
  }

  // ---------- frame loop ----------

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    // Rotating a phone changes the stretch: re-place the nodes for the new shape.
    const next = this.stretchFor();
    if (this.lastInput && (next.sx !== this.stretch?.sx || next.sy !== this.stretch?.sy)) this.setGraph(this.lastInput, { ripple: false });
    if (this.fitted && !this.userMoved) this.fit(false);
    this.kick();
  }

  kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  frame(now) {
    this.raf = 0;
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const moving = this.step(dt, now);
    const t0 = performance.now();
    this.draw(now);
    this.lastDrawMs = performance.now() - t0;
    if (moving || this.labelsAnimating) this.kick();
  }

  step(dt, now) {
    let moving = false;
    const ease = 1 - Math.exp(-dt / 140);
    for (const [id, n] of this.nodes) {
      const dx = n.tx - n.x;
      const dy = n.ty - n.y;
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        n.x += dx * ease;
        n.y += dy * ease;
        moving = true;
      } else {
        n.x = n.tx;
        n.y = n.ty;
      }
      if (n.scale < 1) {
        n.scale = Math.min(1, n.scale + dt / 650);
        moving = true;
      }
      if (n.dying) {
        n.alpha -= dt / 380;
        moving = true;
        if (n.alpha <= 0) this.nodes.delete(id);
      }
    }
    if (this.camTarget) {
      const t = this.camTarget;
      const e = 1 - Math.exp(-dt / 160);
      this.cam.x += (t.x - this.cam.x) * e;
      this.cam.y += (t.y - this.cam.y) * e;
      this.cam.k += (t.k - this.cam.k) * e;
      if (Math.abs(t.x - this.cam.x) * this.cam.k < 0.3 && Math.abs(t.y - this.cam.y) * this.cam.k < 0.3 && Math.abs(t.k - this.cam.k) < 0.001) {
        this.cam = { ...t };
        this.camTarget = null;
      } else moving = true;
    }
    this.ripples = this.ripples.filter((r) => now - r.t0 < 2200);
    if (this.ripples.length) moving = true;
    return moving;
  }

  // ---------- drawing ----------

  sprite(color, tone) {
    const key = `${this.theme}|${color}|${tone}`;
    let s = this.sprites.get(key);
    if (!s) this.sprites.set(key, (s = makeBlot(color, tone, this.theme)));
    return s;
  }

  colorOf(n) {
    return pigmentOf(n.pillarIndex, this.theme);
  }

  /** The hovered or selected node with its lineage, children and cross-linked neighbours. */
  focusSet() {
    const id = this.hovered ?? this.selected;
    if (!id || !this.nodes.has(id)) return this.highlight;
    const set = new Set([id]);
    let cur = this.nodes.get(id);
    while (cur?.parentId) {
      set.add(cur.parentId);
      cur = this.nodes.get(cur.parentId);
    }
    for (const n of this.nodes.values()) if (n.parentId === id) set.add(n.id);
    for (const e of this.edges) {
      if (e.from === id) set.add(e.to);
      if (e.to === id) set.add(e.from);
    }
    return set;
  }

  draw(now) {
    const g = this.ctx;
    const t = TOKENS[this.theme];
    const k = this.cam.k;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = t.paper;
    g.fillRect(0, 0, this.w, this.h);
    if (this.opts.labels) {
      if (!this.grain) this.grain = g.createPattern(makeGrain(this.theme), "repeat");
      g.fillStyle = this.grain;
      g.fillRect(0, 0, this.w, this.h);
    }

    const focus = this.focusSet();
    const dim = (id) => (focus && !focus.has(id) ? (this.theme === "dark" ? 0.32 : 0.2) : 1);

    g.save();
    g.translate(this.w / 2, this.h / 2);
    g.scale(k, k);
    g.translate(-this.cam.x, -this.cam.y);

    // Water rings marking each diffusion depth.
    if (this.layoutResult && this.opts.labels) {
      g.lineWidth = 1 / k;
      this.layoutResult.rings.forEach((r, i) => {
        if (r <= 0) return;
        g.strokeStyle = rgba(t.ink, Math.max(0.025, 0.07 - i * 0.012));
        g.setLineDash(i === 0 ? [] : [2 / k, 6 / k]);
        g.beginPath();
        g.ellipse(0, 0, r * (this.stretch?.sx ?? 1), r * (this.stretch?.sy ?? 1), 0, 0, Math.PI * 2);
        g.stroke();
      });
      g.setLineDash([]);
    }

    const hasOrigin = (this.layoutResult?.pillarRing ?? 0) > 0;
    // Origin: the drop where the topic first touched the water.
    if (hasOrigin) {
      for (const n of this.nodes.values()) {
        if (n.depth !== 0) continue;
        this.brush(g, 0, 0, n.x, n.y, 0, n.angle, 1.6, 0.7, rgba(t.ink, 0.22 * n.alpha * dim(n.id)), true);
      }
      g.fillStyle = t.ink;
      g.beginPath();
      g.arc(0, 0, 4.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = rgba(t.ink, 0.18);
      g.lineWidth = 1 / k;
      g.beginPath();
      g.arc(0, 0, 11, 0, Math.PI * 2);
      g.stroke();
    }

    // Branches.
    for (const n of this.nodes.values()) {
      if (!n.parentId) continue;
      const p = this.nodes.get(n.parentId);
      if (!p) continue;
      const a = (n.tone === "open" ? 0.3 : n.tone === "muted" ? 0.16 : 0.48) * n.alpha * Math.min(n.scale * 1.5, 1) * Math.min(dim(n.id), dim(p.id));
      const color = n.tone === "muted" ? t.muted : this.colorOf(n);
      // Start at the parent's rim so converging branches don't pile into a wedge.
      const dx = n.x - p.x;
      const dy = n.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const rim = Math.min(p.r * 0.85, len * 0.4);
      this.brush(g, p.x + (dx / len) * rim, p.y + (dy / len) * rim, n.x, n.y, p.depth === 0 && !hasOrigin ? n.angle : p.angle, n.angle, Math.max(0.8, p.r * 0.13), 0.5, rgba(color, a), false);
    }

    // Cross-links: chords bowed toward the origin.
    const sel = this.hovered ?? this.selected;
    for (const e of this.edges) {
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) continue;
      const active = sel && (e.from === sel || e.to === sel);
      const cx = (a.x + b.x) * 0.3;
      const cy = (a.y + b.y) * 0.3;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo(cx, cy, b.x, b.y);
      g.lineWidth = (active ? 1.6 : 1) / Math.sqrt(k);
      g.setLineDash(active ? [] : [3 / k, 5 / k]);
      g.strokeStyle = active ? rgba(t.accent, 0.85) : rgba(t.ink, (focus ? 0.07 : 0.22) * Math.min(a.alpha, b.alpha));
      g.stroke();
    }
    g.setLineDash([]);

    // Ink blooms: a fresh drop spreads into the paper, then the node settles on top of it.
    for (const r of this.ripples) {
      const p = (now - r.t0) / 2200;
      const n = this.nodes.get(r.id);
      if (p < 0 || !n) continue;
      const e = 1 - Math.pow(1 - p, 2.4);
      const size = (r.r0 * 2 + e * 150) * 1.0;
      g.globalAlpha = (1 - p) * (1 - p) * 0.95;
      g.save();
      g.translate(n.x, n.y);
      g.rotate(r.rot + e * 0.4);
      if (!this.blooms) this.blooms = new Map();
      let sprite = this.blooms.get(r.color);
      if (!sprite) this.blooms.set(r.color, (sprite = makeBloom(r.color)));
      g.drawImage(sprite, -size / 2, -size / 2, size, size);
      g.restore();
    }
    g.globalAlpha = 1;

    if (this.nodes.size === 0) {
      // Nothing has landed yet: a faint ring where the first ink will spread.
      g.strokeStyle = rgba(t.ink, 0.16);
      g.setLineDash([3 / k, 5 / k]);
      g.lineWidth = 1 / k;
      g.beginPath();
      g.arc(0, 0, 46 / k, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }

    // Nodes, outer rings first so pillars sit on top. Thumbnails use one on-screen size scale
    // so every card reads alike, whatever the map's extent.
    const ordered = [...this.nodes.values()].sort((a, b) => b.depth - a.depth);
    for (const n of ordered) {
      const s = n.scale < 1 ? easeOutBack(n.scale) : 1;
      const thumbR = (n.depth === 0 ? 6.5 : n.depth === 1 ? 3.6 : 2.6) / k;
      const size = ((this.opts.labels ? n.r : thumbR) / CORE) * SPRITE * s;
      if (size <= 0.5) continue;
      g.globalAlpha = Math.max(0, n.alpha) * dim(n.id);
      g.save();
      g.translate(n.x, n.y);
      g.rotate(n.rot);
      g.drawImage(this.sprite(this.colorOf(n), n.tone), -size / 2, -size / 2, size, size);
      g.restore();
      if (n.id === this.selected) {
        // A double seal ring marks the selection.
        g.globalAlpha = 1;
        g.strokeStyle = t.accent;
        g.lineWidth = 1.6 / k;
        g.beginPath();
        g.arc(n.x, n.y, n.r + 5 / k + 2, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 0.8 / k;
        g.beginPath();
        g.arc(n.x, n.y, n.r + 9 / k + 3, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.restore();

    if (this.opts.labels) this.drawLabels(g, focus);
  }

  /** A tapered brush stroke from (x0,y0) to (x1,y1), bending along the radial direction. */
  brush(g, x0, y0, x1, y1, a0, a1, w0, w1, color, straight) {
    const mid = (Math.hypot(x0, y0) + Math.hypot(x1, y1)) / 2;
    // Leave the parent heading for the child (branches fan out), arrive along the child's spoke.
    const c1x = x0 + (x1 - x0) * (straight ? 1 / 3 : 0.4);
    const c1y = y0 + (y1 - y0) * (straight ? 1 / 3 : 0.4);
    const c2x = straight ? x0 + ((x1 - x0) * 2) / 3 : Math.cos(a1) * mid;
    const c2y = straight ? y0 + ((y1 - y0) * 2) / 3 : Math.sin(a1) * mid;
    const N = 14;
    const left = [];
    const right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1;
      const y = u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1;
      const dx = 3 * u * u * (c1x - x0) + 6 * u * t * (c2x - c1x) + 3 * t * t * (x1 - c2x);
      const dy = 3 * u * u * (c1y - y0) + 6 * u * t * (c2y - c1y) + 3 * t * t * (y1 - c2y);
      const len = Math.hypot(dx, dy) || 1;
      const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2;
      left.push([x - (dy / len) * w, y + (dx / len) * w]);
      right.push([x + (dy / len) * w, y - (dx / len) * w]);
    }
    g.beginPath();
    g.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) g.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  /** Relation names on the highlighted node's cross-links, on paper pills above everything. */
  drawEdgeLabels(g, active, avoid) {
    if (!active || !this.lens) return;
    const t = TOKENS[this.theme];
    g.font = `500 11.5px ${FONT_BODY}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const e of this.edges) {
      if (e.from !== active && e.to !== active) continue;
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) continue;
      const label = e.label || this.lens.relations.find((r) => r.id === e.relation)?.label || e.relation;
      const cx = (a.x + b.x) * 0.3;
      const cy = (a.y + b.y) * 0.3;
      const w = g.measureText(label).width + 14;
      // Slide the pill along the curve until it clears every label and stays on the visible canvas.
      const visibleW = this.w - this.focusOffsetX * 2;
      let mx = 0, my = 0;
      let found = false;
      for (const tt of [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8]) {
        const u = 1 - tt;
        [mx, my] = this.toScreen(u * u * a.x + 2 * u * tt * cx + tt * tt * b.x, u * u * a.y + 2 * u * tt * cy + tt * tt * b.y);
        const box = { x: mx - w / 2, y: my - 10, w, h: 20 };
        const clear = !avoid.some((p) => box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y);
        if (clear && box.x > 4 && box.x + w < visibleW - 4) {
          found = true;
          break;
        }
      }
      // A relation name that can only sit on top of another name is better left to the panel.
      const onCanvas = mx - w / 2 >= 0 && mx + w / 2 <= visibleW && my >= 0 && my <= this.h;
      if (!found && onCanvas) continue;
      let text = label;
      if (mx + w / 2 > visibleW || mx - w / 2 < 0 || my < 0 || my > this.h) {
        // The far end is out of sight: pin a pill at the border that names where the link goes.
        const other = e.from === active ? b : a;
        const arrow = e.from === active ? "→" : "←";
        text = `${label} ${arrow} ${other.title}`;
        const tw = g.measureText(text).width + 14;
        let last = null;
        for (let i = 0; i <= 40; i++) {
          const tt = e.from === active ? i / 40 : 1 - i / 40;
          const u = 1 - tt;
          const [px, py] = this.toScreen(u * u * a.x + 2 * u * tt * cx + tt * tt * b.x, u * u * a.y + 2 * u * tt * cy + tt * tt * b.y);
          if (px - tw / 2 < 8 || px + tw / 2 > visibleW - 8 || py < 90 || py > this.h - 90) break;
          const pb = { x: px - tw / 2, y: py - 10, w: tw, h: 20 };
          if (!avoid.some((p) => pb.x < p.x + p.w && pb.x + pb.w > p.x && pb.y < p.y + p.h && pb.y + pb.h > p.y)) last = [px, py];
        }
        if (!last) continue;
        [mx, my] = last;
        g.fillStyle = rgba(t.paper, 0.96);
        g.strokeStyle = rgba(t.accent, 0.5);
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(mx - tw / 2, my - 10, tw, 20, 10);
        g.fill();
        g.stroke();
        g.fillStyle = t.accent;
        g.fillText(text, mx, my + 0.5);
        continue;
      }
      g.fillStyle = rgba(t.paper, 0.96);
      g.strokeStyle = rgba(t.accent, 0.5);
      g.lineWidth = 1;
      g.beginPath();
      g.roundRect(mx - w / 2, my - 10, w, 20, 10);
      g.fill();
      g.stroke();
      g.fillStyle = t.accent;
      g.fillText(label, mx, my + 0.5);
    }
  }

  lineage(id) {
    const set = new Set([id]);
    for (let cur = this.nodes.get(id); cur?.parentId; cur = this.nodes.get(cur.parentId)) set.add(cur.parentId);
    for (const n of this.nodes.values()) if (n.parentId === id) set.add(n.id);
    return set;
  }

  /** Labels at constant screen size, placed greedily by priority so none ever overlap. */
  drawLabels(g, focus) {
    const t = TOKENS[this.theme];
    const k = this.cam.k;
    const placed = [...this.reserved];
    const sel = this.selected;
    const hov = this.hovered;
    // Every visible node is an obstacle, so no label ever sits on a dot (the selection ring counts too).
    for (const n of this.nodes.values()) {
      if (n.dying) continue;
      const [x, y] = this.toScreen(n.x, n.y);
      const r = Math.max(3, n.r * k) + (n.id === sel ? 13 : 2);
      placed.push({ x: x - r, y: y - r, w: r * 2, h: r * 2, node: n.id });
    }

    const selFocus = sel ? this.lineage(sel) : null;
    const priority = (n) =>
      (n.depth === 0 && (!selFocus || selFocus.has(n.id)) ? 1e6 : 0) + (n.depth === 0 ? 2e4 : 0) + (n.id === sel ? 3e5 : 0) + (selFocus?.has(n.id) ? 1e5 : 0) + (4 - Math.min(n.depth, 4)) * 1000 + (this.childCount.get(n.id) ?? 0) * 60 + n.sessions * 50 + (n.tone === "muted" ? -500 : 0);
    this.childCount = new Map();
    const pull = new Map();
    for (const n of this.nodes.values()) {
      if (!n.parentId || n.dying) continue;
      this.childCount.set(n.parentId, (this.childCount.get(n.parentId) ?? 0) + 1);
      const p = this.nodes.get(n.parentId);
      if (!p || p.depth !== 0) continue;
      const v = pull.get(p.id) ?? [0, 0];
      const d = Math.hypot(n.x - p.x, n.y - p.y) || 1;
      pull.set(p.id, [v[0] + (n.x - p.x) / d, v[1] + (n.y - p.y) / d]);
    }
    // Screen-space segments of spokes and branches, used to keep pillar names off the lines.
    const segs = [];
    const [ox, oy] = this.toScreen(0, 0);
    for (const n of this.nodes.values()) {
      if (n.dying) continue;
      const [x1, y1] = this.toScreen(n.x, n.y);
      if (n.depth === 0) segs.push([ox, oy, x1, y1]);
      const p = n.parentId && this.nodes.get(n.parentId);
      if (p && (p.depth === 0 || n.depth === 1)) {
        const [x0, y0] = this.toScreen(p.x, p.y);
        segs.push([x0, y0, x1, y1]);
      }
    }
    const hits = (x0, y0, x1, y1, b) => {
      // Liang–Barsky clip: does the segment pass through the box?
      let t0 = 0, t1 = 1;
      const dx = x1 - x0, dy = y1 - y0;
      for (const [p, q] of [[-dx, x0 - b.x], [dx, b.x + b.w - x0], [-dy, y0 - b.y], [dy, b.y + b.h - y0]]) {
        if (p === 0) {
          if (q < 0) return false;
        } else {
          const r = q / p;
          if (p < 0) t0 = Math.max(t0, r);
          else t1 = Math.min(t1, r);
          if (t0 > t1) return false;
        }
      }
      return true;
    };
    const crossings = (b) => segs.reduce((c, s) => c + (hits(s[0], s[1], s[2], s[3], b) ? 1 : 0), 0);
    this.awayDir = new Map();
    for (const [id, [vx, vy]] of pull) {
      const len = Math.hypot(vx, vy);
      if (len > 0.3) this.awayDir.set(id, [-vx / len, -vy / len]);
    }
    const list = [...this.nodes.values()].filter((n) => !n.dying).sort((a, b) => priority(b) - priority(a));
    const screen = new Map([...this.nodes.values()].filter((n) => !n.dying).map((n) => [n.id, this.toScreen(n.x, n.y)]));
    // A label must sit closer to its own node than to any other, or it will be misread.
    const misleading = (c, own) => {
      const cx = c.box.x + c.box.w / 2;
      const cy = c.box.y + c.box.h / 2;
      const [ox, oy] = screen.get(own);
      const mine = Math.hypot(cx - ox, cy - oy) - c.box.w / 2;
      for (const [id, [x, y]] of screen) if (id !== own && Math.abs(x - cx) < c.box.w && Math.abs(y - cy) < 40 && Math.hypot(cx - x, cy - y) - c.box.w / 2 < mine - 4) return true;
      return false;
    };
    const overlaps = (b) => placed.some((p) => p.node !== b.id && b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
    const hasOrigin = (this.layoutResult?.pillarRing ?? 0) > 0;
    let animating = false;

    for (const n of list) {
      const [sx, sy] = this.toScreen(n.x, n.y);
      const pillar = n.depth === 0;
      const small = this.w < 600 ? 0.9 : 1;
      const size = (pillar ? 17 : n.depth === 1 ? 13.5 : 12) * small;
      g.font = pillar ? `600 ${size}px ${FONT_DISPLAY}` : `${n.id === sel ? 650 : n.depth === 1 ? 500 : 400} ${n.id === sel ? size + 1 : size}px ${FONT_BODY}`;
      const width = g.measureText(n.title).width;
      const rr = n.r * k * (n.scale < 1 ? easeOutBack(n.scale) : 1) + (n.id === sel ? 14 : 0);
      const boxOf = (align, x, y) => {
        const bx = align === "left" ? x : align === "right" ? x - width : x - width / 2;
        return { align, x, y, bx, box: { x: bx - 4, y: y - size * 0.62 - 3, w: width + 8, h: size * 1.24 + 6, id: n.id } };
      };
      let spot;
      if (pillar) {
        // One rule for pillars: outward along their spoke; only if that is taken, across it.
        // Face away from the pillar's own branches; with no branches yet, read outward.
        const away = this.awayDir.get(n.id);
        const ux = away ? away[0] : hasOrigin ? Math.cos(n.angle) : 0;
        const uy = away ? away[1] : hasOrigin ? Math.sin(n.angle) : 1;
        const toward = (dx, dy, extra = 0) => {
          const gap = rr + 10 + extra;
          const c =
            Math.abs(dx) > 0.55
              ? boxOf(dx > 0 ? "left" : "right", sx + dx * gap, sy + dy * gap)
              : boxOf("center", sx + dx * gap, sy + dy * gap + (dy > 0 ? size * 0.6 : -size * 0.6));
          c.dir = [dx, dy];
          return c;
        };
        const dirs = hasOrigin || away ? [[ux, uy], [-uy, ux], [uy, -ux], [-ux, -uy]] : [[0, 1], [0, -1]];
        const candidates = [...dirs.map(([dx, dy]) => toward(dx, dy)), ...dirs.map(([dx, dy]) => toward(dx, dy, size * 1.6))];
        candidates.forEach((c, i) => {
          c.slot = i;
          if (i >= dirs.length) c.leader = true; // pushed further out: keep a line back to the node
        });
        // Rank free spots by how many lines would run through the name; keep last frame's spot
        // unless it became worse, so labels don't hop while the map grows.
        const free = candidates.filter((c) => !overlaps(c.box));
        // Remember the side, not the slot: the same direction stays preferred as branches appear.
        const same = (c) => n.labelDir && c.dir[0] * n.labelDir[0] + c.dir[1] * n.labelDir[1] > 0.85;
        const score = (c) => crossings(c.box) * 10 + c.slot + (same(c) ? -14 : 0);
        const labelsOnly = (b) => placed.some((p) => p.id && p.id !== n.id && b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
        spot = free.sort((a, b) => score(a) - score(b))[0] ?? candidates.find((c) => !labelsOnly(c.box)) ?? candidates[0];
        n.labelDir = spot.dir;
      } else {
        // Leaves read outward; when crowded, nudge up or down before giving up.
        const right = Math.cos(n.angle) >= 0;
        const ax = sx + (right ? rr + 6 : -rr - 6);
        const al = right ? "left" : "right";
        const lx = sx + (right ? rr + 10 : -rr - 10);
        const bx2 = sx + (right ? -rr - 6 : rr + 6);
        const al2 = right ? "right" : "left";
        const candidates = [
          boxOf(al, ax, sy),
          { ...boxOf(al, lx, sy - size * 1.1), leader: true },
          { ...boxOf(al, lx, sy + size * 1.1), leader: true },
          boxOf(al2, bx2, sy),
          { ...boxOf(al, lx + (right ? 8 : -8), sy - size * 2.2), leader: true },
          { ...boxOf(al, lx + (right ? 8 : -8), sy + size * 2.2), leader: true },
          boxOf("center", sx, sy - rr - size * 0.8),
          boxOf("center", sx, sy + rr + size * 0.8),
        ];
        const inside = (c) => c.box.x >= 2 && c.box.x + c.box.w <= this.w - 2;
        const labelsOnly = (b) => placed.some((p) => p.id && p.id !== n.id && b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
        const clean = candidates.find((c, i) => !overlaps(c.box) && inside(c) && (i === 0 || !misleading(c, n.id)));
        const fallback = n.id === sel || n.id === hov ? candidates.find((c) => inside(c) && !labelsOnly(c.box)) ?? candidates.find(inside) : null;
        spot = clean ?? fallback ?? candidates[0];
        spot.clean = Boolean(clean) || Boolean(fallback);
      }
      const { align, x, y, bx, box } = spot;
      const onScreen = pillar
        ? box.x + box.w > 0 && box.x < this.w && box.y + box.h > 0 && box.y < this.h
        : box.x >= 2 && box.x + box.w <= this.w - 2 && box.y >= 2 && box.y + box.h <= this.h - 2; // never clip a leaf label
      const minZoom = pillar ? 0 : n.depth === 1 ? 0.2 : n.depth === 2 ? 0.32 : 0.45;
      // Pillar names are always shown; everything else only when it fits.
      // Pillars, the pointer's node, the selection and the selection's neighbours are always named.
      // Pillars, the pointer's node and the selection are always named; the selection's
      // neighbours are named whenever a clean spot exists.
      const forced = (pillar && (!focus || focus.has(n.id) || !overlaps(box))) || n.id === hov || n.id === sel || (sel !== null && (focus?.has(n.id) ?? false) && spot.clean);
      // While something is focused, unrelated leaves step back entirely instead of fading under lines.
      const quiet = focus && !focus.has(n.id) && !(pillar && forced);
      const wanted = onScreen && !quiet && (forced || ((k >= minZoom || (focus?.has(n.id) ?? false)) && !overlaps(box)));
      const target = wanted ? 1 : 0;
      if (this.reduced) n.labelAlpha = target;
      else if (Math.abs(n.labelAlpha - target) > 0.01) {
        n.labelAlpha += (target - n.labelAlpha) * 0.25;
        animating = true;
      } else n.labelAlpha = target;
      if (wanted) placed.push(box);
      if (n.labelAlpha <= 0.01) continue;
      g.globalAlpha = Math.max(0, n.labelAlpha * n.alpha * (focus && !focus.has(n.id) ? 0.25 : 1));
      if (spot.leader) {
        // A nudged label keeps a hairline back to its node.
        const dir = align === "left" ? 1 : -1;
        g.strokeStyle = rgba(this.colorOf(n), 0.7);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(sx + dir * (rr + 1.5), sy);
        g.lineTo(x - dir * 2, y);
        g.stroke();
      }
      g.textAlign = align;
      g.textBaseline = "middle";
      g.lineJoin = "round";
      if (pillar) {
        // Pillar names sit on a soft paper plate so spokes never run through the glyphs.
        g.fillStyle = rgba(t.paper, 0.86);
        g.beginPath();
        g.roundRect(box.x - 4, box.y - 1, box.w + 8, box.h + 2, 8);
        g.fill();
      }
      g.lineWidth = pillar ? 6 : 4;
      g.strokeStyle = t.paper;
      g.strokeText(n.title, x, y);
      g.fillStyle = n.id === sel ? (n.tone === "muted" ? t.ink2 : t.ink) : n.tone === "muted" ? t.ink3 : pillar ? t.ink : t.ink2;
      g.fillText(n.title, x, y);
      if (n.tone === "muted") {
        // Set aside, not erased: a dashed rule under the name instead of a line through CJK strokes.
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 1;
        g.setLineDash([2.5, 2.5]);
        g.beginPath();
        g.moveTo(bx, y + size * 0.68);
        g.lineTo(bx + width, y + size * 0.68);
        g.stroke();
        g.setLineDash([]);
      }
    }
    g.globalAlpha = 1;
    this.labelBoxes = placed.filter((b) => b.id);
    this.drawEdgeLabels(g, hov ?? sel, placed);
    this.labelsAnimating = animating;
  }
}
