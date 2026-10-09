import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { deleteMap, fetchMap, fetchMaps, onMapChange } from "./api.js";
import { IconTrash } from "./icons.js";
import { relativeTime } from "./format.js";
import { Renderer } from "./renderer.js";
import { t } from "./i18n.js";
import { LangButton, ThemeButton, mapHash, useTheme } from "./shell.js";

function Thumbnail({ slug, version }) {
  const ref = useRef(null);
  const renderer = useRef(null);
  const theme = useTheme();
  const [pillars, setPillars] = useState(null);
  useEffect(() => {
    renderer.current = new Renderer(ref.current, { interactive: false, labels: false });
    return () => renderer.current.destroy();
  }, []);
  useEffect(() => renderer.current.setTheme(theme), [theme]);
  useEffect(() => {
    fetchMap(slug).then((map) => {
      setPillars(map.nodes.filter((n) => !n.parentId).length);
      renderer.current.setGraph(map, { ripple: false });
    });
  }, [slug, version]);
  return html`<div class="map-card-thumb">
    <canvas ref=${ref} aria-hidden="true"></canvas>
    ${pillars === 0 && html`<div class="empty-thumb">${t("notInked")}</div>`}
  </div>`;
}

const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

/** Confirmation for deleting a whole map, in a native modal dialog (focus trap and Esc for free). */
function DeleteDialog({ map, onClose, onDeleted }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    ref.current.showModal();
    ref.current.querySelector(".dialog-cancel")?.focus();
  }, []);
  const confirm = () => {
    setBusy(true);
    deleteMap(map.slug).then(
      () => onDeleted(map.slug),
      (e) => {
        setBusy(false);
        setError(e.message);
      },
    );
  };
  return html`<dialog class="dialog" ref=${ref} onClose=${onClose} onClick=${(e) => e.target === ref.current && ref.current.close()}>
    <h2>${t("deleteTitle", map.title)}</h2>
    <p>${t("deleteBody", t("nodes", map.nodes), t("sessions", map.sessions), formatBytes(map.bytes))}</p>
    <p class="dialog-note">${t("deleteKeep")}</p>
    ${error && html`<p class="dialog-error" role="alert">${t("deleteFailed", error)}</p>`}
    <div class="dialog-actions">
      <button class="dialog-btn dialog-cancel" onClick=${() => ref.current.close()}>${t("cancel")}</button>
      <button class="dialog-btn danger" disabled=${busy} onClick=${confirm}>${busy ? t("deleting") : t("confirmDelete")}</button>
    </div>
  </dialog>`;
}

export function Home() {
  const [maps, setMaps] = useState(null);
  const [deleting, setDeleting] = useState(null);
  useEffect(() => {
    document.title = t("appName");
    // Maps that have grown come first; empty ones wait at the end.
    const load = () =>
      fetchMaps()
        .then((list) => setMaps([...list].sort((a, b) => (a.nodes === 0) - (b.nodes === 0))))
        .catch(() => {});
    load();
    return onMapChange(load);
  }, []);

  return html`<main class="home">
    <div class="home-tools"><${LangButton} /><${ThemeButton} /></div>
    <header class="home-head">
      <div>
        <div class="kicker">${t("appName")} · ${maps ? t("mapsCount", maps.length) : "…"}</div>
        <h1 class="home-title">${t("titleA")} <em>${t("titleB")}</em><i class="home-drop" aria-hidden="true"></i></h1>
      </div>
      <p class="home-lede">${t("lede")}</p>
    </header>

    ${maps &&
    maps.length === 0 &&
    html`<section class="home-empty">
      <h2>${t("noMapsTitle")}</h2>
      <p>${t("noMapsBody")}</p>
    </section>`}

    <div class="map-grid">
      ${maps?.map(
        (m, i) => html`<article class="map-card" style=${{ "--i": i }} key=${m.slug}>
          <${Thumbnail} slug=${m.slug} version=${m.updatedAt} />
          <button class="icon-btn card-delete" aria-label=${t("deleteMap", m.title)} title=${t("deleteMap", m.title)} onClick=${() => setDeleting(m)}><${IconTrash} /></button>
          <div class="map-card-index">${String(i + 1).padStart(2, "0")}</div>
          <h2 class="map-card-title"><a class="map-card-link" href=${mapHash(m.slug)}>${m.title}</a></h2>
          <p class="map-card-purpose">${m.purpose || " "}</p>
          <div class="map-card-meta">
            <span>${t("nodes", m.nodes)}</span>
            <span>${t("sessions", m.sessions)}</span>
            <span>${t("updated", relativeTime(m.updatedAt))}</span>
          </div>
        </article>`,
      )}
    </div>
    ${deleting &&
    html`<${DeleteDialog}
      map=${deleting}
      onClose=${() => setDeleting(null)}
      onDeleted=${(slug) => {
        setDeleting(null);
        setMaps((list) => list.filter((m) => m.slug !== slug));
      }}
    />`}
  </main>`;
}
