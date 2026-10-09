import { html } from "htm/preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { NotFound, fetchMap, onMapChange } from "./api.js";
import { AGENT_LABEL, formatDate, formatDateTime, lensLabel, relativeTime, toneOf } from "./format.js";
import { IconFit, IconLegend, IconOutline, IconPause, IconPlay, IconSearch } from "./icons.js";
import { byCreation, pillarsOf } from "./layout.js";
import { plainText } from "./markdown.js";
import { NodePanel } from "./panel.js";
import { pigmentOf, prefersReducedMotion } from "./palette.js";
import { Renderer } from "./renderer.js";
import { t } from "./i18n.js";
import { LangButton, ThemeButton, mapHash, navigate, useTheme } from "./shell.js";

const PANEL_W = 460;
const panelWidth = (wide) => (window.innerWidth <= 820 ? 0 : wide ? Math.min(760, window.innerWidth * 0.62) : PANEL_W);

export function MapView({ slug, nodeId }) {
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [replay, setReplay] = useState(null); // { index, map } while scrubbing history
  const [playing, setPlaying] = useState(false);
  const [tip, setTip] = useState(null);
  const [showOutline, setShowOutline] = useState(false);
  const [showLegend, setShowLegend] = useState(() => localStorage.getItem("dm-legend") === "1");
  const [announce, setAnnounce] = useState("");
  const [panelWide, setPanelWide] = useState(false);
  const canvasRef = useRef(null);
  const renderer = useRef(null);
  const theme = useTheme();

  // ---------- data ----------
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchMap(slug).then(
        (m) => alive && setLive(m),
        (e) => alive && setError(e instanceof NotFound ? "deleted" : e.message),
      );
    load();
    const off = onMapChange((changed) => changed === slug && load());
    return () => {
      alive = false;
      off();
    };
  }, [slug]);

  const shown = replay?.map ?? live;
  const nodesById = useMemo(() => new Map((shown?.nodes ?? []).map((n) => [n.id, n])), [shown]);

  useEffect(() => {
    if (live) document.title = `${live.title} · ${t("appName")}`;
  }, [live?.title]);

  // Announce structural growth for screen readers.
  const prevIds = useRef(null);
  useEffect(() => {
    if (!live) return;
    const ids = new Set(live.nodes.map((n) => n.id));
    if (prevIds.current) {
      const added = live.nodes.filter((n) => !prevIds.current.has(n.id)).map((n) => n.title);
      if (added.length) setAnnounce(t("added", added.join(", ")));
    }
    prevIds.current = ids;
  }, [live]);

  // ---------- renderer ----------
  useEffect(() => {
    const r = new Renderer(canvasRef.current);
    renderer.current = r;
    window.__dm = r; // used by the visual review harness
    r.onSelect = (id) => navigate(mapHash(slug, id));
    r.onHover = (id, x, y) => setTip(id ? { id, x, y } : null);
    const redraw = () => r.kick();
    document.fonts?.addEventListener("loadingdone", redraw);
    return () => {
      r.destroy();
      document.fonts?.removeEventListener("loadingdone", redraw);
    };
  }, [slug]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!shown || !renderer.current) return;
    renderer.current.setGraph(shown, { ripple: initialized.current });
    initialized.current = true;
  }, [shown]);

  useEffect(() => renderer.current?.setTheme(theme), [theme]);

  // Keep canvas labels out from under the page chrome.
  useEffect(() => {
    const measure = () => {
      const head = document.querySelector(".map-head")?.getBoundingClientRect();
      // The whole header band is off-limits to labels, not just the text boxes inside it.
      const band = head ? [{ x: 0, y: 0, w: window.innerWidth, h: Math.round(head.bottom + 6) }] : [];
      const rects = [...band, ...[...document.querySelectorAll(".toolbar, .legend, .timeline, .outline, .panel")].map((el) => {
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left - 8), y: Math.round(b.top - 6), w: Math.round(b.width + 16), h: Math.round(b.height + 12) };
      })];
      renderer.current?.setReserved(rects);
      // Fit the map into the space the chrome leaves free.
      document.documentElement.style.setProperty("--head-bottom", `${Math.round(head?.bottom ?? 240)}px`);
      const bottomChrome = [...document.querySelectorAll(".timeline, .toolbar")].map((el) => el.getBoundingClientRect()).filter((b) => b.top > window.innerHeight / 2);
      const bottom = bottomChrome.length ? window.innerHeight - Math.min(...bottomChrome.map((b) => b.top)) : 24;
      const narrow = window.innerWidth <= 820;
      renderer.current?.setInsets({ top: Math.round((head?.bottom ?? 120) + (narrow ? 20 : 36)), bottom: Math.round(bottom + 52), left: narrow ? 24 : 64, right: narrow ? 24 : 64 });
    };
    measure();
    const t = setTimeout(measure, 600); // after panels finish sliding in
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  });

  const selected = nodeId && live?.nodes.some((n) => n.id === nodeId) ? nodeId : null;
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.setSelected(selected);
    r.focusOffsetX = selected ? panelWidth(panelWide) / 2 : 0;
    const narrow = window.innerWidth <= 820;
    // The visible part of the canvas: left of the side panel, or above the bottom sheet on phones.
    const headBottom = document.querySelector(".map-head")?.getBoundingClientRect().bottom ?? 240;
    r.focusArea = narrow
      ? { x0: 0, y0: 0, x1: window.innerWidth, y1: window.innerHeight * 0.3 }
      : { x0: 24, y0: headBottom + 12, x1: window.innerWidth - panelWidth(panelWide), y1: window.innerHeight - 96 };
    if (selected) r.focus(selected);
  }, [selected, panelWide, live !== null]);

  // ---------- replay ----------
  const scrub = (index) => {
    if (!live) return;
    if (index >= live.batches.length - 1) return setReplay(null);
    fetchMap(slug, index).then((map) => setReplay({ index, map }));
  };
  useEffect(() => {
    if (!playing || !live) return;
    const n = live.batches.length;
    const step = prefersReducedMotion() ? 400 : Math.max(160, Math.min(700, 16000 / Math.max(1, n)));
    let index = replay?.index ?? -1;
    const timer = setInterval(() => {
      index += 1;
      if (index >= n - 1) {
        setPlaying(false);
        setReplay(null);
        clearInterval(timer);
      } else scrub(index);
    }, step);
    return () => clearInterval(timer);
  }, [playing]);

  // ---------- keyboard ----------
  const onCanvasKey = (e) => {
    if (!shown || !renderer.current) return;
    const go = (id) => {
      if (!id) return;
      e.preventDefault();
      navigate(mapHash(slug, id));
    };
    const cur = selected ? nodesById.get(selected) : null;
    const first = pillarsOf(shown.nodes)[0]?.id;
    const siblings = cur ? shown.nodes.filter((n) => n.parentId === cur.parentId).sort(byCreation) : [];
    const idx = cur ? siblings.findIndex((n) => n.id === cur.id) : -1;
    switch (e.key) {
      case "ArrowUp":
        return go(cur ? cur.parentId : first);
      case "ArrowDown":
        return go(cur ? shown.nodes.filter((n) => n.parentId === cur.id).sort(byCreation)[0]?.id : first);
      case "ArrowRight":
        return go(cur ? siblings[(idx + 1) % siblings.length]?.id : first);
      case "ArrowLeft":
        return go(cur ? siblings[(idx - 1 + siblings.length) % siblings.length]?.id : first);
      case "Escape":
        return navigate(mapHash(slug));
      case "f":
        return renderer.current.fit();
      case "+":
      case "=":
        return renderer.current.zoomBy(1.25);
      case "-":
        return renderer.current.zoomBy(0.8);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && selected && !(e.target instanceof HTMLInputElement) && e.target !== canvasRef.current) navigate(mapHash(slug));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, slug]);

  if (error === "deleted")
    return html`<div class="loading gone"><p>${t("mapDeleted")}</p><a class="back-link" href="#/">${t("allMaps")}</a></div>`;
  if (error) return html`<div class="loading">${t("loadFailed", error)}</div>`;

  const tipNode = tip && nodesById.get(tip.id);
  const pillarCount = live ? pillarsOf(live.nodes).length : 0;

  return html`<div class=${selected ? "with-panel" : ""} style=${{ "--panel-w": `${selected ? panelWidth(panelWide) || window.innerWidth : PANEL_W}px` }}>
    <canvas
      ref=${canvasRef}
      class="map-canvas"
      tabindex="0"
      role="application"
      aria-label=${t("canvasLabel", live?.title ?? "")}
      onKeyDown=${onCanvasKey}
    ></canvas>
    <div class="canvas-focus"></div>
    <div class="top-fade" aria-hidden="true"></div>
    <div class="sr-only" aria-live="polite">${announce}</div>

    ${live &&
    html`<header class="map-head">
      <a class="back-link" href="#/">${t("allMaps")}</a>
      <h1 class="map-title">${live.title}</h1>
      ${live.purpose && html`<p class="map-purpose">${live.purpose}</p>`}
      <div class="map-stats">
        ${replay
          ? html`<span class="replaying">${t("replaying", replay.map.nodes.length, live.nodes.length)}</span>`
          : html`<span>${t("nodes", live.nodes.length)}</span>`}
        <span>${t("pillars", pillarCount)}</span>
        <span>${t("sessions", live.sessions)}</span>
        <span>${t("updated", relativeTime(live.updatedAt))}</span>
      </div>
    </header>`}
    ${live && live.nodes.length === 0 && html`<div class="empty-map"><p>${t("emptyMap")}</p></div>`}

    <div class="toolbar">
      ${shown && html`<${Search} map=${shown} slug=${slug} onHighlight=${(ids) => renderer.current?.setHighlight(ids)} />`}
      <button class="icon-btn" aria-pressed=${showOutline} aria-label=${t("outline")} title=${t("outline")} onClick=${() => setShowOutline((v) => !v)}><${IconOutline} /></button>
      <button class="icon-btn" aria-pressed=${showLegend} aria-label=${t("legend")} title=${t("legend")} onClick=${() => setShowLegend((v) => (localStorage.setItem("dm-legend", v ? "0" : "1"), !v))}><${IconLegend} /></button>
      <button class="icon-btn" aria-label=${t("fit")} title=${t("fit")} onClick=${() => renderer.current?.fit()}><${IconFit} /></button>
      <${LangButton} />
      <${ThemeButton} />
    </div>

    ${showLegend && shown?.nodes.length > 0 && html`<${Legend} map=${shown} theme=${theme} />`}
    ${showOutline && shown && html`<${Outline} map=${shown} slug=${slug} selected=${selected} theme=${theme} />`}
    ${tipNode &&
    tip.id !== selected &&
    html`<div class="tooltip" style=${tipStyle(tip)}>
      <div class="kicker">${lensLabel(shown.lens.kinds, tipNode.kind)} · ${lensLabel(shown.lens.statuses, tipNode.status)}</div>
      <strong>${tipNode.title}</strong>
      ${tipNode.summary && html`<p>${plainText(tipNode.summary)}</p>`}
    </div>`}
    ${live?.batches.length > 0 &&
    live.nodes.length > 0 &&
    html`<${Timeline}
      batches=${live.batches}
      theme=${theme}
      index=${replay?.index ?? null}
      playing=${playing}
      updatedAt=${live.updatedAt}
      onScrub=${(i) => {
        setPlaying(false);
        scrub(i);
      }}
      onPlay=${() => {
        if (playing) return setPlaying(false);
        if (!replay) scrub(0);
        setPlaying(true);
      }}
    />`}
    ${selected &&
    live &&
    html`<${NodePanel}
      key=${selected}
      slug=${slug}
      map=${live}
      nodeId=${selected}
      theme=${theme}
      wide=${panelWide}
      onWide=${setPanelWide}
      onSelect=${(id) => navigate(mapHash(slug, id))}
      onClose=${() => {
        setPanelWide(false);
        navigate(mapHash(slug));
      }}
    />`}
  </div>`;
}

/** Hover cards open outward, away from the centre of the map, where neighbours are fewer. */
function tipStyle(tip) {
  const right = tip.x > window.innerWidth / 2;
  const below = tip.y > window.innerHeight / 2;
  return {
    left: right ? `${Math.min(tip.x + 22, window.innerWidth - 320)}px` : "auto",
    right: right ? "auto" : `${Math.min(window.innerWidth - tip.x + 22, window.innerWidth - 320)}px`,
    top: below ? `${tip.y + 22}px` : "auto",
    bottom: below ? "auto" : `${window.innerHeight - tip.y + 22}px`,
  };
}

function Legend({ map, theme }) {
  const pillars = pillarsOf(map.nodes);
  return html`<aside class="legend" aria-label=${t("legend")}>
    <div>
      <div class="kicker legend-kicker">${t("legendPillars")}</div>
      <div class="legend-row">
        ${pillars.map((p, i) => html`<span key=${p.id}><i class="swatch" style=${{ "--c": pigmentOf(i, theme) }}></i>${p.title}</span>`)}
      </div>
    </div>
    <div>
      <div class="kicker legend-kicker">${t("legendStatus")}</div>
      <div class="legend-row">
        ${map.lens.statuses.map((s) => html`<span key=${s.id}><i class="tone-dot" data-tone=${s.tone}></i>${s.label}</span>`)}
      </div>
    </div>
  </aside>`;
}

function Search({ map, slug, onHighlight }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return map.nodes
      .map((n) => {
        const title = n.title.toLowerCase();
        return { n, score: title.startsWith(term) ? 3 : title.includes(term) ? 2 : n.summary.toLowerCase().includes(term) ? 1 : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => r.n);
  }, [q, map]);

  useEffect(() => {
    onHighlight(results.length ? new Set(results.map((n) => n.id)) : null);
    setActive(0);
  }, [results]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (n) => {
    setQ("");
    onHighlight(null);
    inputRef.current?.blur();
    navigate(mapHash(slug, n.id));
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
    else if (e.key === "Enter" && results[active]) pick(results[active]);
    else if (e.key === "Escape") {
      setQ("");
      e.currentTarget.blur();
    } else return;
    e.preventDefault();
  };

  return html`<div class="search" role="search">
    <${IconSearch} />
    <input ref=${inputRef} value=${q} placeholder=${t("search")} aria-label=${t("searchLabel")} aria-controls=${q.trim() ? "search-results" : null} aria-expanded=${q.trim() ? "true" : "false"} role="combobox" onInput=${(e) => setQ(e.currentTarget.value)} onKeyDown=${onKeyDown} />
    ${q.trim() &&
    html`<ul class="search-results" id="search-results" role="listbox" aria-label=${t("searchResults")}>
      ${results.length === 0 && html`<li class="search-empty" role="option" aria-disabled="true" aria-selected="false">${t("noMatches")}</li>`}
      ${results.map(
        (n, i) => html`<li key=${n.id} role="option" aria-selected=${i === active}>
          <button tabindex="-1" onClick=${() => pick(n)}>
            <i class="tone-dot" data-tone=${toneOf(map.lens, n.status)}></i>
            ${n.title}
            <small>${lensLabel(map.lens.kinds, n.kind)}</small>
          </button>
        </li>`,
      )}
    </ul>`}
  </div>`;
}

function Outline({ map, slug, selected, theme }) {
  const tree = (parentId, color) => {
    const kids = parentId === null ? pillarsOf(map.nodes) : map.nodes.filter((n) => n.parentId === parentId).sort(byCreation);
    if (!kids.length) return null;
    return html`<ul>
      ${kids.map((n, i) => {
        const c = color ?? pigmentOf(i, theme);
        return html`<li key=${n.id}>
          <button aria-current=${n.id === selected ? "true" : null} onClick=${() => navigate(mapHash(slug, n.id))}>
            <i class="tone-dot" data-tone=${toneOf(map.lens, n.status)} style=${{ "--c": c }}></i>${n.title}
          </button>
          ${tree(n.id, c)}
        </li>`;
      })}
    </ul>`;
  };
  return html`<nav class="outline" aria-label=${t("outlineLabel")}>${map.nodes.length ? tree(null) : html`<p class="search-empty">${t("noNodes")}</p>`}</nav>`;
}

function Timeline({ batches, index, playing, updatedAt, onScrub, onPlay, theme }) {
  const n = batches.length;
  const cur = index ?? n - 1;
  // Drops sit along real time: each pause between conversations widens the gap a little
  // (logarithmically), so days apart read as days apart without long empty stretches.
  const offsets = [0];
  for (let i = 1; i < n; i++) {
    const hours = Math.max(0, (new Date(batches[i].at) - new Date(batches[i - 1].at)) / 3.6e6);
    offsets.push(offsets[i - 1] + 1 + Math.log1p(hours) * 1.4);
  }
  const span = offsets[n - 1] || 1;
  const pos = (i) => (n <= 1 ? 100 : (offsets[i] / span) * 100);
  const trackRef = useRef(null);
  const scrubAt = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    onScrub(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * (n - 1)));
  };
  const days = [];
  for (const [i, b] of batches.entries()) {
    const d = new Date(b.at);
    const label = formatDate(b.at);
    if (days.at(-1)?.label !== label) days.push({ i, label });
  }
  const shownDays = days.filter((d, k) => k === 0 || pos(d.i) - pos(days[k - 1].i) > 6);
  const onKeyDown = (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowDown") onScrub(Math.max(0, cur - 1));
    else if (k === "ArrowRight" || k === "ArrowUp") onScrub(Math.min(n - 1, cur + 1));
    else if (k === "Home") onScrub(0);
    else if (k === "End") onScrub(n - 1);
    else return;
    e.preventDefault();
  };

  // Sparse histories get a short track; long ones use the full width.
  const trackStyle = { maxWidth: `${Math.max(140, (n - 1) * 110)}px` };
  return html`<div class="timeline">
    <button class="icon-btn" disabled=${n < 2} onClick=${onPlay} aria-label=${t(playing ? "pause" : "play")} title=${t(playing ? "pause" : "play")}>
      ${playing ? html`<${IconPause} />` : html`<${IconPlay} />`}
    </button>
    <div
      ref=${trackRef}
      class="track"
      style=${trackStyle}
      role="slider"
      tabindex="0"
      aria-label=${t("timeline")}
      aria-valuemin="1"
      aria-valuemax=${n}
      aria-valuenow=${cur + 1}
      aria-valuetext=${formatDateTime(batches[cur].at)}
      onPointerDown=${(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubAt(e.clientX);
      }}
      onPointerMove=${(e) => e.buttons && scrubAt(e.clientX)}
      onKeyDown=${onKeyDown}
    >
      ${shownDays.map((d) => html`<span key=${d.i} class="day-mark" style=${{ left: `${pos(d.i)}%` }}>${d.label}</span>`)}
      <div class="track-fill" style=${{ width: `${pos(cur)}%` }}></div>
      ${batches.map((b, i) => {
        // Each moment of growth is a drop of ink: size by how much grew, tint by where it grew.
        const size = Math.min(28, 6 + Math.sqrt(b.added) * 4.2 + Math.sqrt(b.changed) * 1.6);
        const color = b.pillar === null ? "var(--ink-3)" : pigmentOf(b.pillar, theme);
        const what = b.added ? t("grewNodes", b.added) : b.changed ? t("changed", b.changed) : t("discussed");
        return html`<span
          key=${b.id}
          class=${`drop${i <= cur ? " past" : ""}`}
          style=${{ left: `${pos(i)}%`, "--s": `${size}px`, "--c": color }}
          title=${`${formatDateTime(b.at)} · ${AGENT_LABEL[b.agent] ?? ""} · ${what}`}
        ></span>`;
      })}
      <div class="thumb" style=${{ left: `${pos(cur)}%` }}></div>
    </div>
    <div class="timeline-label" aria-live="polite">
      ${index === null ? t("live", relativeTime(updatedAt)) : html`${t("replayAt")} <b>${formatDateTime(batches[cur].at)}</b>`}
    </div>
  </div>`;
}
