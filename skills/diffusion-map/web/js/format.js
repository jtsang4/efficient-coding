import { getLang, t } from "./i18n.js";

const locale = () => (getLang() === "zh" ? "zh-CN" : "en");

export function relativeTime(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60 || diff > 0) return t("now"); // clocks drift; never say "in 3 hours"
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

export function formatDate(iso) {
  const d = new Date(iso);
  return getLang() === "zh" ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const AGENT_LABEL = { "claude-code": "Claude Code", codex: "Codex" };

export const lensLabel = (items, id) => items.find((i) => i.id === id)?.label ?? id;
export const toneOf = (lens, status) => lens.statuses.find((s) => s.id === status)?.tone ?? "active";
