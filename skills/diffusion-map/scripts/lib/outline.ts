// Text renderings of a map: the outline the agent reads to orient itself, and a Markdown export.
import { type MapNode, type MapState, depthOf } from "./model";

const childrenOf = (state: MapState, parentId: string | null) =>
  [...state.nodes.values()].filter((n) => n.parentId === parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const labelOf = (items: { id: string; label: string }[], id: string) => items.find((i) => i.id === id)?.label ?? id;

export function outline(state: MapState): string {
  const { lens } = state;
  const lines: string[] = [
    `# ${state.title}  (map: ${state.slug})`,
    ...(state.purpose ? [`purpose: ${state.purpose}`] : []),
    `lens: pillar = ${lens.pillar}`,
    `  kinds: ${lens.kinds.map((k) => k.id).join(", ")}`,
    `  statuses: ${lens.statuses.map((s) => `${s.id}(${s.tone})`).join(", ")}`,
    `  relations: ${lens.relations.map((r) => r.id).join(", ")}`,
    `${state.nodes.size} nodes · ${state.edges.size} cross-links · updated ${state.updatedAt}`,
    "",
  ];

  const walk = (node: MapNode, indent: string) => {
    const sessions = node.sessions.length ? ` · ${node.sessions.length} session${node.sessions.length > 1 ? "s" : ""}` : "";
    lines.push(`${indent}- ${node.title} [${node.id}] ${node.kind} · ${node.status}${sessions}`);
    for (const child of childrenOf(state, node.id)) walk(child, `${indent}  `);
  };
  for (const pillar of childrenOf(state, null)) walk(pillar, "");

  if (state.edges.size) {
    lines.push("", "cross-links:");
    for (const e of state.edges.values())
      lines.push(`  ${e.from} —${e.relation}→ ${e.to}${e.label ? ` (${e.label})` : ""}  [${e.id}]`);
  }

  const frontier = [...state.nodes.values()].filter((n) => lens.statuses.find((s) => s.id === n.status)?.tone === "open");
  if (frontier.length) lines.push("", `frontier (not yet unfolded): ${frontier.map((n) => n.id).join(", ")}`);
  return lines.join("\n");
}

export function exportMarkdown(state: MapState): string {
  const { lens } = state;
  const out: string[] = [`# ${state.title}`, ""];
  if (state.purpose) out.push(`> ${state.purpose}`, "");
  const walk = (node: MapNode) => {
    const level = Math.min(depthOf(state, node.id) + 2, 6);
    out.push(`${"#".repeat(level)} ${node.title}`, "");
    out.push(`*${labelOf(lens.kinds, node.kind)} · ${labelOf(lens.statuses, node.status)}*`, "");
    if (node.summary.trim()) out.push(node.summary.trim(), "");
    const links = [...state.edges.values()].filter((e) => e.from === node.id);
    for (const e of links) out.push(`- ${labelOf(lens.relations, e.relation)} → ${state.nodes.get(e.to)?.title ?? e.to}`);
    if (links.length) out.push("");
    for (const child of childrenOf(state, node.id)) walk(child);
  };
  for (const pillar of childrenOf(state, null)) walk(pillar);
  return out.join("\n").trimEnd() + "\n";
}
