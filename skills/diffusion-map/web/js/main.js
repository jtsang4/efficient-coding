import { html } from "htm/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { onStatus, startHeartbeat } from "./api.js";
import { getLang, onLangChange, t } from "./i18n.js";
import { Home } from "./home.js";
import { MapView } from "./map-view.js";

window.__dmReady = true;

function parseRoute() {
  const m = location.hash.match(/^#\/map\/([^/]+)(?:\/node\/([^/]+))?/);
  if (!m) return { name: "home" };
  return { name: "map", slug: decodeURIComponent(m[1]), node: m[2] ? decodeURIComponent(m[2]) : null };
}

function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => onStatus(setOnline), []);
  if (online) return null;
  return html`<div class="banner" role="status">
    <i></i>
    ${t("offline")} <span class="mono">dm serve</span> ${t("offlineTail")}
  </div>`;
}

function App() {
  const [route, setRoute] = useState(parseRoute);
  const [lang, setLangState] = useState(getLang);
  useEffect(() => onLangChange(() => setLangState(getLang())), []);
  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    startHeartbeat();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // Switching language remounts the views so every piece of fixed copy re-reads the dictionary.
  return html`
    ${route.name === "home" ? html`<${Home} key=${lang} />` : html`<${MapView} key=${`${route.slug}:${lang}`} slug=${route.slug} nodeId=${route.node} />`}
    <${OfflineBanner} key=${`o${lang}`} />
  `;
}

document.getElementById("app").replaceChildren();
render(html`<${App} />`, document.getElementById("app"));
