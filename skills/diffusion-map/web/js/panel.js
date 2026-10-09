import { html } from "htm/preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fetchConversation } from "./api.js";
import { AGENT_LABEL, formatDateTime, lensLabel, toneOf } from "./format.js";
import { IconBack, IconClose } from "./icons.js";
import { byCreation, pillarsOf } from "./layout.js";
import { renderMarkdown } from "./markdown.js";
import { t } from "./i18n.js";
import { pigmentOf } from "./palette.js";

const sessionKey = (s) => `${s.agent}:${s.sessionId}`;

function pillarIndexOf(map, byId, id) {
  let cur = byId.get(id);
  while (cur?.parentId && byId.has(cur.parentId)) cur = byId.get(cur.parentId);
  return Math.max(0, pillarsOf(map.nodes).findIndex((p) => p.id === cur?.id));
}

export function NodePanel({ slug, map, nodeId, theme, wide, onWide, onSelect, onClose }) {
  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);
  const node = byId.get(nodeId);
  const { lens } = map;
  const color = pigmentOf(pillarIndexOf(map, byId, nodeId), theme);
  const panelRef = useRef(null);
  const [reading, setReading] = useState(null);

  const path = [];
  for (let cur = byId.get(node.parentId); cur; cur = byId.get(cur.parentId)) path.unshift(cur);
  const children = map.nodes.filter((n) => n.parentId === nodeId).sort(byCreation);
  const relations = map.edges.filter((e) => e.from === nodeId || e.to === nodeId);
  const sessions = [...node.sessions].sort((a, b) => a.at[0].localeCompare(b.at[0]));
  const tone = toneOf(lens, node.status);

  useEffect(() => panelRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => onWide(reading !== null), [reading]);
  useEffect(() => () => onWide(false), []);

  const openSession = (key) => {
    setReading(key);
    requestAnimationFrame(() => panelRef.current?.scrollTo({ top: 0 }));
  };

  return html`<aside class=${`panel${wide ? " wide" : ""}`} ref=${panelRef} tabindex="-1" aria-label=${t("nodeLabel", node.title)}>
    <div class="panel-inner">
      <div class="panel-top">
        ${reading
          ? html`<button class="back-btn" onClick=${() => setReading(null)}><${IconBack} />${t("backToNode")}</button>`
          : html`<nav class="crumbs" aria-label=${t("branch")}>
              ${path.length === 0
                ? html`<span>${map.title}</span>`
                : path.map((p, i) => html`${i > 0 && html`<span aria-hidden="true">›</span>`}<button key=${p.id} onClick=${() => onSelect(p.id)}>${p.title}</button>`)}
            </nav>`}
        <button class="icon-btn" onClick=${onClose} aria-label=${t("close")} title=${t("close")}><${IconClose} /></button>
      </div>

      <div class="node-kicker kicker">
        <i class="tone-dot" data-tone=${tone} style=${{ "--c": color }}></i>
        ${lensLabel(lens.kinds, node.kind)} · ${lensLabel(lens.statuses, node.status)}
      </div>
      <h2 class="node-title">${node.title}</h2>

      ${reading
        ? html`<${Reader} slug=${slug} node=${node} sessions=${sessions} focus=${reading} />`
        : html`
            ${node.summary.trim()
              ? html`<div class="prose" dangerouslySetInnerHTML=${{ __html: renderMarkdown(node.summary) }}></div>`
              : html`<p class="placeholder">${t("noSummary")}</p>`}
            ${children.length > 0 &&
            html`<section class="section">
              <div class="section-head"><h3>${t("children")}</h3><span>${children.length}</span></div>
              <div class="chips">
                ${children.map(
                  (c) => html`<button class="chip" key=${c.id} onClick=${() => onSelect(c.id)}>
                    <i class="tone-dot" data-tone=${toneOf(lens, c.status)} style=${{ "--c": color }}></i>${c.title}
                  </button>`,
                )}
              </div>
            </section>`}
            ${relations.length > 0 &&
            html`<section class="section">
              <div class="section-head"><h3>${t("relations")}</h3><span>${relations.length}</span></div>
              <ul class="link-list">
                ${relations.map((e) => {
                  const outgoing = e.from === nodeId;
                  const other = byId.get(outgoing ? e.to : e.from);
                  if (!other) return null;
                  const rel = lensLabel(lens.relations, e.relation);
                  return html`<li key=${e.id}>
                    <button onClick=${() => onSelect(other.id)}>
                      <span class="ll-title">
                        ${outgoing ? html`<span class="ll-rel">${rel}</span> ${other.title}` : t("relationIn", other.title, rel).map((part, i) => (part === other.title ? html` ${part} ` : html`<span class="ll-rel" key=${i}>${part}</span>`))}
                        ${e.label && html`<span class="ll-label"> · ${e.label}</span>`}
                      </span>
                      <span class="ll-arrow" aria-hidden="true">→</span>
                    </button>
                  </li>`;
                })}
              </ul>
            </section>`}
            <section class="section">
              <div class="section-head"><h3>${t("conversations")}</h3><span>${t("convCount", sessions.length)}</span></div>
              ${sessions.length === 0 && html`<p class="placeholder">${t("noConversations")}</p>`}
              ${sessions.map((s) => html`<${SessionRow} key=${sessionKey(s)} session=${s} onOpen=${() => openSession(sessionKey(s))} />`)}
              ${sessions.length > 1 &&
              html`<p class="read-all"><button class="text-btn" onClick=${() => openSession(sessionKey(sessions[0]))}>${t("readAll", sessions.length)}</button></p>`}
            </section>
          `}
    </div>
  </aside>`;
}

// Neutral glyphs rather than brand logos: a spark for Claude Code, a prompt for Codex.
const AgentMark = ({ agent }) =>
  html`<span class="agent-mark" data-agent=${agent} aria-hidden="true">
    ${agent === "claude-code"
      ? html`<svg viewBox="0 0 24 24"><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" /></svg>`
      : html`<svg viewBox="0 0 24 24"><path d="m5 8 4.5 4L5 16M12 17h7" /></svg>`}
  </span>`;

function SessionRow({ session, onOpen }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(session.sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  // A stretched button opens the conversation; the copy button sits above it.
  return html`<div class="session">
    <${AgentMark} agent=${session.agent} />
    <button class="session-open" onClick=${onOpen} aria-label=${t("openConversation", AGENT_LABEL[session.agent], formatDateTime(session.at[0]))}>
      <span class="session-agent">${AGENT_LABEL[session.agent]}</span>
    </button>
    <span class="session-when">${formatDateTime(session.at[0])}</span>
    <span class="session-sub">
      <button class="copy-btn mono" onClick=${copy} title=${t("copyId")} aria-label=${t("copyIdLabel", session.sessionId)}>${copied ? t("copied") : session.sessionId.slice(0, 8)}</button>
      <span>${t("discussedTimes", session.at.length)}</span>
      <span class="mono" title=${session.cwd}>${session.cwd.replace(/^\/Users\/[^/]+/, "~")}</span>
    </span>
  </div>`;
}

function Reader({ slug, node, sessions, focus }) {
  const refs = useRef(new Map());
  useEffect(() => {
    const el = refs.current.get(focus);
    if (el && sessionKey(sessions[0]) !== focus) setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
  }, [focus]);
  return html`<div>
    ${sessions.map(
      (s) => html`<section key=${sessionKey(s)} class="conv-session" ref=${(el) => el && refs.current.set(sessionKey(s), el)}>
        <${SessionConversation} slug=${slug} session=${s} node=${node} />
      </section>`,
    )}
  </div>`;
}

function SessionConversation({ slug, session, node }) {
  const [conv, setConv] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    fetchConversation(slug, session.agent, session.sessionId, node.id).then(setConv, (e) => setError(e.message));
  }, [slug, session.sessionId]);

  // Relevant turns stay open; everything between them collapses into an expandable gap.
  const segments = useMemo(() => {
    if (!conv) return [];
    const out = [];
    let cursor = 0;
    for (const [a, b] of conv.ranges) {
      if (a > cursor) out.push({ kind: "gap", from: cursor, to: a - 1 });
      out.push({ kind: "turn", from: a, to: b });
      cursor = b + 1;
    }
    if (cursor < conv.items.length) out.push({ kind: "gap", from: cursor, to: conv.items.length - 1 });
    return out;
  }, [conv]);

  const agentName = AGENT_LABEL[session.agent];
  const origin = conv && t("origin")[conv.origin];
  return html`
    <div class="conv-head">
      <${AgentMark} agent=${session.agent} />
      <div class="conv-head-meta">
        <strong>${agentName} · ${formatDateTime(session.at[0])}</strong>
        <span class="mono" title=${session.sessionId}>${session.sessionId.slice(0, 8)} · ${session.cwd.replace(/^\/Users\/[^/]+/, "~")}</span>
      </div>
      ${origin && html`<span class="origin">${origin}</span>`}
    </div>
    ${error && html`<p class="conv-missing">${t("readFailed", error)}</p>`}
    ${!conv && !error && html`<p class="conv-missing">${t("reading")}</p>`}
    ${conv?.items.length === 0 && html`<p class="conv-missing">${t("gone")}</p>`}
    ${conv &&
    segments.map((seg, i) => {
      if (seg.kind === "gap" && !expanded.has(i)) {
        const count = conv.items.slice(seg.from, seg.to + 1).filter((it) => it.kind === "message").length;
        if (count === 0) return null;
        return html`<button key=${i} class="gap-btn" onClick=${() => setExpanded(new Set([...expanded, i]))}>${t("expand", count)}</button>`;
      }
      const relevant = seg.kind === "turn";
      return html`<div key=${i} class=${`turn${relevant ? " relevant" : ""}`}>
        ${relevant && html`<span class="relevant-tag">${t("relevant", node.title)}</span>`}
        ${conv.items.slice(seg.from, seg.to + 1).map((it) => html`<${Item} key=${it.key} item=${it} agentName=${agentName} />`)}
      </div>`;
    })}
  `;
}

function Item({ item, agentName }) {
  if (item.kind === "tools") {
    const entries = Object.entries(item.tools);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return html`<div class="tools-row">
      <span>⟡ ${t("toolCalls", total)}</span>
      ${entries.map(([name, n]) => html`<span key=${name}>${name}${n > 1 ? ` ×${n}` : ""}</span>`)}
    </div>`;
  }
  return html`<div class=${`msg ${item.role}`}>
    <div class="msg-who">${item.role === "user" ? t("you") : agentName} <span class="msg-time">· ${formatDateTime(item.at)}</span></div>
    ${item.role === "user"
      ? html`<div class="msg-body">${item.text}</div>`
      : html`<div class="msg-body prose" dangerouslySetInnerHTML=${{ __html: renderMarkdown(item.text) }}></div>`}
  </div>`;
}
