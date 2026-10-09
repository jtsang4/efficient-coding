// Visual tokens shared by CSS and the canvas. Pillar lineages are painted in traditional
// mineral pigments; status tone is expressed as ink density so any lens renders consistently.

export const PIGMENTS = [
  { name: "靛青", light: "#2F4C80", dark: "#86A8EA" },
  { name: "石绿", light: "#2C7764", dark: "#6FD0B5" },
  { name: "赭石", light: "#A2581F", dark: "#EBA36B" },
  { name: "青莲", light: "#684A8A", dark: "#BBA0E4" },
  { name: "胭脂", light: "#A0344E", dark: "#F08DA6" },
  { name: "藤黄", light: "#8F7110", dark: "#E6C55E" },
  { name: "黛", light: "#3C5664", dark: "#98B8C8" },
];

export const TOKENS = {
  light: { paper: "#F4F0E7", paper2: "#ECE6D9", ink: "#1C1B18", ink2: "#46423B", ink3: "#6A655A", accent: "#C23B22", muted: "#A39D90" },
  dark: { paper: "#0F1013", paper2: "#17181C", ink: "#EDE7DB", ink2: "#BDB6A8", ink3: "#948E82", accent: "#FF6B4E", muted: "#4F4C47" },
};

export const FONT_DISPLAY = `"Fraunces", "Noto Serif SC", "Songti SC", Georgia, serif`;
export const FONT_BODY = `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;

export function currentTheme() {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const pigmentOf = (index, theme) => PIGMENTS[((index % PIGMENTS.length) + PIGMENTS.length) % PIGMENTS.length][theme];

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- theme mode (auto / light / dark), persisted locally ----------

export function themeMode() {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "auto";
}

export function cycleTheme() {
  const mode = themeMode();
  const next = mode === "auto" ? (currentTheme() === "dark" ? "light" : "dark") : mode === "dark" ? "light" : "auto";
  if (next === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try {
    next === "auto" ? localStorage.removeItem("dm-theme") : localStorage.setItem("dm-theme", next);
  } catch {}
  window.dispatchEvent(new Event("dm-theme"));
}

export function onThemeChange(fn) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const handler = () => fn(currentTheme());
  mq.addEventListener("change", handler);
  window.addEventListener("dm-theme", handler);
  return () => {
    mq.removeEventListener("change", handler);
    window.removeEventListener("dm-theme", handler);
  };
}
