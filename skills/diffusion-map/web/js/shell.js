import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { getLang, setLang, t } from "./i18n.js";
import { IconAuto, IconCheck, IconGlobe, IconMoon, IconSun } from "./icons.js";
import { currentTheme, cycleTheme, onThemeChange, themeMode } from "./palette.js";

export function navigate(hash, replace = false) {
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, "", hash);
  else location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export const mapHash = (slug, node) => `#/map/${encodeURIComponent(slug)}${node ? `/node/${encodeURIComponent(node)}` : ""}`;

/** The resolved theme ("light" | "dark"), following the system unless the user picked one. */
export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => onThemeChange(setTheme), []);
  return theme;
}

export function ThemeButton() {
  const [mode, setMode] = useState(themeMode);
  useEffect(() => onThemeChange(() => setMode(themeMode())), []);
  const label = t(mode === "auto" ? "themeAuto" : mode === "dark" ? "themeDark" : "themeLight");
  const Icon = mode === "auto" ? IconAuto : mode === "dark" ? IconMoon : IconSun;
  return html`<button class="icon-btn" onClick=${cycleTheme} aria-label=${label} title=${label}><${Icon} /></button>`;
}

const LANGS = [
  { id: "en", name: "English" },
  { id: "zh", name: "中文" },
];

/** Interface language menu: a globe button that opens a small list, each language named in itself. */
export function LangButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = getLang();
  useEffect(() => {
    if (!open) return;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && (setOpen(false), ref.current?.querySelector("button")?.focus());
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    ref.current?.querySelector('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const onMenuKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...ref.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  const pick = (id) => {
    setOpen(false);
    if (id !== current) setLang(id);
  };
  return html`<div class="lang-menu" ref=${ref}>
    <button class="icon-btn" aria-haspopup="menu" aria-expanded=${open} aria-label=${t("langLabel")} title=${t("langLabel")} onClick=${() => setOpen((v) => !v)}>
      <${IconGlobe} />
    </button>
    ${open &&
    html`<div class="lang-list" role="menu" aria-label=${t("langLabel")} onKeyDown=${onMenuKey}>
      ${LANGS.map(
        (l) => html`<button key=${l.id} role="menuitemradio" aria-checked=${l.id === current} lang=${l.id === "zh" ? "zh-CN" : "en"} onClick=${() => pick(l.id)}>
          <span>${l.name}</span>
          ${l.id === current && html`<${IconCheck} />`}
        </button>`,
      )}
    </div>`}
  </div>`;
}
