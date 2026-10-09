// Radial diffusion layout: pillars on an inner ring, each subtree fanning outward within its
// pillar's sector, then relaxed with a short collision pass so it reads organic, not mechanical.

export function nodeRadius(depth, sessions) {
  const base = depth === 0 ? 15 : depth === 1 ? 9 : depth === 2 ? 7 : 5.5;
  return base + Math.min(3, sessions * 0.7);
}

/** Same order everywhere: pillars by creation time, then id. */
export const byCreation = (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function pillarsOf(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.filter((n) => !n.parentId || !ids.has(n.parentId)).sort(byCreation);
}

/**
 * `previous` maps node id → { x, y, parentId } from the last frame. Nodes that keep their parent
 * stay where they were, so a map that grows during a conversation never reshuffles under the
 * reader; only new or re-parented nodes take their ideal radial place.
 */
export function layout(nodes, previous) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map();
  for (const n of nodes) {
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(n);
  }
  for (const list of children.values()) list.sort(byCreation);
  const roots = children.get(null) ?? [];

  const weight = new Map();
  const countAtDepth = [];
  const measure = (n, depth) => {
    countAtDepth[depth] = (countAtDepth[depth] ?? 0) + 1;
    const kids = children.get(n.id) ?? [];
    const w = kids.length ? kids.reduce((s, k) => s + measure(k, depth + 1), 0) : 1;
    weight.set(n.id, w);
    return w;
  };
  roots.forEach((r) => measure(r, 0));

  // Ring radii grow with depth and widen when a ring needs more circumference for its nodes.
  // The pillar ring scales with the whole map so pillars never huddle at the centre.
  const ringsFor = (pillarRing) => {
    const out = [];
    for (let d = 0; d < countAtDepth.length; d++) {
      if (d === 0) out.push(pillarRing);
      else out.push(Math.max(out[d - 1] + (d === 1 ? 150 : 130), (countAtDepth[d] * 30) / (2 * Math.PI)));
    }
    return out;
  };
  let pillarRing = roots.length === 1 ? 0 : Math.max(120, (roots.length * 70) / (2 * Math.PI));
  let rings = ringsFor(pillarRing);
  if (pillarRing > 0 && rings.length > 1) {
    pillarRing = Math.max(pillarRing, rings.at(-1) * 0.28);
    rings = ringsFor(pillarRing);
  }

  const targets = new Map();
  const staggerOf = new Map();
  for (const list of children.values()) if (list.length > 3) list.forEach((k, i) => staggerOf.set(k.id, i % 2));
  const place = (n, depth, from, to, pillarIndex) => {
    const angle = (from + to) / 2;
    const r = rings[depth] ?? 0;
    // Siblings alternate between two rows so horizontal labels of neighbours have room to breathe.
    const stagger = depth > 0 && (staggerOf.get(n.id) ?? 0) ? 44 : 0;
    targets.set(n.id, { id: n.id, x: Math.cos(angle) * (r + stagger), y: Math.sin(angle) * (r + stagger), depth, pillarIndex, radius: nodeRadius(depth, n.sessions.length), angle });
    const kids = children.get(n.id) ?? [];
    const total = kids.reduce((s, k) => s + weight.get(k.id), 0);
    // Children may spread a little beyond a narrow parent sector so small branches still breathe.
    const span = to - from;
    const pad = depth === 0 ? 0 : Math.min(span * 0.15, 0.12);
    let cursor = from - pad;
    for (const k of kids) {
      const share = (weight.get(k.id) / total) * (span + pad * 2);
      place(k, depth + 1, cursor, cursor + share, pillarIndex);
      cursor += share;
    }
  };
  // Sectors blend an equal split with subtree size, so big branches get room without
  // pushing the pillars themselves into one side of the ring.
  const sized = roots.reduce((s, r) => s + Math.pow(weight.get(r.id), 0.8), 0);
  const share = (r) => Math.min(0.35, 0.45 / roots.length + (0.55 * Math.pow(weight.get(r.id), 0.8)) / sized);
  const totalWeight = roots.reduce((s, r) => s + share(r), 0);
  let cursor = -Math.PI / 2 - (roots.length > 1 ? Math.PI / roots.length : 0);
  roots.forEach((r, i) => {
    const span = (share(r) / totalWeight) * Math.PI * 2;
    place(r, 0, cursor, cursor + span, i);
    cursor += span;
  });

  const sim = [...targets.values()].map((t) => {
    const parent = byId.get(t.id)?.parentId ?? null;
    const prev = previous?.get(t.id);
    const kept = prev && prev.parentId === parent;
    const start = prev ?? (parent && previous?.get(parent)) ?? t;
    return { ...t, tx: kept ? prev.x : t.x, ty: kept ? prev.y : t.y, x: start.x, y: start.y, kept };
  });
  relax(sim, sim.length > 200 ? 90 : 140);

  const out = new Map();
  for (const d of sim) out.set(d.id, { ...d, angle: d.depth === 0 && pillarRing === 0 ? d.angle : Math.atan2(d.y, d.x) });
  return { nodes: out, rings, pillarRing };
}

/** Spring each node toward its radial target while pushing overlapping nodes apart. */
function relax(sim, ticks) {
  const pad = (d) => d.radius + (d.depth === 0 ? 22 : 9);
  const cell = Math.max(40, ...sim.map((d) => pad(d) * 2));
  for (let t = 0; t < ticks; t++) {
    const alpha = 1 - t / ticks;
    for (const d of sim) {
      const k = (d.depth === 0 || d.kept ? 0.9 : 0.35) * alpha;
      d.x += (d.tx - d.x) * k;
      d.y += (d.ty - d.y) * k;
    }
    const grid = new Map();
    for (const d of sim) {
      const key = `${Math.floor(d.x / cell)},${Math.floor(d.y / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(d);
    }
    for (const d of sim) {
      const cx = Math.floor(d.x / cell);
      const cy = Math.floor(d.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++)
        for (let gy = cy - 1; gy <= cy + 1; gy++)
          for (const o of grid.get(`${gx},${gy}`) ?? []) {
            if (o === d || o.id < d.id) continue;
            let dx = o.x - d.x;
            let dy = o.y - d.y;
            let dist = Math.hypot(dx, dy);
            const min = pad(d) + pad(o);
            if (dist >= min) continue;
            if (dist < 0.01) {
              dx = Math.cos(d.angle);
              dy = Math.sin(d.angle);
              dist = 1;
            }
            const push = ((min - dist) / dist) * 0.5;
            // Pillars and already-placed nodes hold their place; newcomers yield.
            const wd = d.depth === 0 || d.kept ? 0.15 : 1;
            const wo = o.depth === 0 || o.kept ? 0.15 : 1;
            const sum = wd + wo;
            d.x -= dx * push * (wd / sum);
            d.y -= dy * push * (wd / sum);
            o.x += dx * push * (wo / sum);
            o.y += dy * push * (wo / sum);
          }
    }
  }
}
